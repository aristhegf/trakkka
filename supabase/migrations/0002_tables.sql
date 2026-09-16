-- AssetWatch migration 0002: tables, constraints, indexes

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Africa/Lagos',
  home_geofence_id uuid,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ------------------------------------------------------- tracking_providers
create table if not exists public.tracking_providers (
  key text primary key,
  name text not null,
  kind text not null check (kind in ('push_webhook','poll','client_reported','manual')),
  capabilities jsonb not null default '{}'::jsonb,
  live_after_s int not null default 30,
  recent_after_s int not null default 300,
  stale_after_s int not null default 900,
  offline_after_s int not null default 1800,
  min_sample_interval_s int not null default 5,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type public.asset_type not null,
  status public.asset_status not null default 'active',
  photo_path text,
  description text check (description is null or char_length(description) <= 1000),
  icon text,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  tracking_provider_key text references public.tracking_providers(key),
  is_tracking_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists assets_owner_idx on public.assets (owner_id) where deleted_at is null;
create index if not exists assets_owner_type_idx on public.assets (owner_id, type);
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ asset_states
create table if not exists public.asset_states (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  geom extensions.geography(Point, 4326),
  latitude double precision,
  longitude double precision,
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  altitude_m real,
  speed_mps real check (speed_mps is null or speed_mps >= 0),
  heading_deg real check (heading_deg is null or (heading_deg >= 0 and heading_deg <= 360)),
  battery_level smallint check (battery_level is null or (battery_level between 0 and 100)),
  battery_updated_at timestamptz,
  connection_status public.connection_status not null default 'unknown',
  connection_updated_at timestamptz,
  movement_state public.movement_state not null default 'unknown',
  last_location_at timestamptz,
  last_received_at timestamptz,
  last_location_id bigint,
  last_source text,
  last_provider_event_id text,
  place_label text,
  place_geohash text,
  updated_at timestamptz not null default now()
);
create index if not exists asset_states_owner_idx on public.asset_states (owner_id);
create index if not exists asset_states_geom_idx on public.asset_states using gist (geom);

-- --------------------------------------------------------- type profiles
create table if not exists public.pet_profiles (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  species text,
  breed text,
  sex text check (sex is null or sex in ('male','female','unknown')),
  date_of_birth date,
  microchip_id text,
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg > 0),
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_notes text,
  notes text
);

create table if not exists public.vehicle_profiles (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  make text,
  model text,
  year int check (year is null or (year between 1950 and 2100)),
  registration_number text,
  vin text check (vin is null or char_length(vin) = 17),
  color text,
  fuel_type text check (fuel_type is null or fuel_type in ('petrol','diesel','electric','hybrid','unknown')),
  odometer_km real,
  fuel_level_pct real check (fuel_level_pct is null or (fuel_level_pct between 0 and 100)),
  ignition_on boolean,
  speed_limit_kph int check (speed_limit_kph is null or speed_limit_kph > 0)
);

create table if not exists public.device_profiles (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_type text check (device_type is null or device_type in ('phone','tablet','laptop','watch','tracker','other')),
  manufacturer text,
  model text,
  serial_number text,
  os text,
  os_version text
);

-- ------------------------------------------------------------ asset_devices
create table if not exists public.asset_devices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider_key text not null references public.tracking_providers(key),
  external_device_id text not null,
  tracker_model text,
  ingest_token_hash text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','error')),
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, external_device_id)
);
create index if not exists asset_devices_asset_idx on public.asset_devices (asset_id);
create unique index if not exists asset_devices_token_idx on public.asset_devices (ingest_token_hash) where ingest_token_hash is not null;
create trigger asset_devices_updated_at before update on public.asset_devices
  for each row execute function public.set_updated_at();

-- ------------------------------------------------- provider_credentials
-- Service-role only. No RLS policies are ever created for authenticated/anon.
create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider_key text not null references public.tracking_providers(key),
  label text,
  vault_secret_id uuid,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- --------------------------------------------------------------- locations
-- Partitioned by month on recorded_at. FK to assets is enforced by the ingest function.
create table if not exists public.locations (
  id bigint generated always as identity,
  asset_id uuid not null,
  owner_id uuid not null,
  device_id uuid,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  geom extensions.geography(Point, 4326) not null,
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  altitude_m real,
  speed_mps real check (speed_mps is null or (speed_mps >= 0 and speed_mps <= 150)),
  heading_deg real check (heading_deg is null or (heading_deg >= 0 and heading_deg <= 360)),
  battery_level smallint check (battery_level is null or (battery_level between 0 and 100)),
  source text not null,
  provider_event_id text,
  ignition_on boolean,
  fuel_level_pct real,
  odometer_km real,
  extra jsonb,
  primary key (id, recorded_at),
  check (recorded_at <= received_at + interval '5 minutes'),
  check (extra is null or pg_column_size(extra) <= 4096)
) partition by range (recorded_at);

create index if not exists locations_asset_time_idx on public.locations (asset_id, recorded_at desc);
create unique index if not exists locations_event_uidx on public.locations (asset_id, source, provider_event_id, recorded_at)
  where provider_event_id is not null;
create unique index if not exists locations_asset_source_time_uidx on public.locations (asset_id, source, recorded_at);

-- Partition management: ensure a partition exists for a given month.
create or replace function public.ensure_locations_partition(p_month date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := 'locations_' || to_char(v_start, 'YYYY_MM');
begin
  if not exists (select 1 from pg_class where relname = v_name) then
    execute format('create table public.%I partition of public.locations for values from (%L) to (%L)', v_name, v_start, v_end);
  end if;
end $$;

-- Create partitions for last month, this month and the next 3 months.
do $$
declare m int;
begin
  for m in -1..3 loop
    perform public.ensure_locations_partition((date_trunc('month', now()) + (m || ' months')::interval)::date);
  end loop;
end $$;

-- A default partition catches anything outside created ranges so inserts never fail.
create table if not exists public.locations_default partition of public.locations default;

-- ---------------------------------------------------- daily summaries
create table if not exists public.location_daily_summaries (
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null,
  day date not null,
  distance_m real not null default 0,
  moving_seconds int not null default 0,
  stopped_seconds int not null default 0,
  max_speed_mps real,
  avg_speed_mps real,
  point_count int not null default 0,
  path extensions.geography(LineString, 4326),
  computed_at timestamptz not null default now(),
  primary key (asset_id, day)
);

-- ------------------------------------------------------------ ingest_events
create table if not exists public.ingest_events (
  id bigint generated always as identity primary key,
  provider_key text,
  device_id uuid,
  owner_id uuid,
  external_device_id text,
  received_at timestamptz not null default now(),
  status public.ingest_status not null,
  reason text,
  location_id bigint,
  payload_sha256 text,
  payload jsonb,
  processing_ms int,
  request_ip inet,
  user_agent text,
  check (payload is null or pg_column_size(payload) <= 8192)
);
create index if not exists ingest_events_time_idx on public.ingest_events (received_at desc);
create index if not exists ingest_events_owner_idx on public.ingest_events (owner_id, received_at desc);
create index if not exists ingest_events_status_idx on public.ingest_events (status, received_at desc);

-- --------------------------------------------------------------- geofences
create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.geofence_kind not null,
  geom extensions.geography(Polygon, 4326) not null,
  center extensions.geography(Point, 4326),
  radius_m real check (radius_m is null or (radius_m >= 20 and radius_m <= 50000)),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists geofences_owner_idx on public.geofences (owner_id);
create index if not exists geofences_geom_idx on public.geofences using gist (geom);
create trigger geofences_updated_at before update on public.geofences
  for each row execute function public.set_updated_at();

alter table public.profiles
  drop constraint if exists profiles_home_geofence_fk,
  add constraint profiles_home_geofence_fk foreign key (home_geofence_id) references public.geofences(id) on delete set null;

create table if not exists public.geofence_assets (
  geofence_id uuid not null references public.geofences(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  notify_on_enter boolean not null default true,
  notify_on_exit boolean not null default true,
  is_inside boolean,
  last_transition_at timestamptz,
  last_evaluated_location_id bigint,
  created_at timestamptz not null default now(),
  primary key (geofence_id, asset_id)
);
create index if not exists geofence_assets_asset_idx on public.geofence_assets (asset_id);

create table if not exists public.geofence_events (
  id bigint generated always as identity primary key,
  geofence_id uuid not null references public.geofences(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null,
  location_id bigint,
  event_type public.geofence_event_type not null,
  occurred_at timestamptz not null default now(),
  dwell_seconds int
);
create index if not exists geofence_events_asset_idx on public.geofence_events (asset_id, occurred_at desc);
create index if not exists geofence_events_owner_idx on public.geofence_events (owner_id, occurred_at desc);

-- ------------------------------------------------------------- alert rules
create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  rule_type public.alert_type not null,
  params jsonb not null default '{}'::jsonb,
  channels public.notification_channel[] not null default array['in_app']::public.notification_channel[],
  is_active boolean not null default true,
  cooldown_s int not null default 900,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alert_rules_owner_idx on public.alert_rules (owner_id);
create trigger alert_rules_updated_at before update on public.alert_rules
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- alerts
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete set null,
  alert_type public.alert_type not null,
  severity public.alert_severity not null default 'warning',
  title text not null,
  body text,
  data jsonb,
  location_id bigint,
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  dedupe_key text
);
create index if not exists alerts_owner_time_idx on public.alerts (owner_id, triggered_at desc);
create index if not exists alerts_owner_open_idx on public.alerts (owner_id) where acknowledged_at is null;
create unique index if not exists alerts_dedupe_uidx on public.alerts (dedupe_key) where dedupe_key is not null and resolved_at is null;

-- ------------------------------------------------- notification prefs/events
create table if not exists public.notification_preferences (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default true,
  push boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  failed_count int not null default 0
);

create table if not exists public.notification_events (
  id bigint generated always as identity primary key,
  alert_id uuid not null references public.alerts(id) on delete cascade,
  owner_id uuid not null,
  channel public.notification_channel not null,
  status public.notification_status not null default 'queued',
  attempts int not null default 0,
  provider_message_id text,
  error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_events_queue_idx on public.notification_events (status, queued_at) where status = 'queued';
create index if not exists notification_events_owner_idx on public.notification_events (owner_id, queued_at desc);

-- ------------------------------------------------ location sharing (P3 UI)
create table if not exists public.location_sharing_permissions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  grantee_id uuid references public.profiles(id) on delete cascade,
  grantee_email text,
  scope public.share_scope[] not null default array['live']::public.share_scope[],
  expires_at timestamptz,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sharing_grantee_idx on public.location_sharing_permissions (grantee_id) where revoked_at is null;
create index if not exists sharing_asset_idx on public.location_sharing_permissions (asset_id);

-- ------------------------------------------------------------- audit_logs
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- ------------------------------------------------------------ rate limits
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 0
);

-- ------------------------------------------------------------ geocode cache
create table if not exists public.geocode_cache (
  geohash text primary key,
  label text not null,
  created_at timestamptz not null default now()
);
