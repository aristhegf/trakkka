# AssetWatch — Database Schema (Phase 1 design)

Target: Supabase Postgres 15+ with PostGIS, pg_cron, pg_net, Vault. All ids are UUID v4
(`gen_random_uuid()`) except `locations.id` (bigint identity, partition friendly). Every table has
`created_at timestamptz default now()` and, where rows mutate, `updated_at` maintained by trigger.

Design rules that drive the schema:

1. **Every displayed location has source, timestamp, accuracy.** `locations` and `asset_states` both
   carry `recorded_at`, `received_at`, `accuracy_m`, `source`. Nothing is rendered without them.
2. **Hot writes are separated from cold metadata.** `assets` (edited rarely) vs `asset_states`
   (written on every location). Realtime subscribes to the hot table only.
3. **Freshness is never stored.** LIVE / RECENT / STALE / OFFLINE / UNKNOWN is derived from
   `now() - last_location_at` and provider thresholds, in SQL (view) and in the client (ticking).
4. **Out-of-order safe.** `asset_states` is updated only when the incoming `recorded_at` is newer;
   history rows are still kept. Idempotency key = `(asset_id, source, provider_event_id)`.
5. **Provider secrets never sit in an RLS-readable table.** They live in Supabase Vault and are
   referenced by id from a service-role-only table.
6. **RLS on every table.** Ownership is resolved through `assets.owner_id`, and sharing through
   `location_sharing_permissions` (schema exists now; UI is P3).

---

## Enums

```sql
create type asset_type        as enum ('device','pet','vehicle','other');
create type asset_status      as enum ('active','archived','lost');
create type connection_status as enum ('online','offline','unknown');
create type movement_state    as enum ('moving','stationary','unknown');
create type geofence_kind     as enum ('circle','polygon');
create type geofence_event_t  as enum ('enter','exit');
create type alert_type        as enum (
  'geofence_enter','geofence_exit','battery_low','battery_critical','tracker_offline',
  'no_report','speed_limit','unexpected_movement','location_unavailable');
create type alert_severity    as enum ('info','warning','critical');
create type notif_channel     as enum ('in_app','email','push','sms');
create type notif_status      as enum ('queued','sent','failed','skipped');
create type ingest_status     as enum ('accepted','duplicate','out_of_order','rejected','error');
create type share_scope       as enum ('live','history');
```

## Tables

### `profiles`
One row per auth user, created by trigger on `auth.users` insert.

| column | type | notes |
|---|---|---|
| id | uuid PK → auth.users(id) on delete cascade | |
| display_name | text | |
| avatar_url | text | |
| timezone | text default 'Africa/Lagos' | for history day boundaries |
| home_geofence_id | uuid → geofences | used for "time away from home" |
| is_admin | boolean default false | gates `/admin`; set only via SQL, never via API |
| created_at / updated_at | timestamptz | |

RLS: `select/update` where `id = auth.uid()`. No insert/delete from clients (trigger + account deletion RPC).

### `tracking_providers` (reference data, seeded by migration)
| column | type | notes |
|---|---|---|
| key | text PK | `simulated`, `manual`, `browser_geolocation`, `ios_companion`, `traccar`, `flespi`, `apple_findmy_reported` |
| name | text | |
| kind | text | `push_webhook`, `poll`, `client_reported`, `manual` |
| capabilities | jsonb | `{"battery":true,"speed":true,"heading":true,"ignition":false,"accuracy":true,"history":true}` |
| live_after_s / recent_after_s / stale_after_s | int | freshness thresholds. e.g. GPS tracker 30/300/900; Find My reported 300/3600/86400 |
| offline_after_s | int | no report for this long ⇒ `no_report` alert candidate |
| min_sample_interval_s | int | history down-sampling floor |
| is_active | boolean | |

RLS: readable by `authenticated`; writable by nobody (migrations only).

### `assets`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid → profiles(id) on delete cascade, not null | |
| name | text not null, check length ≤ 80 | |
| type | asset_type not null | |
| status | asset_status default 'active' | |
| photo_path | text | Supabase Storage path, private bucket `asset-photos/{owner_id}/…` |
| description | text | |
| icon | text | optional override; default derived from type |
| color | text | marker colour |
| tracking_provider_key | text → tracking_providers(key) | how location arrives |
| is_tracking_enabled | boolean default true | user-controlled kill switch |
| created_at / updated_at / deleted_at | timestamptz | soft delete + hard purge job |

Indexes: `(owner_id) where deleted_at is null`, `(owner_id, type)`.

RLS: owner full access; grantees in `location_sharing_permissions` get `select` (see policy helper below).

### `asset_states` (hot, 1:1 with assets)
| column | type | notes |
|---|---|---|
| asset_id | uuid PK → assets(id) on delete cascade | |
| owner_id | uuid not null | denormalised so RLS and broadcast avoid a join |
| geom | geography(Point,4326) | current/last known position |
| latitude / longitude | double precision | generated from geom for cheap client reads |
| accuracy_m | real | horizontal accuracy in metres, null = unknown |
| altitude_m | real | |
| speed_mps | real | |
| heading_deg | real check 0–360 | |
| battery_level | smallint check 0–100 | null = unavailable |
| battery_updated_at | timestamptz | |
| connection_status | connection_status default 'unknown' | provider-reported only; never inferred |
| movement_state | movement_state default 'unknown' | derived at ingest: speed > threshold or displacement > accuracy |
| last_location_at | timestamptz | = `recorded_at` of the newest accepted location |
| last_received_at | timestamptz | server receive time of the newest event (any status) |
| last_location_id | bigint | pointer into `locations` |
| last_source | text | provider key that produced the current position |
| last_provider_event_id | text | |
| place_label | text | reverse-geocoded name ("Lekki Phase 1"), cached |
| place_geohash | text | cache key for reverse geocode (precision 7 ≈ 150 m) |
| updated_at | timestamptz | |

Indexes: `(owner_id)`, GIST on `geom`.

RLS: same as `assets`. Only `SECURITY DEFINER` ingest function writes it; clients cannot insert/update.

**Realtime**: trigger `AFTER UPDATE` → `realtime.broadcast_changes()` to topic `owner:{owner_id}` (private channel, RLS-authorised). One channel per user regardless of asset count.

### `pet_profiles` / `vehicle_profiles` / `device_profiles` (1:1 with assets, keyed by `asset_id`)

`pet_profiles`: species, breed, sex, date_of_birth, microchip_id, weight_kg, emergency_contact_name, emergency_contact_phone, medical_notes, notes.

`vehicle_profiles`: make, model, year (int check 1950–2100), registration_number, vin (check length 17 when present), color, fuel_type (`petrol|diesel|electric|hybrid|unknown`), odometer_km, fuel_level_pct, ignition_on (boolean, provider-reported), speed_limit_kph (per-vehicle alert threshold).

`device_profiles`: device_type (`phone|tablet|laptop|watch|tracker|other`), manufacturer, model, serial_number, os, os_version.

RLS: via parent asset (helper `can_access_asset(asset_id, 'select')`).

### `asset_devices` — a physical tracker/provider identity bound to an asset
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| asset_id | uuid → assets | |
| owner_id | uuid | denormalised |
| provider_key | text → tracking_providers | |
| external_device_id | text not null | e.g. Traccar `uniqueId` / IMEI, iOS install id, "manual" |
| tracker_model | text | e.g. `Teltonika FMB920` |
| ingest_token_hash | text | sha256 of per-device token used by push providers / companion app |
| config | jsonb | non-secret config (ports, report interval). Never credentials. |
| status | text | `active|paused|error` |
| last_sync_at / last_error / last_error_at | | admin observability |
| created_at / updated_at | | |

Unique `(provider_key, external_device_id)`. Index `(asset_id)`.

### `provider_credentials` — **service-role only**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | |
| provider_key | text | |
| label | text | |
| vault_secret_id | uuid | id in `vault.secrets` holding the JSON credential blob |
| created_at / rotated_at | | |

No RLS policies grant anything to `authenticated`/`anon` ⇒ unreadable from the browser. Only server code (service role) decrypts via `vault.decrypted_secrets`.

### `locations` — history (partitioned by month on `recorded_at`)
| column | type | notes |
|---|---|---|
| id | bigint generated always as identity | |
| asset_id | uuid not null | FK enforced in app + trigger (partitioned FKs are slow) |
| owner_id | uuid not null | RLS without join |
| device_id | uuid | → asset_devices |
| recorded_at | timestamptz not null | provider timestamp (partition key) |
| received_at | timestamptz not null default now() | |
| geom | geography(Point,4326) not null | |
| accuracy_m / altitude_m / speed_mps / heading_deg | real | |
| battery_level | smallint | |
| source | text not null | provider key |
| provider_event_id | text | for idempotency |
| ignition_on | boolean | vehicles |
| fuel_level_pct | real | vehicles |
| odometer_km | real | vehicles |
| extra | jsonb | provider-specific, bounded to 2 KB, no PII |

Constraints: `check (accuracy_m is null or accuracy_m >= 0)`, `check (speed_mps is null or speed_mps between 0 and 150)`, `check (recorded_at <= received_at + interval '5 minutes')`.

Indexes per partition: `(asset_id, recorded_at desc)`, `unique (asset_id, source, provider_event_id) where provider_event_id is not null`, `unique (asset_id, source, recorded_at)`, GIST `(geom)` (only if area queries are needed; deferred until used).

Retention (pg_cron): raw rows kept **90 days**; daily job rolls older rows into `location_daily_summaries` (distance, max/avg speed, bbox, sampled path as LineString, max 500 vertices via `ST_Simplify`) and drops the partition after 13 months. Ingest down-samples: if the previous accepted point is < `min_sample_interval_s` old **and** the displacement < `accuracy_m`, the new point updates `asset_states` (battery, timestamps) but is not appended to history.

### `location_daily_summaries`
`(asset_id, day) PK`, distance_m, moving_seconds, stopped_seconds, max_speed_mps, avg_speed_mps, point_count, bbox geometry, path geography(LineString), trips_count, computed_at.

### `trips` (P2, vehicles; computed from `locations` by a job or on ingest)
id, asset_id, owner_id, started_at, ended_at, start_geom, end_geom, start_label, end_label, distance_m, duration_s, max_speed_mps, avg_speed_mps, path geography(LineString), is_open.

Trip boundaries: ignition on/off when available; otherwise speed < 1 m/s for ≥ 5 min ⇒ stop.

### `ingest_events` — raw ingestion log (observability)
id, provider_key, device_id, owner_id, external_device_id, received_at, status `ingest_status`, reason text, location_id, payload_sha256, payload jsonb (only when status ≠ accepted, capped 8 KB), processing_ms, request_ip inet, user_agent. Retention 14 days. Admin-only RLS (`is_admin`) plus owner read of their own device rows.

### `geofences`
id, owner_id, name, kind, geom geography(Polygon,4326) not null (circles are stored as buffered polygons **and** keep `center` + `radius_m` for editing), color, icon, is_active, created_at, updated_at.
Index: GIST(geom), (owner_id).

### `geofence_assets`
`(geofence_id, asset_id)` PK, owner_id, notify_on_enter, notify_on_exit, `is_inside boolean`, `last_transition_at`, `last_evaluated_location_id`. This row **is** the geofence state machine for that pair.

### `geofence_events`
id, geofence_id, asset_id, owner_id, location_id, event_type, occurred_at, dwell_seconds (on exit). Index `(asset_id, occurred_at desc)`.

Evaluation happens inside the ingest function: `ST_Covers(geofence.geom, location.geom)` for the asset's fences, compared to `is_inside`. Hysteresis: a transition is only accepted if the point's `accuracy_m` is < the distance to the fence boundary **or** two consecutive points agree (prevents flapping from 300 m accuracy fixes).

### `alert_rules`
id, owner_id, asset_id (null ⇒ all assets of owner), rule_type alert_type, params jsonb (`{"threshold":20}`, `{"speed_kph":100}`, `{"minutes":30}`), channels notif_channel[], is_active, cooldown_s default 900, created_at, updated_at.

### `alerts`
id, owner_id, asset_id, rule_id, alert_type, severity, title, body, data jsonb, location_id, triggered_at, acknowledged_at, resolved_at, dedupe_key text.
Unique `(dedupe_key) where resolved_at is null` — e.g. `battery_low:{asset_id}` opens once until resolved.
Index `(owner_id, triggered_at desc)`, `(owner_id) where acknowledged_at is null`.

### `notification_preferences`
owner_id PK, in_app boolean default true, email boolean default true, push boolean default false, quiet_hours_start time, quiet_hours_end time, email_digest boolean.

### `push_subscriptions`
id, owner_id, endpoint text unique, p256dh, auth, user_agent, created_at, last_used_at, failed_count.

### `notification_events`
id, alert_id, owner_id, channel, status, attempts, provider_message_id, error, queued_at, sent_at. Index `(status, queued_at)` for the dispatcher.

### `location_sharing_permissions` (schema now, UI P3)
id, asset_id, owner_id, grantee_id (uuid → profiles, nullable until accepted), grantee_email, scope share_scope[], expires_at, revoked_at, accepted_at, created_at. Index `(grantee_id) where revoked_at is null`.

### `audit_logs`
id, actor_id, action text, target_table, target_id text, metadata jsonb, ip inet, created_at.
Written only by `SECURITY DEFINER` functions and triggers (asset create/delete, share grant/revoke, credential add/rotate, account delete, admin views of ingest payloads). Readable by the actor and admins. Never updatable/deletable by clients.

### `realtime_connections` (admin observability, optional)
Populated from Realtime presence on the `owner:{id}` channel: owner_id, client_id, connected_at, last_seen_at, user_agent. P2.

---

## RLS helper

```sql
create or replace function public.can_access_asset(p_asset uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assets a
    where a.id = p_asset and a.deleted_at is null and a.owner_id = auth.uid()
  ) or (
    not p_write and exists (
      select 1 from location_sharing_permissions s
      where s.asset_id = p_asset and s.grantee_id = auth.uid()
        and s.revoked_at is null and s.accepted_at is not null
        and (s.expires_at is null or s.expires_at > now())
    )
  );
$$;
```

Policy pattern for every asset-scoped table: `using (owner_id = auth.uid() or can_access_asset(asset_id))`,
`with check (owner_id = auth.uid())`. Tables written only by the server (`asset_states`, `locations`,
`geofence_events`, `alerts`, `notification_events`, `ingest_events`, `audit_logs`) get **select-only**
policies for `authenticated`; inserts happen through `SECURITY DEFINER` functions or the service role.

## Ingest function (single transaction, called by the server with the service role)

```
ingest_location(p_device_id uuid, p_recorded_at, p_lat, p_lng, p_accuracy_m, p_altitude_m,
                p_speed_mps, p_heading_deg, p_battery, p_source, p_provider_event_id,
                p_ignition, p_fuel_pct, p_odometer_km, p_extra jsonb, p_connection_status)
returns table (status ingest_status, location_id bigint, reason text)
```
1. Resolve `asset_devices` → asset, owner; reject if asset archived/deleted or tracking disabled.
2. Validate: lat ∈ [-90,90], lng ∈ [-180,180], not (0,0), `recorded_at` ≤ now()+5 min, ≥ now()−30 d.
3. Idempotency: if `(asset_id, source, provider_event_id)` exists ⇒ `duplicate`.
4. Insert into `locations` (subject to down-sampling rule) ⇒ `location_id`.
5. If `recorded_at` > `asset_states.last_location_at` ⇒ update state, derive `movement_state`,
   run geofence evaluation, run alert rules (battery/speed/geofence), enqueue notifications.
   Else ⇒ `out_of_order` (history kept, state untouched, `last_received_at` still bumped).
6. Always write an `ingest_events` row.

## Views

`asset_overview` — joins assets + asset_states + type profile + provider thresholds and computes
`freshness` (`live|recent|stale|offline|unknown`), `age_seconds`, `open_alert_count`,
`inside_geofence_names text[]`. The client re-derives `freshness` every second from `age_seconds`
so the badge cannot lie between fetches.

## Account deletion

`delete_my_account()` (SECURITY DEFINER): writes audit row, deletes storage objects, deletes
`auth.users` row (cascades everything), and revokes Vault secrets owned by the user.
