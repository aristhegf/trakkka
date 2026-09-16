-- AssetWatch migration 0003: functions (ingest pipeline, geofences, alerts, history, account)
-- All SECURITY DEFINER functions pin search_path to public + extensions (PostGIS lives in extensions).

-- Profile creation trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- audit helper
create or replace function public.audit(p_action text, p_table text, p_target text, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), p_action, p_table, p_target, p_meta);
$$;

-- ------------------------------------------------------------ access helper
create or replace function public.can_access_asset(p_asset uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assets a
    where a.id = p_asset and a.deleted_at is null and a.owner_id = auth.uid()
  ) or (
    not p_write and exists (
      select 1 from public.location_sharing_permissions s
      where s.asset_id = p_asset and s.grantee_id = auth.uid()
        and s.revoked_at is null and s.accepted_at is not null
        and (s.expires_at is null or s.expires_at > now())
    )
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- --------------------------------------------------------------- rate limit
-- Fixed-window counter. Returns true when the call is allowed.
create or replace function public.rate_limit_take(p_key text, p_limit int, p_window_s int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_allowed boolean;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_s) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_s) then now() else rl.window_start end
  returning (count <= p_limit) into v_allowed;
  return v_allowed;
end $$;

-- --------------------------------------------------------- geofence engine
create or replace function public.evaluate_geofences(
  p_asset_id uuid, p_owner_id uuid, p_asset_name text,
  p_geom extensions.geography, p_accuracy_m real, p_location_id bigint, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_inside boolean;
  v_dist double precision;
  v_ambiguous boolean;
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
      update public.geofence_assets
        set is_inside = v_inside, last_transition_at = p_at, last_evaluated_location_id = p_location_id
        where geofence_id = r.geofence_id and asset_id = p_asset_id;

      insert into public.geofence_events (geofence_id, asset_id, owner_id, location_id, event_type, occurred_at, dwell_seconds)
      values (r.geofence_id, p_asset_id, p_owner_id, p_location_id,
              case when v_inside then 'enter' else 'exit' end, p_at,
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

-- ----------------------------------------------------------- alert rules
create or replace function public.evaluate_alert_rules(
  p_asset_id uuid, p_owner_id uuid, p_asset_name text, p_asset_type public.asset_type,
  p_battery smallint, p_speed_mps real, p_location_id bigint, p_at timestamptz)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_low int := 20;
  v_crit int := 10;
  v_speed_limit int;
  r record;
begin
  for r in
    select rule_type, params from public.alert_rules
    where owner_id = p_owner_id and is_active and (asset_id is null or asset_id = p_asset_id)
    order by asset_id nulls first  -- asset-specific rules override global ones
  loop
    if r.rule_type = 'battery_low' then
      v_low := coalesce((r.params->>'threshold')::int, v_low);
    elsif r.rule_type = 'battery_critical' then
      v_crit := coalesce((r.params->>'threshold')::int, v_crit);
    elsif r.rule_type = 'speed_limit' then
      v_speed_limit := coalesce((r.params->>'speed_kph')::int, v_speed_limit);
    end if;
  end loop;

  if p_asset_type = 'vehicle' and v_speed_limit is null then
    select speed_limit_kph into v_speed_limit from public.vehicle_profiles where asset_id = p_asset_id;
  end if;

  if p_battery is not null then
    if p_battery <= v_crit then
      insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, data, location_id, triggered_at, dedupe_key)
      values (p_owner_id, p_asset_id, 'battery_critical', 'critical',
              p_asset_name || ' battery critically low (' || p_battery || '%)', null,
              jsonb_build_object('battery_level', p_battery, 'threshold', v_crit), p_location_id, p_at,
              'battery_critical:' || p_asset_id)
      on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing;
    elsif p_battery <= v_low then
      insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, data, location_id, triggered_at, dedupe_key)
      values (p_owner_id, p_asset_id, 'battery_low', 'warning',
              p_asset_name || ' battery low (' || p_battery || '%)', null,
              jsonb_build_object('battery_level', p_battery, 'threshold', v_low), p_location_id, p_at,
              'battery_low:' || p_asset_id)
      on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing;
    end if;
    update public.alerts set resolved_at = p_at
      where asset_id = p_asset_id and resolved_at is null
        and ((alert_type = 'battery_low' and p_battery > v_low + 5)
          or (alert_type = 'battery_critical' and p_battery > v_crit + 5));
  end if;

  if v_speed_limit is not null and p_speed_mps is not null then
    if p_speed_mps * 3.6 > v_speed_limit then
      insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, data, location_id, triggered_at, dedupe_key)
      values (p_owner_id, p_asset_id, 'speed_limit', 'warning',
              p_asset_name || ' exceeded ' || v_speed_limit || ' km/h (' || round((p_speed_mps * 3.6)::numeric) || ' km/h)', null,
              jsonb_build_object('speed_kph', round((p_speed_mps * 3.6)::numeric, 1), 'limit_kph', v_speed_limit), p_location_id, p_at,
              'speed_limit:' || p_asset_id)
      on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing;
    else
      update public.alerts set resolved_at = p_at
        where asset_id = p_asset_id and alert_type = 'speed_limit' and resolved_at is null;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------ ingest log
create or replace function public._log_ingest(
  p_provider text, p_device uuid, p_owner uuid, p_external text, p_status public.ingest_status,
  p_reason text, p_location bigint, p_payload jsonb, p_started timestamptz, p_ip inet, p_ua text)
returns void language sql security definer set search_path = public as $$
  insert into public.ingest_events (provider_key, device_id, owner_id, external_device_id, status, reason, location_id,
                                    payload, payload_sha256, processing_ms, request_ip, user_agent)
  values (p_provider, p_device, p_owner, p_external, p_status, p_reason, p_location,
          case when p_status in ('accepted','sampled') then null else p_payload end,
          case when p_payload is null then null else encode(extensions.digest(p_payload::text, 'sha256'), 'hex') end,
          (extract(epoch from (clock_timestamp() - p_started)) * 1000)::int, p_ip, p_ua);
$$;

-- ---------------------------------------------------------- ingest_location
-- The single write path for location data. Called by the server with the service role.
create or replace function public.ingest_location(
  p_device_id uuid,
  p_recorded_at timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m real default null,
  p_altitude_m real default null,
  p_speed_mps real default null,
  p_heading_deg real default null,
  p_battery_level smallint default null,
  p_source text default null,
  p_provider_event_id text default null,
  p_connection_status public.connection_status default null,
  p_ignition_on boolean default null,
  p_fuel_level_pct real default null,
  p_odometer_km real default null,
  p_extra jsonb default null,
  p_request_ip inet default null,
  p_user_agent text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_started timestamptz := clock_timestamp();
  v_now timestamptz := now();
  v_dev public.asset_devices%rowtype;
  v_asset public.assets%rowtype;
  v_state public.asset_states%rowtype;
  v_prov public.tracking_providers%rowtype;
  v_geom extensions.geography;
  v_loc_id bigint;
  v_status public.ingest_status;
  v_reason text;
  v_source text;
  v_movement public.movement_state := 'unknown';
  v_displacement double precision;
  v_dt double precision;
  v_sampled boolean := false;
  v_geohash text;
  v_place_changed boolean := false;
  v_conn public.connection_status;
  v_payload jsonb := jsonb_build_object(
    'recorded_at', p_recorded_at, 'lat', p_latitude, 'lng', p_longitude, 'accuracy_m', p_accuracy_m,
    'speed_mps', p_speed_mps, 'battery', p_battery_level, 'event_id', p_provider_event_id, 'source', p_source);
begin
  select * into v_dev from public.asset_devices where id = p_device_id;
  if not found then
    perform public._log_ingest(p_source, p_device_id, null, null, 'rejected', 'unknown_device', null, v_payload, v_started, p_request_ip, p_user_agent);
    return jsonb_build_object('status', 'rejected', 'reason', 'unknown_device');
  end if;

  select * into v_asset from public.assets where id = v_dev.asset_id and deleted_at is null;
  if not found then
    v_reason := 'asset_missing';
  elsif v_asset.status = 'archived' or not v_asset.is_tracking_enabled then
    v_reason := 'tracking_disabled';
  elsif v_dev.status <> 'active' then
    v_reason := 'device_paused';
  elsif p_recorded_at is null then
    v_reason := 'missing_timestamp';
  elsif p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    v_reason := 'invalid_coordinates';
  elsif abs(p_latitude) < 0.0001 and abs(p_longitude) < 0.0001 then
    v_reason := 'null_island';
  elsif p_recorded_at > v_now + interval '5 minutes' then
    v_reason := 'future_timestamp';
  elsif p_recorded_at < v_now - interval '30 days' then
    v_reason := 'too_old';
  elsif p_accuracy_m is not null and p_accuracy_m > 50000 then
    v_reason := 'accuracy_out_of_range';
  elsif p_speed_mps is not null and (p_speed_mps < 0 or p_speed_mps > 150) then
    v_reason := 'speed_out_of_range';
  end if;

  if v_reason is not null then
    perform public._log_ingest(v_dev.provider_key, v_dev.id, v_dev.owner_id, v_dev.external_device_id, 'rejected', v_reason, null, v_payload, v_started, p_request_ip, p_user_agent);
    update public.asset_devices set last_error = v_reason, last_error_at = v_now where id = v_dev.id;
    return jsonb_build_object('status', 'rejected', 'reason', v_reason, 'asset_id', v_dev.asset_id);
  end if;

  v_source := coalesce(p_source, v_dev.provider_key);
  select * into v_prov from public.tracking_providers where key = v_dev.provider_key;

  -- Idempotency: provider event id, then exact timestamp per source.
  if p_provider_event_id is not null and exists (
    select 1 from public.locations
    where asset_id = v_asset.id and source = v_source and provider_event_id = p_provider_event_id
      and recorded_at between p_recorded_at - interval '1 day' and p_recorded_at + interval '1 day'
  ) then
    perform public._log_ingest(v_dev.provider_key, v_dev.id, v_dev.owner_id, v_dev.external_device_id, 'duplicate', 'provider_event_id', null, v_payload, v_started, p_request_ip, p_user_agent);
    return jsonb_build_object('status', 'duplicate', 'reason', 'provider_event_id', 'asset_id', v_asset.id);
  end if;
  if exists (select 1 from public.locations where asset_id = v_asset.id and source = v_source and recorded_at = p_recorded_at) then
    perform public._log_ingest(v_dev.provider_key, v_dev.id, v_dev.owner_id, v_dev.external_device_id, 'duplicate', 'same_timestamp', null, v_payload, v_started, p_request_ip, p_user_agent);
    return jsonb_build_object('status', 'duplicate', 'reason', 'same_timestamp', 'asset_id', v_asset.id);
  end if;

  v_geom := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;

  select * into v_state from public.asset_states where asset_id = v_asset.id for update;
  if not found then
    insert into public.asset_states (asset_id, owner_id) values (v_asset.id, v_asset.owner_id) returning * into v_state;
  end if;

  if v_state.last_location_at is not null and p_recorded_at <= v_state.last_location_at then
    -- Older than what we already show: keep for history, never overwrite the current state.
    insert into public.locations (asset_id, owner_id, device_id, recorded_at, received_at, geom, accuracy_m, altitude_m, speed_mps, heading_deg,
                                  battery_level, source, provider_event_id, ignition_on, fuel_level_pct, odometer_km, extra)
    values (v_asset.id, v_asset.owner_id, v_dev.id, p_recorded_at, v_now, v_geom, p_accuracy_m, p_altitude_m, p_speed_mps, p_heading_deg,
            p_battery_level, v_source, p_provider_event_id, p_ignition_on, p_fuel_level_pct, p_odometer_km, p_extra)
    returning id into v_loc_id;
    update public.asset_states set last_received_at = v_now where asset_id = v_asset.id;
    update public.asset_devices set last_sync_at = v_now, last_error = null where id = v_dev.id;
    perform public._log_ingest(v_dev.provider_key, v_dev.id, v_dev.owner_id, v_dev.external_device_id, 'out_of_order', null, v_loc_id, v_payload, v_started, p_request_ip, p_user_agent);
    return jsonb_build_object('status', 'out_of_order', 'location_id', v_loc_id, 'asset_id', v_asset.id);
  end if;

  if v_state.geom is not null and v_state.last_location_at is not null then
    v_displacement := ST_Distance(v_state.geom, v_geom);
    v_dt := extract(epoch from (p_recorded_at - v_state.last_location_at));
  end if;

  v_movement := case
    when p_speed_mps is not null then (case when p_speed_mps >= 0.8 then 'moving' else 'stationary' end)::public.movement_state
    when v_displacement is not null and v_dt is not null and v_dt > 0 then
      (case when v_displacement > greatest(coalesce(p_accuracy_m, 0), 10) and (v_displacement / v_dt) >= 0.5
            then 'moving' else 'stationary' end)::public.movement_state
    else 'unknown'::public.movement_state end;

  -- Down-sampling: too soon and within the accuracy radius => update state, skip history.
  if v_dt is not null and v_dt < v_prov.min_sample_interval_s
     and v_displacement is not null and v_displacement <= coalesce(p_accuracy_m, 5) then
    v_sampled := true;
  end if;

  if not v_sampled then
    insert into public.locations (asset_id, owner_id, device_id, recorded_at, received_at, geom, accuracy_m, altitude_m, speed_mps, heading_deg,
                                  battery_level, source, provider_event_id, ignition_on, fuel_level_pct, odometer_km, extra)
    values (v_asset.id, v_asset.owner_id, v_dev.id, p_recorded_at, v_now, v_geom, p_accuracy_m, p_altitude_m, p_speed_mps, p_heading_deg,
            p_battery_level, v_source, p_provider_event_id, p_ignition_on, p_fuel_level_pct, p_odometer_km, p_extra)
    returning id into v_loc_id;
  end if;

  v_geohash := ST_GeoHash(v_geom::geometry, 7);
  v_place_changed := v_geohash is distinct from v_state.place_geohash;

  v_conn := coalesce(p_connection_status,
                     case when v_prov.kind in ('push_webhook', 'client_reported') then 'online'::public.connection_status
                          else 'unknown'::public.connection_status end);

  update public.asset_states set
    geom = v_geom, latitude = p_latitude, longitude = p_longitude,
    accuracy_m = p_accuracy_m, altitude_m = p_altitude_m, speed_mps = p_speed_mps, heading_deg = p_heading_deg,
    battery_level = coalesce(p_battery_level, battery_level),
    battery_updated_at = case when p_battery_level is not null then v_now else battery_updated_at end,
    connection_status = v_conn, connection_updated_at = v_now,
    movement_state = v_movement,
    last_location_at = p_recorded_at, last_received_at = v_now,
    last_location_id = coalesce(v_loc_id, last_location_id),
    last_source = v_source, last_provider_event_id = p_provider_event_id,
    place_geohash = v_geohash,
    place_label = case when v_place_changed then null else place_label end,
    updated_at = v_now
  where asset_id = v_asset.id;

  if v_asset.type = 'vehicle' then
    update public.vehicle_profiles set
      odometer_km = coalesce(p_odometer_km, odometer_km),
      fuel_level_pct = coalesce(p_fuel_level_pct, fuel_level_pct),
      ignition_on = coalesce(p_ignition_on, ignition_on)
    where asset_id = v_asset.id;
  end if;

  -- A fresh fix resolves silence and offline alerts.
  update public.alerts set resolved_at = v_now
    where asset_id = v_asset.id and resolved_at is null and alert_type in ('no_report', 'location_unavailable')
       or (asset_id = v_asset.id and resolved_at is null and alert_type = 'tracker_offline' and v_conn = 'online');

  perform public.evaluate_geofences(v_asset.id, v_asset.owner_id, v_asset.name, v_geom, p_accuracy_m, v_loc_id, p_recorded_at);
  perform public.evaluate_alert_rules(v_asset.id, v_asset.owner_id, v_asset.name, v_asset.type, p_battery_level, p_speed_mps, v_loc_id, p_recorded_at);

  update public.asset_devices set last_sync_at = v_now, last_error = null where id = v_dev.id;

  v_status := case when v_sampled then 'sampled' else 'accepted' end;
  perform public._log_ingest(v_dev.provider_key, v_dev.id, v_dev.owner_id, v_dev.external_device_id, v_status, null, v_loc_id, v_payload, v_started, p_request_ip, p_user_agent);

  return jsonb_build_object(
    'status', v_status, 'location_id', v_loc_id, 'asset_id', v_asset.id, 'owner_id', v_asset.owner_id,
    'place_changed', v_place_changed, 'geohash', v_geohash, 'latitude', p_latitude, 'longitude', p_longitude,
    'movement', v_movement);
exception when others then
  perform public._log_ingest(coalesce(v_dev.provider_key, p_source), p_device_id, v_dev.owner_id, v_dev.external_device_id, 'error', sqlerrm, null, v_payload, v_started, p_request_ip, p_user_agent);
  return jsonb_build_object('status', 'error', 'reason', sqlerrm);
end $$;

-- ---------------------------------------------- status-only ingest (no fix)
create or replace function public.ingest_device_status(
  p_device_id uuid, p_connection_status public.connection_status, p_battery_level smallint default null,
  p_at timestamptz default now(), p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dev public.asset_devices%rowtype; v_asset public.assets%rowtype; v_now timestamptz := now();
begin
  select * into v_dev from public.asset_devices where id = p_device_id;
  if not found then return jsonb_build_object('status','rejected','reason','unknown_device'); end if;
  select * into v_asset from public.assets where id = v_dev.asset_id and deleted_at is null;
  if not found then return jsonb_build_object('status','rejected','reason','asset_missing'); end if;

  insert into public.asset_states (asset_id, owner_id) values (v_asset.id, v_asset.owner_id) on conflict do nothing;
  update public.asset_states set
    connection_status = p_connection_status, connection_updated_at = v_now,
    battery_level = coalesce(p_battery_level, battery_level),
    battery_updated_at = case when p_battery_level is not null then v_now else battery_updated_at end,
    last_received_at = v_now, updated_at = v_now
  where asset_id = v_asset.id;

  if p_connection_status = 'offline' then
    insert into public.alerts (owner_id, asset_id, alert_type, severity, title, body, triggered_at, dedupe_key)
    values (v_asset.owner_id, v_asset.id, 'tracker_offline', 'warning', v_asset.name || ' tracker went offline', p_reason, coalesce(p_at, v_now), 'tracker_offline:' || v_asset.id)
    on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing;
  elsif p_connection_status = 'online' then
    update public.alerts set resolved_at = v_now where asset_id = v_asset.id and alert_type = 'tracker_offline' and resolved_at is null;
  end if;
  update public.asset_devices set last_sync_at = v_now where id = v_dev.id;
  return jsonb_build_object('status', 'accepted', 'asset_id', v_asset.id, 'owner_id', v_asset.owner_id);
end $$;

-- --------------------------------------------------------- no-report sweep
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
    select owner_id, asset_id, 'no_report', 'warning',
           name || ' has not reported for ' || round(extract(epoch from (now() - last_location_at)) / 60) || ' min',
           null, jsonb_build_object('last_location_at', last_location_at, 'threshold_s', offline_after_s), now(),
           'no_report:' || asset_id
    from due
    on conflict (dedupe_key) where dedupe_key is not null and resolved_at is null do nothing
    returning 1
  ) select count(*) into v_count from ins;
  return v_count;
end $$;

-- --------------------------------------------------------------- history
create or replace function public.get_location_history(
  p_asset_id uuid, p_from timestamptz, p_to timestamptz, p_max_points int default 2000)
returns table (
  id bigint, recorded_at timestamptz, latitude double precision, longitude double precision,
  accuracy_m real, speed_mps real, heading_deg real, battery_level smallint, source text)
language sql stable security invoker set search_path = public, extensions as $$
  with pts as (
    select l.id, l.recorded_at, ST_Y(l.geom::geometry) as lat, ST_X(l.geom::geometry) as lng,
           l.accuracy_m, l.speed_mps, l.heading_deg, l.battery_level, l.source,
           row_number() over (order by l.recorded_at) as rn, count(*) over () as total
    from public.locations l
    where l.asset_id = p_asset_id and l.recorded_at >= p_from and l.recorded_at <= p_to
  )
  select id, recorded_at, lat, lng, accuracy_m, speed_mps, heading_deg, battery_level, source
  from pts
  where rn = 1 or rn = total
     or (rn % greatest(1, ceil(total::numeric / greatest(p_max_points, 10))::int)) = 0
  order by recorded_at;
$$;

create or replace function public.get_history_stats(p_asset_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = public, extensions as $$
  with pts as (
    select geom, recorded_at, speed_mps, accuracy_m,
           lag(geom) over (order by recorded_at) as pg,
           lag(recorded_at) over (order by recorded_at) as pt
    from public.locations
    where asset_id = p_asset_id and recorded_at >= p_from and recorded_at <= p_to
  ), segs as (
    select ST_Distance(pg, geom) as d, extract(epoch from (recorded_at - pt)) as dt, speed_mps, accuracy_m
    from pts where pg is not null
  )
  select jsonb_build_object(
    'point_count', (select count(*) from pts),
    'distance_m', coalesce(sum(d) filter (where d > greatest(coalesce(accuracy_m, 0), 5)), 0),
    'moving_seconds', coalesce(sum(dt) filter (where dt between 0 and 600 and d / nullif(dt, 0) >= 0.5), 0),
    'stopped_seconds', coalesce(sum(dt) filter (where dt between 0 and 3600 and (d / nullif(dt, 0) < 0.5 or d = 0)), 0),
    'max_speed_mps', max(speed_mps),
    'avg_moving_speed_mps', avg(speed_mps) filter (where speed_mps > 0.8),
    'first_at', (select min(recorded_at) from pts),
    'last_at', (select max(recorded_at) from pts))
  from segs;
$$;

-- --------------------------------------------------------------- retention
create or replace function public.compute_daily_summary(p_asset_id uuid, p_day date)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_from timestamptz; v_to timestamptz; v_stats jsonb; v_path extensions.geography;
begin
  select owner_id into v_owner from public.assets where id = p_asset_id;
  if v_owner is null then return; end if;
  v_from := p_day::timestamptz; v_to := (p_day + 1)::timestamptz - interval '1 microsecond';
  select public.get_history_stats(p_asset_id, v_from, v_to) into v_stats;
  select case when count(*) >= 2 then ST_Simplify(ST_MakeLine(geom::geometry order by recorded_at), 0.0002)::extensions.geography end
    into v_path from public.locations where asset_id = p_asset_id and recorded_at between v_from and v_to;
  insert into public.location_daily_summaries (asset_id, owner_id, day, distance_m, moving_seconds, stopped_seconds, max_speed_mps, avg_speed_mps, point_count, path, computed_at)
  values (p_asset_id, v_owner, p_day, (v_stats->>'distance_m')::real, (v_stats->>'moving_seconds')::int, (v_stats->>'stopped_seconds')::int,
          (v_stats->>'max_speed_mps')::real, (v_stats->>'avg_moving_speed_mps')::real, (v_stats->>'point_count')::int, v_path, now())
  on conflict (asset_id, day) do update set
    distance_m = excluded.distance_m, moving_seconds = excluded.moving_seconds, stopped_seconds = excluded.stopped_seconds,
    max_speed_mps = excluded.max_speed_mps, avg_speed_mps = excluded.avg_speed_mps, point_count = excluded.point_count,
    path = excluded.path, computed_at = now();
end $$;

create or replace function public.run_retention()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  -- Summaries for yesterday for every asset that has data.
  for r in select distinct asset_id from public.locations where recorded_at >= (current_date - 1)::timestamptz and recorded_at < current_date::timestamptz loop
    perform public.compute_daily_summary(r.asset_id, current_date - 1);
  end loop;
  -- Drop raw history partitions older than 4 months (raw retention >= 90 days).
  for r in select relname from pg_class where relname ~ '^locations_\d{4}_\d{2}$'
           and to_date(substring(relname from 11), 'YYYY_MM') < date_trunc('month', now() - interval '4 months') loop
    execute format('drop table if exists public.%I', r.relname);
  end loop;
  delete from public.locations_default where recorded_at < now() - interval '120 days';
  delete from public.ingest_events where received_at < now() - interval '14 days';
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.notification_events where queued_at < now() - interval '90 days';
  -- Hard-purge soft-deleted assets after 30 days.
  delete from public.assets where deleted_at is not null and deleted_at < now() - interval '30 days';
  perform public.ensure_locations_partition((date_trunc('month', now()) + interval '2 months')::date);
end $$;

-- ----------------------------------------------------- notification queue
create or replace function public.enqueue_alert_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pref public.notification_preferences%rowtype;
begin
  select * into v_pref from public.notification_preferences where owner_id = new.owner_id;
  insert into public.notification_events (alert_id, owner_id, channel, status, sent_at)
  values (new.id, new.owner_id, 'in_app', 'sent', now());
  if coalesce(v_pref.email, true) then
    insert into public.notification_events (alert_id, owner_id, channel, status) values (new.id, new.owner_id, 'email', 'queued');
  end if;
  if coalesce(v_pref.push, false) then
    insert into public.notification_events (alert_id, owner_id, channel, status) values (new.id, new.owner_id, 'push', 'queued');
  end if;
  return new;
end $$;
drop trigger if exists alerts_enqueue_notifications on public.alerts;
create trigger alerts_enqueue_notifications after insert on public.alerts
  for each row execute function public.enqueue_alert_notifications();

-- Claim a batch of queued notifications for the dispatcher (service role).
create or replace function public.claim_notifications(p_limit int default 50)
returns setof public.notification_events language sql security definer set search_path = public as $$
  with c as (
    select id from public.notification_events
    where status = 'queued' and attempts < 5
    order by queued_at
    limit p_limit
    for update skip locked
  )
  update public.notification_events n set attempts = n.attempts + 1
  from c where n.id = c.id
  returning n.*;
$$;

-- Ask the dispatcher (Next.js route) to send queued notifications; URL + secret come from Vault.
create or replace function public.trigger_notification_dispatch()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.notification_events where status = 'queued' and attempts < 5) then return; end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'assetwatch_dispatch_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'assetwatch_dispatch_secret';
  exception when others then
    return; -- Vault not configured
  end;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 15000);
end $$;

-- --------------------------------------------------------- account removal
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id) values (v_uid, 'account.delete', 'auth.users', v_uid::text);
  delete from storage.objects where bucket_id = 'asset-photos' and (storage.foldername(name))[1] = v_uid::text;
  delete from public.provider_credentials where owner_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- --------------------------------------------------------------- overview
create or replace view public.asset_overview with (security_invoker = true) as
select
  a.id, a.owner_id, a.name, a.type, a.status, a.photo_path, a.description, a.icon, a.color,
  a.tracking_provider_key, a.is_tracking_enabled, a.created_at, a.updated_at,
  s.latitude, s.longitude, s.accuracy_m, s.altitude_m, s.speed_mps, s.heading_deg,
  s.battery_level, s.battery_updated_at, s.connection_status, s.connection_updated_at, s.movement_state,
  s.last_location_at, s.last_received_at, s.last_source, s.place_label,
  p.live_after_s, p.recent_after_s, p.stale_after_s, p.offline_after_s, p.kind as provider_kind, p.capabilities as provider_capabilities,
  extract(epoch from (now() - s.last_location_at))::int as age_seconds,
  (select count(*) from public.alerts al where al.asset_id = a.id and al.acknowledged_at is null and al.resolved_at is null) as open_alert_count
from public.assets a
left join public.asset_states s on s.asset_id = a.id
left join public.tracking_providers p on p.key = a.tracking_provider_key
where a.deleted_at is null;

-- Geofences as GeoJSON for the client (avoids shipping WKB).
create or replace function public.get_geofences_geojson()
returns jsonb language sql stable security invoker set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'kind', g.kind, 'color', g.color, 'icon', g.icon, 'is_active', g.is_active,
    'radius_m', g.radius_m,
    'center', case when g.center is not null then jsonb_build_object('lat', ST_Y(g.center::geometry), 'lng', ST_X(g.center::geometry)) end,
    'geometry', ST_AsGeoJSON(g.geom)::jsonb,
    'assets', (select coalesce(jsonb_agg(jsonb_build_object('asset_id', ga.asset_id, 'is_inside', ga.is_inside,
                 'notify_on_enter', ga.notify_on_enter, 'notify_on_exit', ga.notify_on_exit, 'last_transition_at', ga.last_transition_at)), '[]'::jsonb)
               from public.geofence_assets ga where ga.geofence_id = g.id),
    'created_at', g.created_at
  ) order by g.created_at), '[]'::jsonb)
  from public.geofences g where g.owner_id = auth.uid();
$$;

-- Create/update a geofence from GeoJSON-ish input (circle: center + radius; polygon: ring of [lng,lat]).
create or replace function public.upsert_geofence(
  p_id uuid, p_name text, p_kind public.geofence_kind, p_center_lat double precision, p_center_lng double precision,
  p_radius_m real, p_ring jsonb, p_color text, p_icon text, p_is_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_geom extensions.geography; v_center extensions.geography; v_id uuid; v_pts geometry[]; i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_kind = 'circle' then
    if p_center_lat is null or p_center_lng is null or p_radius_m is null then raise exception 'circle needs center and radius'; end if;
    v_center := ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326)::geography;
    v_geom := ST_Buffer(v_center, p_radius_m, 'quad_segs=16');
  else
    if p_ring is null or jsonb_array_length(p_ring) < 3 then raise exception 'polygon needs at least 3 points'; end if;
    if jsonb_array_length(p_ring) > 200 then raise exception 'polygon too complex'; end if;
    v_geom := ST_GeomFromGeoJSON(jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
      (select jsonb_agg(pt) from jsonb_array_elements(p_ring) pt) || jsonb_build_array(p_ring->0)))::text)::extensions.geography;
    if not ST_IsValid(v_geom::geometry) then raise exception 'polygon is not valid'; end if;
    if ST_Area(v_geom) > 5e9 then raise exception 'polygon too large'; end if;
    v_center := ST_Centroid(v_geom::geometry)::extensions.geography;
  end if;

  if p_id is null then
    insert into public.geofences (owner_id, name, kind, geom, center, radius_m, color, icon, is_active)
    values (auth.uid(), p_name, p_kind, v_geom, v_center, p_radius_m, p_color, p_icon, coalesce(p_is_active, true))
    returning id into v_id;
    perform public.audit('geofence.create', 'geofences', v_id::text, jsonb_build_object('name', p_name));
  else
    update public.geofences set name = p_name, kind = p_kind, geom = v_geom, center = v_center, radius_m = p_radius_m,
      color = p_color, icon = p_icon, is_active = coalesce(p_is_active, is_active)
    where id = p_id and owner_id = auth.uid() returning id into v_id;
    if v_id is null then raise exception 'geofence not found'; end if;
    -- Geometry changed: force re-evaluation from scratch (no spurious enter/exit).
    update public.geofence_assets set is_inside = null where geofence_id = v_id;
  end if;
  return v_id;
end $$;

-- Stops for a range: consecutive points within 30 m for >= 5 minutes.
create or replace function public.get_stops(p_asset_id uuid, p_from timestamptz, p_to timestamptz)
returns table (started_at timestamptz, ended_at timestamptz, duration_s int, latitude double precision, longitude double precision)
language sql stable security invoker set search_path = public, extensions as $$
  with pts as (
    select recorded_at, geom, lag(geom) over (order by recorded_at) as pg
    from public.locations where asset_id = p_asset_id and recorded_at >= p_from and recorded_at <= p_to
  ), flagged as (
    select recorded_at, geom, case when pg is null or ST_Distance(pg, geom) > 30 then 1 else 0 end as brk from pts
  ), grp as (
    select recorded_at, geom, sum(brk) over (order by recorded_at) as g from flagged
  )
  select min(recorded_at), max(recorded_at), extract(epoch from (max(recorded_at) - min(recorded_at)))::int,
         ST_Y(ST_Centroid(ST_Collect(geom::geometry))), ST_X(ST_Centroid(ST_Collect(geom::geometry)))
  from grp group by g
  having extract(epoch from (max(recorded_at) - min(recorded_at))) >= 300
  order by 1;
$$;
