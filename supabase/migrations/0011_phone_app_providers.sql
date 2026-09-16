-- Trakkka migration 0011: phone tracker apps (Traccar Client, OwnTracks)
-- Free store apps that post the phone's own location, so phones can be tracked without a native Trakkka app.
--
-- Freshness: both apps save battery by reporting on movement (distance/significant-change) and going quiet when
-- stationary, so a still phone is not "offline". Live means a fix in the last 2 minutes; the no-report alert waits
-- 6 hours. Users can enable a stationary heartbeat in the app to keep the badge fresher.

insert into public.tracking_providers
  (key, name, kind, capabilities, live_after_s, recent_after_s, stale_after_s, offline_after_s, min_sample_interval_s)
values
  ('traccar_client', 'Traccar Client app (phone)', 'client_reported',
   '{"battery":true,"speed":true,"heading":true,"accuracy":true,"ignition":false,"history":true,"connection":false}',
   120, 900, 3600, 21600, 10),
  ('owntracks', 'OwnTracks app (phone)', 'client_reported',
   '{"battery":true,"speed":true,"heading":true,"accuracy":true,"ignition":false,"history":true,"connection":false}',
   120, 900, 3600, 21600, 10)
on conflict (key) do update set
  name = excluded.name, kind = excluded.kind, capabilities = excluded.capabilities,
  live_after_s = excluded.live_after_s, recent_after_s = excluded.recent_after_s,
  stale_after_s = excluded.stale_after_s, offline_after_s = excluded.offline_after_s,
  min_sample_interval_s = excluded.min_sample_interval_s;
