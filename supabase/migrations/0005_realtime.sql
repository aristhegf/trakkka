-- AssetWatch migration 0005: Broadcast-from-database triggers
-- One private topic per user: owner:<uuid>. Clients subscribe once; the DB fans out state and alert changes.

create or replace function public.broadcast_asset_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.broadcast_changes(
    'owner:' || new.owner_id::text,  -- topic
    'asset_state',                    -- event
    TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA,
    new, old);
  return null;
end $$;

drop trigger if exists asset_states_broadcast on public.asset_states;
create trigger asset_states_broadcast
  after insert or update on public.asset_states
  for each row execute function public.broadcast_asset_state();

create or replace function public.broadcast_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.broadcast_changes(
    'owner:' || new.owner_id::text, 'alert', TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old);
  return null;
end $$;

drop trigger if exists alerts_broadcast on public.alerts;
create trigger alerts_broadcast
  after insert or update on public.alerts
  for each row execute function public.broadcast_alert();

create or replace function public.broadcast_geofence_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform realtime.broadcast_changes(
    'owner:' || new.owner_id::text, 'geofence_asset', TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old);
  return null;
end $$;

drop trigger if exists geofence_assets_broadcast on public.geofence_assets;
create trigger geofence_assets_broadcast
  after update of is_inside on public.geofence_assets
  for each row execute function public.broadcast_geofence_state();
