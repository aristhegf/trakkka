-- AssetWatch migration 0006: tracking providers (reference data)
-- Thresholds are seconds. live_after_s = 0 means the provider can never be "live".
-- offline_after_s = 0 disables the no-report alert for that provider.

insert into public.tracking_providers
  (key, name, kind, capabilities, live_after_s, recent_after_s, stale_after_s, offline_after_s, min_sample_interval_s)
values
  ('simulated', 'Simulated tracker', 'push_webhook',
   '{"battery":true,"speed":true,"heading":true,"accuracy":true,"ignition":true,"history":true,"connection":true}',
   30, 300, 900, 600, 3),
  ('manual', 'Manual entry', 'manual',
   '{"battery":false,"speed":false,"heading":false,"accuracy":false,"ignition":false,"history":true,"connection":false}',
   0, 3600, 86400, 0, 0),
  ('browser_geolocation', 'This browser (Geolocation API)', 'client_reported',
   '{"battery":false,"speed":true,"heading":true,"accuracy":true,"ignition":false,"history":true,"connection":false}',
   60, 300, 900, 0, 5),
  ('ios_companion', 'AssetWatch iOS app', 'client_reported',
   '{"battery":true,"speed":true,"heading":true,"accuracy":true,"ignition":false,"history":true,"connection":false}',
   120, 900, 3600, 21600, 10),
  ('traccar', 'Traccar (GPS tracker)', 'push_webhook',
   '{"battery":true,"speed":true,"heading":true,"accuracy":false,"ignition":true,"history":true,"connection":true}',
   30, 300, 900, 1800, 5),
  ('flespi', 'flespi (GPS tracker)', 'push_webhook',
   '{"battery":true,"speed":true,"heading":true,"accuracy":false,"ignition":true,"history":true,"connection":true}',
   30, 300, 900, 1800, 5),
  ('apple_findmy_reported', 'Apple Find My (manual check-in)', 'manual',
   '{"battery":false,"speed":false,"heading":false,"accuracy":false,"ignition":false,"history":true,"connection":false}',
   0, 3600, 86400, 0, 0)
on conflict (key) do update set
  name = excluded.name, kind = excluded.kind, capabilities = excluded.capabilities,
  live_after_s = excluded.live_after_s, recent_after_s = excluded.recent_after_s,
  stale_after_s = excluded.stale_after_s, offline_after_s = excluded.offline_after_s,
  min_sample_interval_s = excluded.min_sample_interval_s;
