-- AssetWatch migration 0009: places get a human-readable address
-- Geofences double as "places" (Home, Office, Vet ...). Store the address the user searched for or
-- typed so the list can show it, and expose it through the GeoJSON RPC.

alter table public.geofences add column if not exists address text check (address is null or char_length(address) <= 200);

drop function if exists public.upsert_geofence(uuid, text, public.geofence_kind, double precision, double precision, real, jsonb, text, text, boolean);

create or replace function public.upsert_geofence(
  p_id uuid, p_name text, p_kind public.geofence_kind, p_center_lat double precision, p_center_lng double precision,
  p_radius_m real, p_ring jsonb, p_color text, p_icon text, p_is_active boolean default true, p_address text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_geom extensions.geography; v_center extensions.geography; v_id uuid;
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
    insert into public.geofences (owner_id, name, kind, geom, center, radius_m, color, icon, is_active, address)
    values (auth.uid(), p_name, p_kind, v_geom, v_center, p_radius_m, p_color, p_icon, coalesce(p_is_active, true), nullif(trim(p_address), ''))
    returning id into v_id;
    perform public.audit('geofence.create', 'geofences', v_id::text, jsonb_build_object('name', p_name));
  else
    update public.geofences set name = p_name, kind = p_kind, geom = v_geom, center = v_center, radius_m = p_radius_m,
      color = p_color, icon = p_icon, is_active = coalesce(p_is_active, is_active), address = nullif(trim(p_address), '')
    where id = p_id and owner_id = auth.uid() returning id into v_id;
    if v_id is null then raise exception 'geofence not found'; end if;
    -- Geometry changed: force re-evaluation from scratch (no spurious enter/exit).
    update public.geofence_assets set is_inside = null where geofence_id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.get_geofences_geojson()
returns jsonb language sql stable security invoker set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'kind', g.kind, 'color', g.color, 'icon', g.icon, 'is_active', g.is_active,
    'radius_m', g.radius_m, 'address', g.address,
    'center', case when g.center is not null then jsonb_build_object('lat', ST_Y(g.center::geometry), 'lng', ST_X(g.center::geometry)) end,
    'geometry', ST_AsGeoJSON(g.geom)::jsonb,
    'assets', (select coalesce(jsonb_agg(jsonb_build_object('asset_id', ga.asset_id, 'is_inside', ga.is_inside,
                 'notify_on_enter', ga.notify_on_enter, 'notify_on_exit', ga.notify_on_exit, 'last_transition_at', ga.last_transition_at)), '[]'::jsonb)
               from public.geofence_assets ga where ga.geofence_id = g.id),
    'created_at', g.created_at
  ) order by g.created_at), '[]'::jsonb)
  from public.geofences g where g.owner_id = auth.uid();
$$;
