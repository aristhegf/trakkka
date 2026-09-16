# Trakkka — Phase 1 Audit of the original `trakkka` repository

Audited: commit `35ec331` on branch `claude/assetwatch-dashboard-eb2621` (worktree), 2026-09-16.

## 1. What is actually in the repo

| Item | Finding |
|---|---|
| Files | `index.html` (18.7 KB, single file), `README.md` (truncated mid-sentence at "cd trakkka"). Nothing else: no `package.json`, no `supabase/` folder, no migrations, no tests, no CI, no `.gitignore`, no env files. |
| Product | **A different product.** "Trakkka — Phone Theft Case Tracker" for police: a CRUD table of stolen-phone reports (victim name, phone number, IMEI, location text, officer notes). It is not an asset-location product. |
| Frontend | Vanilla HTML/CSS/JS in one file, DOM built with `innerHTML` template strings, inline `onclick` handlers. No framework, no build step, no TypeScript. |
| Backend | None. The browser talks directly to Supabase PostgREST. |
| Database | One table implied by the code: `public.phone_theft_cases` (`id text`, `theft_date`, `victim_name`, `victim_contact`, `phone_number`, `imei`, `location text`, `status`, `officer_notes`, `created_at`). README claims audit-log triggers exist; the SQL is not in the repo so it cannot be verified. No PostGIS, no geometry: `location` is free text. |
| Authentication | **None.** No Supabase Auth, no login, no session. Anyone with the URL can read/insert/update/delete every case. |
| Dependencies | `@supabase/supabase-js@2` from jsDelivr with an unpinned major tag (supply-chain risk: no SRI hash, floating version). |
| Map | None. |
| Realtime | One `postgres_changes` subscription on the whole `phone_theft_cases` table; on any change it re-fetches **all rows** (`loadCases()`), i.e. full refresh, not incremental. |
| Offline | `localStorage` fallback that is written only on save and read only on load failure; not a real offline queue. |
| Hosting | README says Vercel static site. No `vercel.json`. |

## 2. Security findings (existing code)

| # | Severity | Finding |
|---|---|---|
| S1 | Critical | **No authentication and (apparently) no RLS.** The client performs `select/insert/update/delete` with the anon key. If RLS is enabled with no policies the app would fail entirely, so either RLS is off or an "allow all to anon" policy exists. Either way the table of victims' names, phone numbers and IMEIs is world-readable and world-writable. *I could not confirm from inside this session (network probe of the project was blocked by the permission classifier); please check Supabase → Authentication → Policies for `phone_theft_cases`.* |
| S2 | High | Supabase project URL and publishable key are hard-coded in `index.html:190-191` and committed to a public GitHub repo. The publishable key is designed to be public **only if RLS is correct**, which S1 says it is not. |
| S3 | High | Sensitive PII (victim names, contact numbers, IMEIs) handled with no access control, no audit of *who* did what (no user identity exists to audit), no retention policy. |
| S4 | Medium | Client-generated primary keys (`PT-2026-000N` from `cases.length + 1`) collide as soon as two users add a case, or a case is deleted. |
| S5 | Medium | `deleteCase` performs a hard delete from the browser. No soft delete, no recovery. |
| S6 | Low | Unpinned CDN dependency without Subresource Integrity. |
| S7 | Low | `highlightMatch` builds a `RegExp` from user input (escaped, fine) and injects `<span>` into `innerHTML` after escaping. Correct as written, but the pattern (string-built HTML) is fragile. |

## 3. Scalability findings (existing code)

- Every realtime event triggers a full-table refetch and full re-render: O(N) per change, N = all rows.
- `postgres_changes` on a public table with the anon role means every connected browser receives every change for every user. This does not scale past a single team and is the wrong primitive for per-user asset streams.
- No pagination, no indexes declared, no partitioning.

## 4. Reuse decision

| Component | Decision | Reason |
|---|---|---|
| `index.html` | **Replace entirely** | Different product, no framework, no auth, insecure data path. Nothing is worth porting; the new Trakkka UI is map-first. |
| `phone_theft_cases` table | **Do not reuse; do not touch** | Unrelated data. Leave it untouched in the Supabase project (or the user can drop it). Trakkka tables are new. |
| Supabase project `aacluaqznzfgstwirbhk` | **Reusable as infrastructure, but recommend a fresh project** | A fresh project gives a clean schema, clean auth config, and avoids inheriting whatever open policies exist. If the same project is kept, the publishable key should be rotated after S1 is fixed. |
| Supabase + Vercel choice | **Keep** | Matches the stated stack preference and is a good fit (Postgres + PostGIS + Auth + Realtime + Storage in one). |
| README | **Replace** | Describes the old product. |
| Git history | **Keep** | New work goes in on this branch; history stays. |

Net: the "existing project" is an empty starting point. The new Trakkka is a greenfield build inside this repo.

## 5. What is missing (everything in the brief)

Auth · profiles · asset model with type-specific profiles · PostGIS location model · ingestion API with
validation, idempotency, out-of-order protection · provider abstraction · simulated provider · map ·
clustering · freshness states · location history and retention · geofences · alert rules and
notifications · admin/observability · rate limiting · webhook signature verification · audit log tied to
a real identity · tests · CI · TypeScript · any mobile companion.

## 6. Environment constraints found in this session

- Node 24.18, npm 12, git 2.55 available.
- **Docker is not installed**, so `supabase start` (local Postgres/PostGIS/Realtime) is not available.
  Consequence: schema migrations and RLS tests (pgTAP) must run against a hosted Supabase project or a
  Supabase branch. Unit tests (normalisation, freshness, idempotency logic) run locally with no DB.

## 7. Prioritised implementation plan

Priority definitions: **P0** must exist before anything is deployed; **P1** required for a functional
product; **P2** important improvements; **P3** future.

### P0 — foundation (blocks MVP)
1. Fresh Next.js 15 + TypeScript + Tailwind project in this repo; delete `index.html`.
2. Supabase Auth with email/password + Google OAuth, `@supabase/ssr` cookie sessions, middleware-guarded routes, logout, password reset, `delete_my_account()` RPC. Apple Sign In is P1 (needs a paid Apple Developer account and a Services ID).
3. Schema migration 0001 (see `02-database-schema.md`): PostGIS, enums, `profiles`, `tracking_providers`, `assets`, `asset_states`, type profiles, `asset_devices`, `locations` (partitioned), `ingest_events`, `geofences`, `geofence_assets`, `geofence_events`, `alert_rules`, `alerts`, `notification_preferences`, `notification_events`, `push_subscriptions`, `location_sharing_permissions`, `audit_logs`, `provider_credentials`. **RLS enabled on every table with policies in the same migration.**
4. `ingest_location()` SECURITY DEFINER function: validation, idempotency, out-of-order guard, state update, geofence evaluation, alert creation. This is the single write path for location data.
5. `POST /api/ingest/[provider]` route handler: per-device bearer token (hash compared), zod validation, provider adapter → normalised record → RPC. Service-role key server-only.
6. Realtime: `asset_states` trigger → `realtime.broadcast_changes` on private topic `owner:{uid}`; client subscribes to one channel.
7. Simulated provider: Node script that replays Lagos routes (Lekki → VI → Ikoyi, pet wandering in Lekki Phase 1, phone stationary in Ikoyi) into the ingest API every few seconds, with deliberate duplicates, out-of-order and bad-coordinate events.
8. `.env.example`, secrets policy, `.gitignore`.

### P1 — functional product
9. Map (MapLibre GL + react-map-gl; tile provider per `01-architecture.md`), typed markers, clustering, accuracy circles, freshness badges, map/satellite toggle, fit-all, centre-on-asset, browser geolocation.
10. Dashboard shell: sidebar / map / detail panel on desktop; map-first with bottom sheet on mobile; sections All/Devices/Pets/Vehicles/Offline/Alerts; summary stats.
11. Asset CRUD with type-specific forms; photo upload to a private bucket with signed URLs.
12. Asset detail page: status, location, last updated, battery, tabs (Live Map, History, Geofences, Alerts, Settings).
13. Location history: range picker (today/yesterday/7d/30d/custom), trail on map, timeline, vehicle stats (distance, avg/max speed, driving duration, stops), pet stats (distance, time away from home).
14. Geofences: circle + polygon editor, asset assignment, enter/exit rules, events list.
15. Alerts: rules UI, in-app alert centre, email channel (Resend), dispatcher abstraction with `notification_events` log.
16. Freshness thresholds per provider; "no report" alert job (pg_cron).
17. Reverse geocoding with geohash cache for "Location: Lekki" labels.
18. Apple Sign In (once an Apple Developer account exists).
19. Tests: Vitest unit (normalisers, freshness, idempotency), pgTAP RLS (hosted), Playwright smoke (desktop + mobile viewport).

### P2 — important improvements
20. Real provider #1: **Traccar** (self-hosted or Traccar Cloud) position forwarding → ingest; per-integration secret; admin view of forward failures. Covers vehicles and GPS pet collars that speak GT06/Teltonika protocols.
21. Browser Geolocation provider ("this device") with explicit consent toggle, foreground only.
22. Web Push (VAPID) channel; Safari requires Home Screen install.
23. Trips table + trip detection; daily summaries + retention jobs; partition management (pg_partman).
24. Admin area: providers, integrations, last sync, ingest events, failed updates, notification failures, realtime presence.
25. Rate limiting (Vercel Firewall rules + per-token DB token bucket), request size limits, structured logging, Sentry.
26. Dark/light theme polish, accessibility pass, marker animation (interpolated movement only for `live` sources).
27. CI: typecheck, lint, unit tests, migration dry-run.

### P3 — future
28. iOS companion app (Expo) as the **only** officially supported way to get an Apple device's location: Core Location with significant-change + visits, background mode, offline queue, battery level. Android sibling.
29. Apple devices / AirTags represented as `apple_findmy_reported` assets: manual "last seen" entry and deep links to Find My; no location API exists (see `03-integrations.md`).
30. Location sharing UI (grant/revoke/expiry) on the existing permissions table; shared-asset views; audit.
31. flespi as a managed alternative to Traccar; additional telematics adapters behind the same interface.
32. SMS channel (Termii/Africa's Talking for Nigeria), Telegram/WhatsApp channels.
33. Scale steps: Broadcast fan-out tuning, read replicas, TimescaleDB-style compression if history volume warrants, edge ingestion.
