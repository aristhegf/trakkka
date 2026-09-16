-- AssetWatch migration 0008: explicit enum casts in evaluate_geofences and sweep_no_report
--
-- Bug found in live testing: a CASE over string literals resolves to text, and an INSERT ... SELECT
-- with a bare literal also yields text, so Postgres refused to write them into enum columns:
--   column "event_type" is of type geofence_event_type but expression is of type text
-- Every geofence exit/entry therefore rolled the whole ingest back (correctly atomic, but no event),
-- and the minute-by-minute no-report sweep failed silently under pg_cron. VALUES lists coerce
-- unknown literals to the column type, which is why the battery/speed alerts were unaffected.

create or replace function public.evaluate_geofences(
  p_asset_id uuid, p_owner_id uuid, p_asset_name text,
  p_geom extensions.geography, p_accuracy_m real, p_location_id bigint, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_inside boolean;
  v_dist double precision;
  v_ambiguous boolean;
  v_event public.geofence_event_type;
begin
  for r in
    select ga.geofence_id, ga.notify_on_enter, ga.notify_on_exit, ga.is_inside, ga.last_transition_at,
           g.geom as fence_geom, g.name as fence_name
    from public.geofence_assets ga
    join public.geofences g on g.id = ga.geofence_id
    where ga.asset_id = p_asset_id and g.is_active
  loop
    v_inside := ST_Covers(r.fence_geom, p_geom);
    v_dist := ST_Distance(ST_Boundary(r.fence_geom::geometry)::geography, p_geom);
    -- A fix whose accuracy radius straddles the boundary cannot prove a transition.
    v_ambiguous := p_accuracy_m is not null and p_accuracy_m > v_dist;

    if r.is_inside is null then
      update public.geofence_assets
        set is_inside = v_inside, last_evaluated_location_id = p_location_id
        where geofence_id = r.geofence_id and asset_id = p_asset_id;
    elsif v_inside <> r.is_inside and not v_ambiguous then
      v_event := case when v_inside then 'enter' else 'exit' end::public.geofence_event_type;

      update public.geofence_assets
        set is_inside = v_inside, last_transition_at = p_at, last_evaluated_location_id = p_location_id
        where geofence_id = r.geofence_id and asset_id = p_asset_id;

      insert into public.geofence_events (geofence_id, asset_id, owner_id, location_id, event_type, occurred_at, dwell_seconds)
      values (r.geofence_id, p_asset_id, p_owner_id, p_location_id, v_event, p_at,
              case when not v_inside and r.last_transition_at is not null
                   then extract(epoch from (p_at - r.last_transition_at))::int end);

      if (v_inside and r.notify_on_enter) or ((not v_inside) and r.notify_on_exit) then
        insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, data, location_id, triggered_at)
        values (p_owner_id, p_asset_id,
                case when v_inside then 'geofence_enter'::public.alert_type else 'geofence_exit'::public.alert_type end,
                case when v_inside then 'info'::public.alert_severity else 'warning'::public.alert_severity end,
                p_asset_name || case when v_inside then ' entered ' else ' left ' end || r.fence_name,
                null,
                jsonb_build_object('geofence_id', r.geofence_id, 'geofence_name', r.fence_name, 'accuracy_m', p_accuracy_m),
                p_location_id, p_at);
      end if;
    else
      update public.geofence_assets set last_evaluated_location_id = p_location_id
        where geofence_id = r.geofence_id and asset_id = p_asset_id;
    end if;
  end loop;
end $$;

create or replace function public.sweep_no_report()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with due as (
    select s.asset_id, s.owner_id, a.name, s.last_location_at, p.offline_after_s
    from public.asset_states s
    join public.assets a on a.id = s.asset_id and a.deleted_at is null and a.status = 'active' and a.is_tracking_enabled
    join public.tracking_providers p on p.key = a.tracking_provider_key
    where p.offline_after_s > 0 and p.kind <> 'manual'
      and s.last_location_at is not null
      and s.last_location_at < now() - make_interval(secs => p.offline_after_s)
  ), ins as (
    insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, data, triggered_at, dedupe_key)
    select owner_id, asset_id, 'no_report'::public.alert_type, 'warning'::public.alert_severity,
           name || ' has not reported for ' || round(extract(epoch from (now() - last_location_at)) / 60) || ' min',
           null, jsonb_build_object('last_location_at', last_location_at, 'threshold_s', offline_after_s), now(),
           'no_report:' || asset_id
    from due
    on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing
    returning 1
  ) select count(*) into v_count from ins;
  return v_count;
end $$;

revoke all on function public.sweep_no_report() from public, anon, authenticated;
revoke all on function public.evaluate_geofences(uuid, uuid, text, extensions.geography, real, bigint, timestamptz) from public, anon, authenticated;
