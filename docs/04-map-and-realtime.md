# AssetWatch — Map provider, realtime and infrastructure evaluation (verified 2026-09-16)

All prices and limits were read from vendor pages on the date above.

## 1. Map provider comparison

| | Mapbox GL JS v3 | Google Maps JS | MapLibre + MapTiler | MapLibre + Stadia | MapLibre + Protomaps (self-host) | MapLibre + OpenFreeMap | Leaflet + tile.osm.org |
|---|---|---|---|---|---|---|---|
| Free tier | 50k map loads/mo | 10k calls per SKU/mo ($200 credit retired Mar 2025) | 100k req, 5k sessions, **non-commercial only** | 200k credits, **non-commercial only** | Storage only; Cloudflare R2/Workers ≈ $0–5/mo | Unlimited, no key, commercial OK, no SLA | Free, "no SLA", may be blocked |
| Paid | $5/1k loads → $2.50 at 1M+ | Dynamic Maps $7/1k → $0.53 at 5M+ | Flex $30/mo: 25k sessions, 500k req, commercial | $20/1M credits (satellite = 4 credits/tile) | ~$0 | donations | n/a |
| Library licence | Proprietary (v2+), tied to Mapbox account | Proprietary; results must be shown on a Google map | BSD-3 | BSD-3 | BSD-3 | BSD-3 | BSD-2 |
| Satellite | Yes (Maxar) | Yes (satellite/hybrid) | Yes, z14–19 aerial where available | Paid tiers only | Pair with Esri World Imagery (2M tiles/mo free) | No | No |
| Geocoding | 100k temp/mo free, $0.75/1k | 10k free, $5/1k, caching restricted | 1k sessions free, 3k on Flex | 20 credits/req | BYO | BYO | BYO |
| React binding | react-map-gl | @vis.gl/react-google-maps | react-map-gl/maplibre | same | same | same | react-leaflet |

Sources: https://www.mapbox.com/pricing · https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt ·
https://developers.google.com/maps/billing-and-pricing/pricing · https://developers.google.com/maps/documentation/javascript/policies ·
https://www.maptiler.com/cloud/pricing/ · https://stadiamaps.com/pricing · https://openfreemap.org/ ·
https://operations.osmfoundation.org/policies/tiles/ · https://location.arcgis.com/pricing/ ·
https://docs.protomaps.com/deploy/cloudflare · https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt

Constraints that matter:
- Google's policy: Maps JavaScript API results "must be displayed on Google Maps"; Google content cannot be overlaid on a non-Google map. So Google satellite or Places cannot be mixed into a MapLibre map.
- Mapbox GL JS v2+ is proprietary and terminates without an active Mapbox account.
- The public OSM tile server forbids heavy/commercial use and may block without notice. Not a production basemap.

### Lagos coverage
OSM's Nigeria project page flags gaps in "west and northwest parts of Lagos" local streets (old note), while the
metro's major roads and the Island/Lekki corridor are well mapped; Nigeria has Africa's largest YouthMappers
presence. Google has Street View and Plus Codes in Lagos and materially better address search.
Conclusion: OSM-derived vector tiles are adequate as a **basemap for asset dots**; Google is stronger for
**address search**, which is not the core of this product.
Sources: https://wiki.openstreetmap.org/wiki/WikiProject_Nigeria · https://www.hotosm.org/en/news/the-state-of-openstreetmap-in-africa/

### Marker performance
MapLibre: one GeoJSON source with `cluster: true`, `updateData` for incremental changes, `promoteId` for stable
feature ids; deck.gl `MapLibreOverlay` as the 100k+ upgrade path. Google: AdvancedMarkerElement + MarkerClusterer,
DOM-based, slower beyond a few thousand visible markers.
Sources: https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ · https://deck.gl/docs/api-reference/maplibre/overview ·
https://developers.google.com/maps/documentation/javascript/marker-clustering

### Decision
**MapLibre GL JS via `react-map-gl/maplibre`.** Tile host: **MapTiler** (free tier for development is
non-commercial; Flex $30/mo once the product is used commercially) with **OpenFreeMap** as a zero-cost fallback
style (switching hosts is a style URL change). Satellite: MapTiler Hybrid, or Esri World Imagery with attribution.
Reverse geocoding: server-side only, cached by geohash-7 cell, via **OpenCage** (its terms permit storing results;
2,500/day free for testing, $50/mo for 10k/day). Mapbox Geocoding is cheaper per request but its *temporary*
results may not be cached, which defeats the cell cache; no Nominatim in production (1 req/s policy). Without a
key the UI shows coordinates instead of a place name.

Rejected: Google Maps (per-load pricing for an always-open dashboard, content lock-in, no mixing with own
satellite source; keep as fallback if Lagos address search becomes core). Mapbox GL JS (proprietary lock-in;
its geocoder is still used because it is the cheapest permissive option). Public OSM tiles (policy).

## 2. Supabase Realtime quotas

| | Free | Pro (spend cap) | Pro (no cap) / Team |
|---|---|---|---|
| Concurrent connections | 200 | 500 | 10,000 |
| Messages/s | 100 | 500 | 2,500 |
| Broadcast payload | 256 KB | 3 MB | 3 MB |
| Included messages/mo | 2M | 5M | 5M (+$2.50/M) |
| Edge Function invocations | 500k | 2M | 2M (+$2/M) |
| DB size | 500 MB | 8 GB | 8 GB |

Sources: https://supabase.com/docs/guides/realtime/limits · https://supabase.com/pricing ·
https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages

Counting rule: a Broadcast is one message sent plus one per subscribed client; a Postgres Change is one message
per listening client.

**Postgres Changes** authorises every event against each subscriber, is single-threaded, and Supabase says to use
Broadcast above ~3,000 subscribers on the same changes. **Broadcast from Database** (`realtime.broadcast_changes`
in a trigger, private channels with RLS on `realtime.messages`) evaluates RLS once at join and is benchmarked at
80,000 users / 10,000 msgs/s.
Sources: https://supabase.com/docs/guides/realtime/postgres-changes · https://supabase.com/docs/guides/realtime/broadcast ·
https://supabase.com/docs/guides/realtime/authorization · https://supabase.com/docs/guides/realtime/benchmarks

PostGIS, pg_cron (down to 1-second schedules, all plans) and pg_net are available on Supabase.
Sources: https://supabase.com/docs/guides/database/extensions/postgis · https://supabase.com/docs/guides/cron

## 3. Scaling table (10 s report interval, V = concurrent viewers)

| Assets | Writes | What breaks first | Fix |
|---|---|---|---|
| 10 | 1/s | Free-tier 2M messages/mo if every write is broadcast to V viewers (2.6M/mo at V=1). | Broadcast only on state change (moved > accuracy or 30 s elapsed); this is the ingest down-sampling rule. |
| 100 | 10/s | Message quota (26M×V/mo on Postgres Changes) and per-subscriber RLS. | Broadcast-from-DB on `owner:{uid}` topic (already the design); optional 1–2 s coalescing tick via pg_cron so outbound ≈ V msgs/tick. |
| 1,000 | 100/s | Messages/s ceiling (100 Free / 500 Pro-cap), single-threaded Postgres Changes, function invocation cost if one call per fix. | Pro without spend cap; batch device reports per request; coalesced ticks; partitioned history; serve initial map state from `asset_states` not history. |
| 10,000+ | 1,000/s | DB write throughput on small compute; 2,500 msgs/s once V > ~1,000; payload size (10k assets ≈ 800 KB/tick). | Topic per viewport cell or fleet; 2–5 s ticks; bigger compute; persistent ingest worker; dedicated pub/sub (Redis Streams + own WebSocket service) in front of Supabase. |

## 4. Vercel

- Hobby: free, **non-commercial personal use only**; 1M function invocations/mo; functions 300 s max; body limit 4.5 MB; cron **once per day only** (use pg_cron for sub-daily); WAF rate limiting: 1 rule, fixed window, 1M allowed requests included.
- Pro: $20/seat/mo; per-minute cron; 40 WAF rules.
Sources: https://vercel.com/docs/plans/hobby · https://vercel.com/docs/functions/limitations ·
https://vercel.com/docs/cron-jobs/usage-and-pricing · https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

Upstash Redis free tier (500k commands/mo) is enough for `@upstash/ratelimit` if the Postgres token bucket ever
becomes a bottleneck. Source: https://upstash.com/pricing/redis

## 5. Push and email

- Web Push works on iOS 16.4+ **only for Home Screen web apps**; standard VAPID; permission from a user gesture; no Apple Developer membership needed. iOS 18.4 added Declarative Web Push. Source: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Resend free: 3,000 emails/mo, **100/day cap**. Source: https://resend.com/pricing
- Future companion app: FCM is free; iOS delivery needs an APNs key from a paid Apple Developer account. Source: https://firebase.google.com/docs/cloud-messaging/ios/get-started

## 6. Cost summary

| Scale | Monthly cost (excl. hardware/SIMs) |
|---|---|
| MVP, 1 user, ≤ 10 assets, personal use | $0 (Supabase Free, Vercel Hobby, MapTiler free non-commercial or OpenFreeMap, Resend free) |
| Commercial use, ≤ 100 assets | ≈ $75–80 (Supabase Pro $25, Vercel Pro $20, MapTiler Flex $30, Resend free/Pro $20) |
| 1,000 assets | ≈ $150–300 (Pro without spend cap, compute add-on, message overage) |
| 10,000 assets | Team plan or dedicated realtime infra; hundreds to low thousands USD |
