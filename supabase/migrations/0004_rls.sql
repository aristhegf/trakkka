-- AssetWatch migration 0004: Row Level Security on every table

alter table public.profiles enable row level security;
alter table public.tracking_providers enable row level security;
alter table public.assets enable row level security;
alter table public.asset_states enable row level security;
alter table public.pet_profiles enable row level security;
alter table public.vehicle_profiles enable row level security;
alter table public.device_profiles enable row level security;
alter table public.asset_devices enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.locations enable row level security;
alter table public.location_daily_summaries enable row level security;
alter table public.ingest_events enable row level security;
alter table public.geofences enable row level security;
alter table public.geofence_assets enable row level security;
alter table public.geofence_events enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alerts enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table public.location_sharing_permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;
alter table public.geocode_cache enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- is_admin can only change via SQL (service role / dashboard), never through the API.
create or replace function public.prevent_admin_escalation()
returns trigger language plpgsql as $$
begin
  if new.is_admin is distinct from old.is_admin and coalesce(auth.role(), '') = 'authenticated' then
    raise exception 'is_admin cannot be changed through the API';
  end if;
  return new;
end $$;
drop trigger if exists profiles_prevent_admin_escalation on public.profiles;
create trigger profiles_prevent_admin_escalation before update on public.profiles
  for each row execute function public.prevent_admin_escalation();

-- tracking_providers: read-only reference data
drop policy if exists providers_select on public.tracking_providers;
create policy providers_select on public.tracking_providers for select to authenticated using (true);

-- assets
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(id));
drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated using (owner_id = auth.uid());

-- asset_states: read only for clients; written by ingest functions
drop policy if exists asset_states_select on public.asset_states;
create policy asset_states_select on public.asset_states for select to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id));

-- type profiles
drop policy if exists pet_profiles_all on public.pet_profiles;
create policy pet_profiles_all on public.pet_profiles for all to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id)) with check (owner_id = auth.uid());
drop policy if exists vehicle_profiles_all on public.vehicle_profiles;
create policy vehicle_profiles_all on public.vehicle_profiles for all to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id)) with check (owner_id = auth.uid());
drop policy if exists device_profiles_all on public.device_profiles;
create policy device_profiles_all on public.device_profiles for all to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id)) with check (owner_id = auth.uid());

-- asset_devices: owner only (never shared; contains token hashes)
drop policy if exists asset_devices_all on public.asset_devices;
create policy asset_devices_all on public.asset_devices for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- provider_credentials: NO policies => service role only.

-- locations: read via ownership or share with history scope
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated
  using (owner_id = auth.uid() or exists (
    select 1 from public.location_sharing_permissions s
    where s.asset_id = locations.asset_id and s.grantee_id = auth.uid() and 'history' = any(s.scope)
      and s.revoked_at is null and s.accepted_at is not null and (s.expires_at is null or s.expires_at > now())));

drop policy if exists summaries_select on public.location_daily_summaries;
create policy summaries_select on public.location_daily_summaries for select to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id));

-- ingest_events: owners see their own device events; admins see everything
drop policy if exists ingest_events_select on public.ingest_events;
create policy ingest_events_select on public.ingest_events for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- geofences
drop policy if exists geofences_all on public.geofences;
create policy geofences_all on public.geofences for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists geofence_assets_all on public.geofence_assets;
create policy geofence_assets_all on public.geofence_assets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.can_access_asset(asset_id, true));
drop policy if exists geofence_events_select on public.geofence_events;
create policy geofence_events_select on public.geofence_events for select to authenticated
  using (owner_id = auth.uid() or public.can_access_asset(asset_id));

-- alert rules and alerts
drop policy if exists alert_rules_all on public.alert_rules;
create policy alert_rules_all on public.alert_rules for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts for select to authenticated using (owner_id = auth.uid());
drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- notification preferences / subscriptions / events
drop policy if exists notif_prefs_all on public.notification_preferences;
create policy notif_prefs_all on public.notification_preferences for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists push_subs_all on public.push_subscriptions;
create policy push_subs_all on public.push_subscriptions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists notif_events_select on public.notification_events;
create policy notif_events_select on public.notification_events for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- sharing
drop policy if exists sharing_select on public.location_sharing_permissions;
create policy sharing_select on public.location_sharing_permissions for select to authenticated
  using (owner_id = auth.uid() or grantee_id = auth.uid());
drop policy if exists sharing_owner_write on public.location_sharing_permissions;
create policy sharing_owner_write on public.location_sharing_permissions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- audit logs: actor and admins read; nobody writes directly
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

-- rate_limits, geocode_cache: service role only (no policies)

-- Storage bucket for asset photos (private; signed URLs only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-photos', 'asset-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists asset_photos_select on storage.objects;
create policy asset_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'asset-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists asset_photos_insert on storage.objects;
create policy asset_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists asset_photos_update on storage.objects;
create policy asset_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'asset-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists asset_photos_delete on storage.objects;
create policy asset_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'asset-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: each user may only join their own private topic.
drop policy if exists realtime_owner_topic on realtime.messages;
create policy realtime_owner_topic on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and realtime.topic() = 'owner:' || auth.uid()::text);
drop policy if exists realtime_owner_topic_presence on realtime.messages;
create policy realtime_owner_topic_presence on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and realtime.topic() = 'owner:' || auth.uid()::text);

-- Function execution grants: RPCs callable by users vs server only.
revoke all on function public.ingest_location(uuid, timestamptz, double precision, double precision, real, real, real, real, smallint, text, text, public.connection_status, boolean, real, real, jsonb, inet, text) from public, anon, authenticated;
revoke all on function public.ingest_device_status(uuid, public.connection_status, smallint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.rate_limit_take(text, int, int) from public, anon, authenticated;
revoke all on function public.claim_notifications(int) from public, anon, authenticated;
revoke all on function public.sweep_no_report() from public, anon, authenticated;
revoke all on function public.run_retention() from public, anon, authenticated;
revoke all on function public.compute_daily_summary(uuid, date) from public, anon, authenticated;
revoke all on function public.ensure_locations_partition(date) from public, anon, authenticated;
revoke all on function public.trigger_notification_dispatch() from public, anon, authenticated;
revoke all on function public._log_ingest(text, uuid, uuid, text, public.ingest_status, text, bigint, jsonb, timestamptz, inet, text) from public, anon, authenticated;
revoke all on function public.evaluate_geofences(uuid, uuid, text, extensions.geography, real, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.evaluate_alert_rules(uuid, uuid, text, public.asset_type, smallint, real, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.audit(text, text, text, jsonb) from public, anon;
