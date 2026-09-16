/**
 * Trakkka simulator: streams realistic Lagos location data into the real ingest API.
 *
 * Two ways to run:
 *   1. With device tokens you already have (no DB access needed):
 *        npm run simulate -- --url http://localhost:4127 --token awd_xxx[:vehicle|pet|device] --token awd_yyy:pet
 *   2. Seed mode (needs SUPABASE_SERVICE_ROLE_KEY in .env.local): creates "Toyota", "Milo" and "iPhone"
 *      for a user and streams to them:
 *        npm run simulate -- --seed you@example.com --url http://localhost:4127
 *
 * Options: --interval 5 (seconds between fixes), --duration 600 (seconds, 0 = forever), --chaos (inject duplicates,
 * out-of-order, bad coordinates, future timestamps), --quiet.
 *
 * The vehicle drives Lekki → Victoria Island → Ikoyi and back on a fixed route; the pet wanders around
 * Lekki Phase 1 and occasionally "leaves home"; the phone sits in Ikoyi with coarse accuracy.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

interface Args {
  url: string;
  tokens: { token: string; role: Role }[];
  seed: string | null;
  interval: number;
  duration: number;
  chaos: boolean;
  quiet: boolean;
}
type Role = "vehicle" | "pet" | "device";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function parseArgs(argv: string[]): Args {
  const a: Args = { url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127", tokens: [], seed: null, interval: 5, duration: 0, chaos: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--url") {
      a.url = v;
      i++;
    } else if (k === "--token") {
      const [token, role] = v.split(":");
      a.tokens.push({ token, role: (role as Role) ?? (["vehicle", "pet", "device"][a.tokens.length] as Role) ?? "vehicle" });
      i++;
    } else if (k === "--seed") {
      a.seed = v;
      i++;
    } else if (k === "--interval") {
      a.interval = Number(v);
      i++;
    } else if (k === "--duration") {
      a.duration = Number(v);
      i++;
    } else if (k === "--chaos") a.chaos = true;
    else if (k === "--quiet") a.quiet = true;
  }
  return a;
}

// ------------------------------------------------------------------ geometry
type LngLat = [number, number];
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
function dist([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = rad(lat2 - lat1),
    dLng = rad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function jitter(p: LngLat, metres: number): LngLat {
  const dx = (Math.random() - 0.5) * 2 * metres,
    dy = (Math.random() - 0.5) * 2 * metres;
  return [p[0] + dx / (111320 * Math.cos(rad(p[1]))), p[1] + dy / 110574];
}

// Lekki Phase 1 → Lekki-Epe Expressway → Falomo Bridge → Victoria Island → Ikoyi → back (approximate road points)
const VEHICLE_ROUTE: LngLat[] = [
  [3.4725, 6.4478], [3.4652, 6.4432], [3.4560, 6.4395], [3.4470, 6.4362], [3.4390, 6.4330],
  [3.4330, 6.4318], [3.4270, 6.4322], [3.4210, 6.4335], [3.4170, 6.4360], [3.4180, 6.4420],
  [3.4230, 6.4470], [3.4300, 6.4500], [3.4380, 6.4520], [3.4460, 6.4535], [3.4540, 6.4500],
  [3.4620, 6.4470], [3.4700, 6.4465], [3.4725, 6.4478],
];
const PET_HOME: LngLat = [3.4712, 6.4415]; // Lekki Phase 1
const PHONE_SPOT: LngLat = [3.4340, 6.4530]; // Ikoyi

interface Fix {
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  altitudeM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  batteryLevel: number | null;
  connectionStatus: "online" | "offline" | "unknown" | null;
  providerEventId: string | null;
  ignitionOn: boolean | null;
  fuelLevelPct: number | null;
  odometerKm: number | null;
  extra: Record<string, unknown> | null;
}

class VehicleSim {
  seg = 0;
  t = 0;
  speedKph = 0;
  battery = 100;
  odometer = 42315;
  fuel = 68;
  stopUntil = 0;
  seq = 0;
  next(now: Date, dtS: number): Fix {
    const a = VEHICLE_ROUTE[this.seg],
      b = VEHICLE_ROUTE[(this.seg + 1) % VEHICLE_ROUTE.length];
    const segLen = dist(a, b);
    let ignition = true;
    if (now.getTime() < this.stopUntil) {
      this.speedKph = 0;
      ignition = false;
    } else {
      // Lagos traffic: cruise 25–60 km/h with random slowdowns; occasionally stop for 40–90 s at a "junction".
      const target = 25 + Math.random() * 35;
      this.speedKph += (target - this.speedKph) * 0.3;
      if (Math.random() < 0.02) this.stopUntil = now.getTime() + (40 + Math.random() * 50) * 1000;
    }
    const advance = (this.speedKph / 3.6) * dtS;
    this.t += advance / Math.max(segLen, 1);
    while (this.t >= 1) {
      this.t -= 1;
      this.seg = (this.seg + 1) % VEHICLE_ROUTE.length;
    }
    const pos = jitter(lerp(VEHICLE_ROUTE[this.seg], VEHICLE_ROUTE[(this.seg + 1) % VEHICLE_ROUTE.length], this.t), 3);
    this.odometer += advance / 1000;
    this.fuel = Math.max(5, this.fuel - advance / 1000 / 12 * 100 / 45); // ~12 km/l, 45 l tank
    return {
      recordedAt: now.toISOString(),
      latitude: pos[1],
      longitude: pos[0],
      accuracyM: 5 + Math.random() * 6,
      altitudeM: 8,
      speedMps: this.speedKph / 3.6,
      headingDeg: bearing(a, b),
      batteryLevel: null, // external power
      connectionStatus: "online",
      providerEventId: `veh-${++this.seq}-${now.getTime()}`,
      ignitionOn: ignition,
      fuelLevelPct: Math.round(this.fuel),
      odometerKm: Math.round(this.odometer * 10) / 10,
      extra: { sat: 11, hdop: 0.9, power: 14.2 },
    };
  }
}

class PetSim {
  pos: LngLat = PET_HOME;
  battery = 78;
  away = false;
  seq = 0;
  next(now: Date, dtS: number): Fix {
    // Mostly stationary at home; every so often wanders up to ~300 m and comes back.
    if (!this.away && Math.random() < 0.01) this.away = true;
    if (this.away) {
      const home = dist(this.pos, PET_HOME);
      const toward = home > 300 || Math.random() < 0.3;
      const step = 0.6 * dtS; // ~0.6 m/s cat pace
      const target: LngLat = toward ? PET_HOME : jitter(this.pos, 60);
      const d = dist(this.pos, target) || 1;
      this.pos = lerp(this.pos, target, Math.min(1, step / d));
      if (home < 5 && toward) this.away = false;
    }
    this.battery = Math.max(3, this.battery - dtS / 3600); // ~1%/h
    const moving = this.away;
    return {
      recordedAt: now.toISOString(),
      latitude: this.pos[1],
      longitude: this.pos[0],
      accuracyM: moving ? 8 + Math.random() * 20 : 20 + Math.random() * 130, // indoors GPS is poor
      altitudeM: null,
      speedMps: moving ? 0.4 + Math.random() * 0.6 : 0,
      headingDeg: moving ? Math.random() * 360 : null,
      batteryLevel: Math.round(this.battery),
      connectionStatus: "online",
      providerEventId: `pet-${++this.seq}-${now.getTime()}`,
      ignitionOn: null,
      fuelLevelPct: null,
      odometerKm: null,
      extra: null,
    };
  }
}

class PhoneSim {
  battery = 61;
  seq = 0;
  next(now: Date, dtS: number): Fix {
    this.battery = Math.max(2, this.battery - dtS / 900); // drains ~4%/h
    const p = jitter(PHONE_SPOT, 15);
    return {
      recordedAt: now.toISOString(),
      latitude: p[1],
      longitude: p[0],
      accuracyM: 35 + Math.random() * 60,
      altitudeM: 12,
      speedMps: 0,
      headingDeg: null,
      batteryLevel: Math.round(this.battery),
      connectionStatus: "online",
      providerEventId: `dev-${++this.seq}-${now.getTime()}`,
      ignitionOn: null,
      fuelLevelPct: null,
      odometerKm: null,
      extra: null,
    };
  }
}

// ------------------------------------------------------------------ seed
async function seed(email: string): Promise<{ token: string; role: Role }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Seed mode needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No user with email ${email}. Sign up in the app first.`);

  const specs: { role: Role; name: string; type: string; profile: Record<string, unknown> }[] = [
    { role: "vehicle", name: "Toyota Corolla", type: "vehicle", profile: { make: "Toyota", model: "Corolla", year: 2019, registration_number: "LND 482 KJ", color: "Silver", fuel_type: "petrol", speed_limit_kph: 80 } },
    { role: "pet", name: "Milo", type: "pet", profile: { species: "Cat", breed: "Maine Coon", sex: "male", weight_kg: 6.2 } },
    { role: "device", name: "iPhone", type: "device", profile: { device_type: "phone", manufacturer: "Apple", model: "iPhone 16", os: "iOS" } },
  ];
  const out: { token: string; role: Role }[] = [];
  for (const s of specs) {
    const externalId = `sim:${s.role}:${user.id.slice(0, 8)}`;
    let assetId: string;
    const { data: existingDev } = await admin.from("asset_devices").select("id, asset_id").eq("provider_key", "simulated").eq("external_device_id", externalId).maybeSingle();
    if (existingDev) {
      assetId = existingDev.asset_id;
    } else {
      const { data: asset, error: aErr } = await admin.from("assets").insert({ owner_id: user.id, name: s.name, type: s.type, tracking_provider_key: "simulated" }).select("id").single();
      if (aErr || !asset) throw aErr ?? new Error("asset insert failed");
      assetId = asset.id;
      const table = s.type === "vehicle" ? "vehicle_profiles" : s.type === "pet" ? "pet_profiles" : "device_profiles";
      await admin.from(table).upsert({ asset_id: assetId, owner_id: user.id, ...s.profile });
    }
    const token = "awd_" + randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const { error: dErr } = await admin.from("asset_devices").upsert({ asset_id: assetId, owner_id: user.id, provider_key: "simulated", external_device_id: externalId, tracker_model: "Simulator", ingest_token_hash: hash }, { onConflict: "provider_key,external_device_id" });
    if (dErr) throw dErr;
    out.push({ token, role: s.role });
    console.log(`seeded ${s.role.padEnd(7)} ${s.name} (asset ${assetId})`);
  }
  // A "Home" geofence (120 m circle) around the pet's house if none exists, assigned to Milo.
  const { data: fences } = await admin.from("geofences").select("id").eq("owner_id", user.id).ilike("name", "home");
  if (!fences || fences.length === 0) {
    const radius = 120;
    const ring: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const b = (2 * Math.PI * i) / 32;
      const dLat = (radius * Math.cos(b)) / 110574;
      const dLng = (radius * Math.sin(b)) / (111320 * Math.cos(rad(PET_HOME[1])));
      ring.push(`${(PET_HOME[0] + dLng).toFixed(7)} ${(PET_HOME[1] + dLat).toFixed(7)}`);
    }
    const { data: g, error: gErr } = await admin
      .from("geofences")
      .insert({
        owner_id: user.id,
        name: "Home",
        kind: "circle",
        radius_m: radius,
        color: "#16a34a",
        center: `SRID=4326;POINT(${PET_HOME[0]} ${PET_HOME[1]})`,
        geom: `SRID=4326;POLYGON((${ring.join(",")}))`,
      })
      .select("id")
      .single();
    if (gErr) console.warn("could not seed Home geofence:", gErr.message);
    if (g) {
      const { data: pet } = await admin.from("assets").select("id").eq("owner_id", user.id).eq("name", "Milo").is("deleted_at", null).maybeSingle();
      if (pet) await admin.from("geofence_assets").upsert({ geofence_id: g.id, asset_id: pet.id, owner_id: user.id });
      console.log("seeded geofence Home (assigned to Milo)");
    }
  }
  return out;
}

// ------------------------------------------------------------------ main
async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  let tokens = args.tokens;
  if (args.seed) tokens = [...tokens, ...(await seed(args.seed))];
  if (tokens.length === 0) {
    console.error("Provide --token awd_...[:role] (repeatable) or --seed <email>. See header comment.");
    process.exit(1);
  }
  const sims = tokens.map((t) => ({ ...t, sim: t.role === "vehicle" ? new VehicleSim() : t.role === "pet" ? new PetSim() : new PhoneSim() }));
  const endpoint = `${args.url.replace(/\/$/, "")}/api/ingest/simulated`;
  const started = Date.now();
  let tick = 0;
  const lastFix = new Map<string, Fix>();
  console.log(`streaming ${sims.length} asset(s) to ${endpoint} every ${args.interval}s${args.chaos ? " with chaos" : ""}`);

  const post = async (token: string, body: unknown) => {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { results?: { status: string; reason?: string }[]; error?: string };
    return { status: res.status, json };
  };

  for (;;) {
    const now = new Date();
    tick++;
    for (const s of sims) {
      const fix = s.sim.next(now, args.interval);
      let body: unknown = fix;
      let label = "fix";
      if (args.chaos) {
        const r = Math.random();
        const prev = lastFix.get(s.token);
        if (r < 0.06 && prev) {
          body = prev;
          label = "DUPLICATE";
        } else if (r < 0.12 && prev) {
          body = { ...fix, recordedAt: new Date(Date.parse(prev.recordedAt) - 30_000).toISOString(), providerEventId: `late-${tick}` };
          label = "OUT-OF-ORDER";
        } else if (r < 0.15) {
          body = { ...fix, latitude: 0, longitude: 0 };
          label = "NULL-ISLAND";
        } else if (r < 0.18) {
          body = { ...fix, recordedAt: new Date(now.getTime() + 3_600_000).toISOString() };
          label = "FUTURE";
        } else if (r < 0.2) {
          body = { locations: [fix, { ...fix, recordedAt: new Date(now.getTime() - 2000).toISOString(), providerEventId: `batch-${tick}` }], statuses: [] };
          label = "BATCH";
        } else if (r < 0.215) {
          body = { locations: [], statuses: [{ at: now.toISOString(), connectionStatus: "offline", reason: "simulated power cut" }] };
          label = "OFFLINE-EVENT";
        }
      }
      lastFix.set(s.token, fix);
      try {
        const { status, json } = await post(s.token, body);
        if (!args.quiet) {
          const outcome = json.results?.map((x) => x.status + (x.reason ? `(${x.reason})` : "")).join(",") ?? json.error ?? "";
          console.log(`${now.toISOString().slice(11, 19)} ${s.role.padEnd(7)} ${label.padEnd(13)} ${fix.latitude.toFixed(5)},${fix.longitude.toFixed(5)} ${fix.speedMps != null ? Math.round(fix.speedMps * 3.6) + "km/h" : ""} → ${status} ${outcome}`);
        }
      } catch (e) {
        console.error(`${s.role}: request failed:`, e instanceof Error ? e.message : e);
      }
    }
    if (args.duration > 0 && Date.now() - started > args.duration * 1000) break;
    await new Promise((r) => setTimeout(r, args.interval * 1000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
