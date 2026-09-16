# AssetWatch — System Architecture (Phase 1)

Companion documents: `00-audit.md` (existing repo + plan), `02-database-schema.md`,
`03-integrations.md` (Apple / vehicle / pet feasibility with sources), `04-map-and-realtime.md`
(provider evaluation with sources and costs).

## 1. Stack decision

| Layer | Choice | Why (and what was rejected) |
|---|---|---|
| Web app | **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4** | Your preference; server components keep provider keys server-side; route handlers host the ingest/webhook API; Vercel-native. Remix/SvelteKit rejected only because they add no value over your stated preference. |
| Database | **Supabase Postgres + PostGIS** | Geography types, GIST indexes, `ST_Covers` for geofences, partitioning, pg_cron for retention/no-report jobs, Vault for provider secrets. |
| Auth | **Supabase Auth** (email/password, Google, Apple) via `@supabase/ssr` | Cookie sessions, RLS integration through `auth.uid()`, no custom auth code. |
| Realtime | **Supabase Realtime, Broadcast-from-database** (not `postgres_changes`) | Per-user private channel; DB trigger fans out state updates; RLS authorises channel join once, not per message. See §6 for scale limits. |
| Map | **MapLibre GL JS + react-map-gl** with a vector-tile host | Evaluated in `04-map-and-realtime.md`. Open licence, GPU-rendered clustering for thousands of markers, satellite via the same host, and the lowest cost-at-scale. Google Maps retained as a documented fallback if Lagos coverage proves insufficient in your testing. |
| Ingestion | **Next.js route handlers on Vercel** (`/api/ingest/[provider]`) | Small, stateless, easy to secure. Moves to a long-running service (Fly/Railway) only if a provider needs a persistent TCP/MQTT socket. |
| Email | Resend | Free tier is enough for alerts; swappable behind the `NotificationChannel` interface. |
| Push | Web Push (VAPID), later APNs/FCM for the companion app | No vendor lock; `push_subscriptions` table. |
| Validation | zod | Every external payload is parsed before it touches the DB. |
| Tests | Vitest, pgTAP (hosted), Playwright | See §9. |
| Observability | Structured logs + `ingest_events` + `notification_events` tables + Sentry (P2) | Tracking systems are debugged through their event logs. |

Dependencies deliberately **not** added: state-management libraries (server components + a small
zustand store for map UI only if needed), ORMs (Supabase client + typed SQL functions are enough),
CMS (no content requirement), Redis (rate limiting is done in Postgres until it measurably hurts).

## 2. System diagram

```
┌──────────────────────────────── Location sources ────────────────────────────────┐
│ Simulated (Node script)  Traccar/flespi (webhook)  Browser Geolocation (client)  │
│ iOS/Android companion (P3)  Manual entry (UI)  Apple Find My: NO API → manual    │
└───────────────┬───────────────────────┬───────────────────────┬──────────────────┘
                │ HTTPS + per-device     │ HTTPS + shared secret │ user session (RLS)
                ▼ bearer token           ▼ + IP allowlist        ▼
┌──────────────────────────── Next.js (Vercel) ─────────────────────────────────────┐
│ /api/ingest/[provider]  ─► ProviderAdapter.parse() ─► zod ─► NormalizedLocation   │
│         │ rate limit, size cap, signature/token check, ingest_events on reject     │
│         ▼ service-role RPC                                                        │
└─────────┼─────────────────────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────── Supabase Postgres + PostGIS ──────────────────────────┐
│ ingest_location()  (SECURITY DEFINER, one transaction)                            │
│   validate ─► idempotency ─► locations (partitioned) ─► newer? ─► asset_states    │
│   ─► geofence eval (ST_Covers) ─► geofence_events ─► alert rules ─► alerts        │
│   ─► notification_events (queued)                                                 │
│ trigger on asset_states ─► realtime.broadcast_changes('owner:{uid}')              │
│ pg_cron: no_report sweep (1 min), notification dispatch (1 min via pg_net),       │
│          daily summaries + retention (nightly)                                    │
└─────────┬──────────────────────────────────────┬──────────────────────────────────┘
          │ Realtime WS (private channel)         │ pg_net → /api/notify/dispatch
          ▼                                       ▼
┌────────────── Browser / PWA ──────────────┐   ┌──── Channels ────┐
│ Map (MapLibre) ◄─ asset store ◄─ broadcast │   │ in-app · email   │
│ freshness ticks locally every 1 s          │   │ web push · (sms) │
│ detail panel · history · geofences · alerts│   └──────────────────┘
└────────────────────────────────────────────┘
```

## 3. Data flow for one location update

1. Provider pushes JSON (or the simulator does) to `/api/ingest/traccar` with `Authorization: Bearer <device token>`.
2. Route handler: reject if body > 64 KB; rate limit per token; look up `asset_devices` by token hash; `TraccarAdapter.parse()` → `NormalizedLocation` (zod). Any failure ⇒ HTTP 4xx and an `ingest_events` row with `rejected` + reason.
3. RPC `ingest_location(...)` with the service role. Postgres decides `accepted | duplicate | out_of_order | rejected` and returns it; the handler returns 200 for all non-error outcomes (so providers don't retry forever), 5xx only on real errors.
4. If accepted and newer: `asset_states` updated → trigger → Broadcast on `owner:{uid}` with the new state row.
5. Browser: one subscription per user; on message, patch the in-memory asset map; MapLibre GeoJSON source `setData` (batched with `requestAnimationFrame`); marker interpolates from old to new position only when the source is `live`.
6. Freshness badge is computed on the client from `last_location_at` and the provider thresholds, re-evaluated every second, so a marker becomes STALE by itself without any server event.

## 4. Provider abstraction

```ts
// lib/tracking/types.ts
export interface NormalizedLocation {
  assetId: string;            // resolved server-side from device token
  deviceId: string;
  recordedAt: string;         // ISO, provider clock
  latitude: number; longitude: number;
  accuracyM: number | null;   // null = unknown — UI must not draw a small dot for null
  altitudeM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  batteryLevel: number | null; // 0–100
  connectionStatus: 'online' | 'offline' | 'unknown';
  source: ProviderKey;
  providerEventId: string | null;
  ignitionOn?: boolean | null; fuelLevelPct?: number | null; odometerKm?: number | null;
  extra?: Record<string, unknown>;
}

export interface TrackingProvider {
  key: ProviderKey;
  kind: 'push_webhook' | 'poll' | 'client_reported' | 'manual';
  capabilities: Capabilities;          // battery, speed, heading, accuracy, ignition, history
  freshness: { liveAfterS: number; recentAfterS: number; staleAfterS: number; offlineAfterS: number };
  // push providers implement:
  verifyRequest?(req: Request, ctx: DeviceContext): Promise<boolean>;
  parse?(body: unknown, ctx: DeviceContext): NormalizedLocation[];   // may yield many (batch uploads)
  // poll providers implement (run by cron with Vault credentials, server only):
  getCurrentLocation?(ctx: DeviceContext, creds: Credentials): Promise<NormalizedLocation | null>;
  getLocationHistory?(ctx, creds, from: Date, to: Date): Promise<NormalizedLocation[]>;
  getDeviceStatus?(ctx, creds): Promise<{ connection: ConnectionStatus; battery: number | null }>;
}
```

Providers in the MVP: `simulated`, `manual`, `browser_geolocation`. P2: `traccar` (push), `flespi`
(push via webhook). P3: `ios_companion` (push, per-install token), `apple_findmy_reported` (manual
only, by design — see `03-integrations.md`). The dashboard never branches on provider except to read
`capabilities` (hide battery when unsupported) and `freshness` thresholds.

## 5. Security model

| Concern | Control |
|---|---|
| Tenant isolation | RLS on every table; `owner_id` on every asset-scoped row; `can_access_asset()` for shared reads. pgTAP tests assert a second user sees zero rows. |
| Keys | Browser gets only `NEXT_PUBLIC_SUPABASE_URL` + publishable key + map tile key (domain-restricted). Service role, Resend, VAPID private key, Vault credentials: server env only. `provider_credentials` has no client policies. |
| Ingest auth | Per-device random 32-byte token shown once, stored as SHA-256. Webhook providers that sign (flespi) are verified with HMAC; those that don't (Traccar forward) use the token in a header plus optional source-IP allowlist. |
| Rate limiting | Vercel Firewall rule on `/api/ingest/*`; per-token token bucket in Postgres (`rate_limits` table, `take_token()` function) so abuse of one device cannot starve others. |
| Input | zod on every route; body size cap; coordinates, timestamps, enum values validated again in SQL constraints. |
| Sessions | Supabase cookie sessions via `@supabase/ssr`; middleware refreshes tokens; logout everywhere via `auth.signOut({ scope: 'global' })`. |
| Audit | `audit_logs` written by SECURITY DEFINER functions for asset create/delete, share grant/revoke, credential changes, account deletion, admin payload views. |
| Secure deletion | Soft delete → 30-day purge job → hard delete cascades `locations`; storage objects removed; account deletion RPC removes `auth.users` and Vault secrets. |
| Covert tracking | A device can only be bound to an asset by the authenticated owner; companion-app location sharing requires an in-app consent screen, is visible in the app, and can be turned off from the phone. No "install silently on someone else's phone" flows. Shared assets are always labelled SHARED with the grantor's name. |
| Admin | `profiles.is_admin` set only via SQL; `/admin` routes check it server-side; admin reads of raw payloads are audited. |

## 6. Realtime architecture and when it stops being enough

Chosen primitive: **Broadcast from Database** (`realtime.broadcast_changes()` in an `AFTER UPDATE`
trigger on `asset_states`), private channel `owner:{uid}` with RLS on `realtime.messages`.

Why not `postgres_changes`: it evaluates RLS per subscriber per change and is documented as the
less scalable option; it would also ship every column of every change to every listener.

| Assets | Connected clients | What breaks first | Fix |
|---|---|---|---|
| 10 | 1–3 | Nothing. Free tier is fine. | — |
| 100 | ~10 | Nothing; ingest is < 1 write/s. | — |
| 1,000 (10 s reports) | ~100 | ~100 writes/s: `locations` index bloat and `asset_states` update churn; Broadcast message quota on Free tier. | Pro plan; down-sampling at ingest; `locations` partitions + fillfactor; batch trigger payload (state only, no history). |
| 10,000+ | 1,000+ | Realtime concurrent connections and messages/s; geofence evaluation per insert; Vercel function invocations per report. | Move ingest to a persistent worker (Fly/Railway) that batches inserts; evaluate geofences in a queue; Broadcast throttled to 1 msg/asset/2 s; consider a dedicated WebSocket fan-out (e.g. a small Elixir/Node service subscribed to Postgres LISTEN) or Redis pub/sub; read replica for history queries. |

Map rendering: MapLibre GeoJSON source with `cluster: true` handles 10k points client-side; beyond
that, serve tiles from PostGIS (`ST_AsMVT`) instead of one GeoJSON blob.

## 7. Freshness state machine

```
input: last_location_at, connection_status (provider-reported), provider thresholds
unknown  : no location ever
offline  : provider explicitly reported offline  (never inferred from silence)
live     : age < liveAfterS            (GPS tracker 30 s; browser 60 s; Find My-reported 300 s)
recent   : age < recentAfterS          (5 min)
stale    : age ≥ recentAfterS
```
`no_report` alert fires separately when `age > offlineAfterS` and the provider is not `manual`.
The UI shows the age ("32 s ago") next to the badge in every state so no state can mislead.

## 8. Location history strategy

- Raw `locations` kept 90 days, monthly partitions, index `(asset_id, recorded_at desc)`.
- Ingest down-sampling: skip history insert when < `min_sample_interval_s` since last **and** moved
  less than the fix's `accuracy_m` (stationary noise). State still updates.
- Nightly `location_daily_summaries` (distance via `ST_Length` of the simplified path, moving/stopped
  seconds, max/avg speed, bbox, trip count) so 30-day views read ≤ 30 rows per asset.
- Trails: today/yesterday from raw rows, simplified server-side with `ST_Simplify` to ≤ 2,000 points;
  7/30-day from summaries' stored paths.
- Trips (vehicles): ignition edges when available, else speed < 1 m/s for ≥ 5 min.
- Pet "frequently visited areas": `ST_ClusterDBSCAN` over the last 30 days of stationary points (P2).

## 9. Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | adapters → normalisation, freshness derivation, movement derivation, geofence hysteresis helper, simulator route generator |
| DB | pgTAP via `supabase test db` against a hosted branch (Docker unavailable locally) | RLS isolation (user B sees 0 rows of user A), `ingest_location` accepted/duplicate/out-of-order/rejected, geofence enter/exit, alert dedupe |
| API | Vitest + route handler invocation | token auth, size cap, rate limit, malformed payloads, provider failure paths |
| E2E | Playwright | login, create asset, simulator stream updates marker, mobile viewport bottom sheet, dark mode |
| Load | k6 script (P2) | 1,000 assets × 10 s reports |

The simulator is the test oracle: it emits deterministic routes with seeded duplicates,
out-of-order events, (0,0) fixes, future timestamps, and a battery drain curve.

## 10. Cost at MVP scale (1 user, ≤ 10 assets)

Supabase Free (or Pro at US$25/mo when Vault/branching/cron reliability matters), Vercel Hobby
(personal use), map tiles on a free tier, Resend free tier: **US$0–25/month**. Real trackers add
hardware (~US$25–60 per GT06/Teltonika unit) and a data SIM (~₦1,000–2,000/month each).
Detailed provider pricing and citations are in `04-map-and-realtime.md`.
