# AssetWatch

One live map for the things you own: devices, pets, vehicles and anything else with a tracker.
Every displayed location carries its **source, timestamp, accuracy and freshness state**; nothing is
ever labelled "live" unless it is.

- Next.js 16 · TypeScript · Tailwind v4 · MapLibre GL (OpenFreeMap tiles by default)
- Supabase: Postgres + PostGIS, Auth, Realtime (Broadcast from database), Storage, pg_cron, Vault
- Provider abstraction with a **simulated tracker**, **Traccar** (GPS hardware), browser geolocation,
  manual entry and Apple Find My *manual check-in* (Apple exposes no location API, see `docs/03-integrations.md`)

Design and research documents live in [`docs/`](docs/): audit and roadmap, architecture, schema,
integration feasibility (Apple, vehicles, pets) and the map/realtime evaluation with sources.

---

## 1. Prerequisites

- Node 20+ (developed on Node 24) and npm
- A Supabase project (Free plan works for the MVP)
- Optional: Resend (email alerts), OpenCage (place names), MapTiler or another tile host (satellite)

## 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API) and
`SUPABASE_SERVICE_ROLE_KEY` (server only; never commit it). Generate `NOTIFY_DISPATCH_SECRET` with
`openssl rand -hex 32`.

## 3. Apply the database migrations

The schema, RLS policies, ingest functions, realtime triggers and cron jobs are in
`supabase/migrations/0001…0007`. Apply them **in order** either with the CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

or by pasting each file into the Supabase SQL editor, 0001 first. All statements are idempotent, so
re-running a file is safe.

After the migrations:

1. **Make yourself admin** (optional, unlocks `/admin`): `update public.profiles set is_admin = true where id = '<your-user-uuid>';`
   `is_admin` cannot be changed through the API by design.
2. **Enable email/push dispatch** (optional): store the dispatcher URL and secret in Vault so pg_cron can call it every minute:
   ```sql
   select vault.create_secret('https://<your-domain>/api/notify/dispatch', 'assetwatch_dispatch_url');
   select vault.create_secret('<NOTIFY_DISPATCH_SECRET value>', 'assetwatch_dispatch_secret');
   ```
3. **Legacy table**: if this Supabase project still holds the old `phone_theft_cases` table, run
   `supabase/optional/lockdown_legacy_table.sql` to put it behind RLS (export the data first if needed).

## 4. Auth providers

- **Email/password** works out of the box. Set Authentication → URL Configuration → Site URL to your app URL and add
  `https://<your-domain>/auth/confirm` and `https://<your-domain>/auth/callback` (plus the `http://localhost:4127` equivalents) to Redirect URLs.
- **Google**: create an OAuth client in Google Cloud, add `https://<project-ref>.supabase.co/auth/v1/callback` as the redirect URI,
  and enter the client id/secret under Authentication → Providers → Google.
- **Apple Sign In** is wired for later; it needs a paid Apple Developer account (Services ID, Team ID, Key ID, .p8).

## 5. Run

```bash
npm install
npm run dev
```

AssetWatch is pinned to **port 4127** on purpose (see the `dev`/`start` scripts in `package.json`), so it never
collides with another project's default `:3000` dev server. Open http://localhost:4127, sign up, and add an
asset. Choose **Simulated tracker** as the tracking method to get a
device token, then stream fake Lagos data into the real ingest pipeline:

```bash
npm run simulate -- --token awd_...:vehicle --interval 5
```

Or let the simulator create "Toyota Corolla", "Milo" (cat) and "iPhone" for your account and a **Home** geofence
(requires the service-role key in `.env.local`):

```bash
npm run simulate -- --seed you@example.com --chaos
```

`--chaos` injects duplicates, out-of-order fixes, (0,0) coordinates, future timestamps, batch uploads and an
offline event so you can watch the ingest function reject, deduplicate and re-order them (`/admin` shows every outcome).

## 6. Connecting a real GPS tracker (Traccar)

1. Run Traccar (Docker or a VPS), point the tracker at it (GT06 → port 5023, Teltonika → 5027).
2. In AssetWatch, create the asset with tracking method **Traccar** and the tracker's IMEI as the device ID. Copy the token.
3. In `traccar.xml`:
   ```xml
   <entry key='forward.enable'>true</entry>
   <entry key='forward.type'>json</entry>
   <entry key='forward.url'>https://<your-domain>/api/ingest/traccar</entry>
   <entry key='forward.header'>Authorization: Bearer awd_...</entry>
   <entry key='forward.retry.enable'>true</entry>
   <entry key='event.forward.enable'>true</entry>
   <entry key='event.forward.url'>https://<your-domain>/api/ingest/traccar</entry>
   <entry key='event.forward.header'>Authorization: Bearer awd_...</entry>
   ```
   Speed arrives in knots and is converted; a reported accuracy of 0 is stored as *unknown*, not as 0 m.

## 7. Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next + React hooks rules) |
| `npm test` | Vitest unit tests (freshness, adapters, geo, tokens) |
| `npm run simulate` | Location simulator, see above |

## 8. Deploy (Vercel)

Import the repo, set the same environment variables (service role key and dispatch secret as **sensitive**),
and set `NEXT_PUBLIC_APP_URL` to the production URL. Add the production URL to Supabase Redirect URLs.
The Vercel Hobby plan is for non-commercial use; move to Pro when the beta ends. Sub-daily jobs run in
pg_cron, not Vercel cron, so nothing else is needed.

## 9. Security notes

- RLS is enabled on every table; the browser only ever holds the publishable key.
- Location writes go through one `SECURITY DEFINER` function that validates, de-duplicates, refuses to overwrite a
  newer position with an older one, evaluates geofences and raises alerts in a single transaction.
- Device tokens are shown once and stored as SHA-256; rotate them from the asset's Settings tab.
- Provider credentials (Traccar API tokens, etc.) belong in Supabase Vault via `provider_credentials`; no client policy exists for that table.
- Account deletion removes the auth user, which cascades through every table, and deletes stored photos.
