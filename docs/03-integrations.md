# AssetWatch — Integration feasibility (verified September 2026)

Every claim below was checked against a primary source during Phase 1. Where the only option is
unofficial or reverse-engineered, it is listed and **excluded**.

## A. Apple devices and AirTags

### A.1 Verdict table

| Mechanism | Usable by a third-party web app / server? | Conditions | Source |
|---|---|---|---|
| Public API for AirTag location (REST/web/framework) | **No** | None exists. Apple's only developer entry point to the Find My network is the MFi hardware program. | https://developer.apple.com/find-my/ · https://developer.apple.com/forums/thread/751830 |
| Find My app / icloud.com/find as an API | **No** | It is a user UI for iPhone/iPad/Mac/Watch/AirPods; items (AirTags) are not even listed there. Unofficial wrappers (pyicloud, FindMy.py, findmy-rest) reverse-engineer private endpoints; iCloud terms forbid automated access and the Developer Program License Agreement forbids reverse engineering and non-documented APIs. | https://support.apple.com/guide/icloud/locate-a-device-mmfc0f2442/icloud · https://www.apple.com/legal/internet-services/icloud/en/terms.html · https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ |
| Find My Network Accessory Program (MFi) | **No, for location data** | Lets a hardware maker build a Find My-compatible tag. Locations surface only in the Find My app's Items tab, end-to-end encrypted; there is no server/API channel to the maker. | https://www.apple.com/newsroom/2021/04/apples-find-my-network-now-offers-new-third-party-finding-experiences/ |
| Share Item Location (iOS 18.2+) | **Manual, human-viewed only** | Owner generates a link in Find My; viewer signs in at find.apple.com with an Apple Account or is a registered Apple Partner (airlines). Expires after 7 days, on reunion, or when sharing stops. Items only, not devices. No API, no partner onboarding for arbitrary developers. | https://support.apple.com/en-us/121488 · https://www.apple.com/newsroom/2024/11/apples-find-my-enables-sharing-location-of-lost-items-with-third-parties/ |
| Core Location in a companion iOS app on the user's own iPhone | **Yes** | `CLLocationUpdate.liveUpdates` (iOS 17+), `CLBackgroundActivitySession`, `CLMonitor` (≤ 20 conditions), significant-change (~500 m, ≥ 5 min), visits; `location` in `UIBackgroundModes`; purpose strings mandatory; user may grant reduced accuracy; App Review 2.5.4 / 5.1.1 / 5.1.2 / 5.1.5. | https://developer.apple.com/documentation/corelocation/cllocationupdate · https://developer.apple.com/videos/play/wwdc2023/10180/ · https://developer.apple.com/app-store/review/guidelines/ |
| iPhone battery level in a companion app | **Yes, coarse** | `UIDevice.batteryLevel`, rounded to ~5 % on iOS 17+; Apple says this is intended. | https://developer.apple.com/documentation/uikit/uidevice/batterylevel · https://developer.apple.com/forums/thread/732903 |
| Location of the user's other Apple devices or family members' devices | **No** | Visible only in Find My / Messages / icloud.com/find. | https://support.apple.com/en-us/105107 |
| Nearby Interaction (UWB) with AirTag | **No** | NI supports Apple devices and third-party accessories on the NI Accessory Protocol; AirTag is not supported. | https://developer.apple.com/documentation/nearbyinteraction · https://developer.apple.com/forums/thread/678686 |
| DeviceCheck / App Attest | **Not relevant** | Device state bits and app integrity; no location. | https://developer.apple.com/documentation/devicecheck |
| Find My-certified third-party tags (Chipolo Spot, Pebblebee) via vendor API | **No** | In Find My mode the vendor app only does firmware/alerts; location appears only in Find My. | https://chipolo.net/en-us/pages/chipolo-one-spot · https://help.pebblebee.com/en-US/choose-apple-find-my-google-find-hub-pebblebee-2496017 |
| Google Find Hub network | **No** | "Google does not provide a specific SDK or API for this integration." | https://developers.google.com/nearby/fast-pair/landing-page-find-hub |
| Sign in with Apple | **Yes, and effectively required** | Guideline 4.8: offering Google login requires an equivalent privacy-preserving option. Web needs Services ID, Team ID, Key ID, .p8; client-secret JWT must be rotated within 6 months. Supabase Auth supports it. | https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple · https://supabase.com/docs/guides/auth/social-login/auth-apple |

Short quotes on record: an Apple engineer's only answer to "track Find My tags in my app" is
"enroll in the MFi program"; the DPLA states "Your Application may only call and use Documented APIs";
the iCloud terms prohibit "accessing the Service through any automated means".

### A.2 What this means for the product

**Impossible, and excluded by design:** server-side or web-app retrieval of AirTag, Find My-accessory,
Mac/iPad/Watch, or family-member locations. No scraping, no iCloud session replay, no third-party
"AirTag API" vendors (they disclose no Apple authorisation and are relay/reverse-engineering based).

**Supported architecture — two tiers of Apple asset:**

1. **Live tier: iPhone/iPad running the AssetWatch companion app (P3).** Core Location on the user's
   own device, with explicit consent, posts normalised locations to the ingest API using a per-install
   token. Default power profile: significant-change + visits + `CLMonitor` geofences (system relaunches
   the app), with `liveUpdates` only while the app is foregrounded or a `CLBackgroundActivitySession`
   is active. Battery level in 5 % steps. Reduced-accuracy authorisation is honoured and shown as
   "approximate" with a large accuracy circle. The app must function (degraded) if location is denied.
2. **Linked tier: AirTags, Find My tags, Macs, Watches, other devices.** Represented as
   `apple_findmy_reported` assets: inventory metadata (name, serial, attached-to), a user-entered
   "last known location" check-in with its own timestamp (freshness thresholds: live 5 min, recent
   1 h, stale after), a deep link to the Find My app, and, for lost items, storage of a
   *Share Item Location* URL with its 7-day expiry so an authorised human can open it. The dashboard
   never parses that page.

The UI labels linked-tier assets with the source "Find My (manual check-in)" so an old manual entry
is never mistaken for live tracking.

**Anti-stalking:** iOS and Android alert anyone carrying an unknown tracker (Detecting Unwanted
Location Trackers spec, draft-03, June 2026). Product rule: only devices and tags the signed-in owner
registers themselves; companion-app sharing is opt-in per device with an in-app off switch; no family
or third-party locations are ingested.

## B. Vehicle tracking

### B.1 Comparison (Lagos, one personal vehicle)

| Option | API | Webhook / push | Cost | Feasible in Nigeria | Source |
|---|---|---|---|---|---|
| **Traccar, self-hosted** | REST + WebSocket + OpenAPI | Yes: `forward.url` (JSON body, custom header, retries) and `event.forward.url` | Free software; VPS ~$5–20/mo | **Yes** | https://www.traccar.org/forward/ · https://www.traccar.org/api-reference/ |
| Traccar managed | Same API | Forwarding needs server config ⇒ dedicated plan | $5.95/mo shared, $29.95/mo dedicated | Yes | https://www.traccar.org/pricing/ |
| **flespi Free** | REST + MQTT | 2 webhooks | €0; 10 devices, 2 channels; account deleted after 60 days inactivity; "testing & development" | Yes | https://flespi.com/pricing |
| flespi Start | REST + MQTT | Yes | €130/mo | Yes, overkill | same |
| Cartrack Nigeria | Fleet REST API (Basic auth) | Only one non-location webhook event today | ~₦100k yr 1 / ₦35k renewal | Partly; API eligibility for individuals unclear | https://developer.cartrack.com/docs/fleet-api-general/webhook-notification/ |
| Samsara / Motive | REST | Yes | Enterprise, NA/EU | No | https://developers.samsara.com/docs/rest-api-overview |
| Geotab | REST (polling GetFeed) | Rule web-requests | Enterprise via reseller | Reseller exists | https://geotabafrica.com/ |
| Wialon / Navixy / GpsGate | REST | Polling or provider-configured | Via a local partner | Via partner | https://help.wialon.com/en/api/user-guide/api-reference/other-methods/avl_evts |
| Smartcar | Yes | Yes | Per vehicle | **No** (US/CA/EU only) | https://support.smartcar.com/en/articles/4516546-global-coverage-faqs |
| Toyota Connected Services | No public API | — | — | **Not offered in Nigeria** | https://www.toyotabycfao.ng/ |
| Tesla Fleet API | Yes | Telemetry | Pay-per-use | No official presence | https://developer.tesla.com/docs/fleet-api |
| Bouncie / Zubie (OBD dongles) | Yes | Yes | Device + sub | **No** (US/CA/MX) | https://help.bouncie.com/en/articles/1738280-bouncie-faqs |
| Vyncs (OBD) | No public API | No | Device + yearly | Works, but no API | https://vyncs.com/supported-countries.aspx |
| Nigerian vendors (Concept Nova, Trackershop, Car Tracker Nigeria…) | None published | None | ₦100k–150k yr 1 | Service yes, API no | https://www.concept-nova.com/ |

Conclusions: OEM/connected-car APIs and US OBD dongles are not usable in Nigeria. Fleet platforms are B2B and
Cartrack's webhooks do not carry location. The realistic path is an **unlocked GPS tracker + local SIM**
reporting to **Traccar** (or flespi), which forwards normalised JSON to AssetWatch.

### B.2 Hardware that works on Traccar/flespi

| Device | Radio | Traccar protocol / port | Notes |
|---|---|---|---|
| Teltonika FMC920 | 4G Cat 1 + 2G fallback | `teltonika` / 5027 (Codec 8E) | Recommended; ~$65–105 |
| Teltonika FMB920 | 2G | `teltonika` / 5027 | Stocked in Lagos; ~€25–70 |
| Concox GT06N, Jimi JM-VL01/VL02 | 2G / LTE | `gt06` / 5023 | Most-cloned protocol; most no-name units speak it |
| Queclink GV300 | 2G/3G/4G | `gl200` / 5004 | |
| Coban TK103/GPS103 | 2G | `gps103` / 5001 | |

Sources: https://www.traccar.org/devices/ · https://flespi.com/devices/teltonika-fmb920 ·
https://dirigible.com.ng/product/teltonika-fmb920-gps-device-easy-2g-3g-4g-motors-and-bikes/

Nigeria network: no 2G sunset is planned (MTN/Airtel 2100 MHz renewed to ~2037; more than half of subscribers
were still on 2G in 2024), so 2G units keep working, but a 4G-with-2G-fallback unit is the safer buy.
Multi-network IoT SIMs are what local installers use; budget ₦1.5–3k/month of data at a 10–30 s interval.
Sources: https://mobility.com.ng/2g-and-3g-networks-not-going-away-in-nigeria-soon/ ·
https://fenixtelematics.ng/blog/car-tracker-subscription-costs-nigeria/

### B.3 Integration design (P2)

```
Tracker (GT06/Teltonika over TCP, local SIM)
  → Traccar (1–2 GB VPS, Docker; ports 5023/5027 open; 8082 behind HTTPS)
  → forward.type=json, forward.url=https://assetwatch.app/api/ingest/traccar,
    forward.header="Authorization: Bearer <integration token>", forward.retry.enable=true
  → TraccarAdapter.parse(): { position, device } → NormalizedLocation
  → ingest_location() → asset_states → Broadcast → map
Backfill: GET /api/positions?deviceId&from&to with a Traccar bearer token (stored in Vault).
```

Traccar sends no signature, so the per-integration bearer token plus an optional source-IP allowlist is the
authentication. `event.forward.url` is pointed at `/api/ingest/traccar/events` for `deviceOffline`,
`ignitionOn/Off`, `deviceOverspeed`, `alarm` (sos, powerCut, tow, vibration), which map to AssetWatch alerts
and to `connection_status` (the only "offline" we ever display is one a provider reported).

Field mapping (Traccar position → `NormalizedLocation`):

| Generic | Traccar | Transform |
|---|---|---|
| latitude / longitude | `position.latitude` / `.longitude` | as-is; reject if `valid=false` or (0,0) |
| accuracyM | `position.accuracy` | metres; **0 or absent ⇒ null** (binary protocols rarely report it); keep `attributes.hdop` in `extra` |
| altitudeM | `position.altitude` | metres |
| speedMps | `position.speed` | **knots × 0.514444** |
| headingDeg | `position.course` | degrees |
| batteryLevel | `attributes.batteryLevel` | %; if only `attributes.battery` (V) exists ⇒ null, keep volts in `extra` |
| recordedAt | `position.fixTime` ?? `deviceTime` | ISO; `serverTime` ⇒ `receivedAt` |
| providerEventId | `position.id` | Traccar's own id; idempotent on retries |
| ignitionOn | `attributes.ignition` ?? `attributes.motion` | boolean |
| fuelLevelPct | `attributes.fuelLevel` | %; `attributes.fuel` (L) and `adc1` go to `extra` |
| odometerKm | `attributes.odometer` ?? `obdOdometer` ?? `totalDistance` | metres ÷ 1000 |
| source | `traccar` | `extra.protocol = position.protocol`, `extra.uniqueId = device.uniqueId` |

Sources: https://raw.githubusercontent.com/traccar/traccar/master/openapi.yaml ·
https://raw.githubusercontent.com/traccar/traccar/master/src/main/java/org/traccar/model/Position.java ·
https://www.traccar.org/forums/topic/traccar-webhook-json/

flespi is the managed alternative with the same shape (`position.latitude`, `position.speed` in km/h,
`engine.ignition.status`, `battery.level`, `external.powersource.voltage`) delivered by webhook; its free tier
is explicitly for testing and is deleted after 60 days of inactivity, so it is a fallback, not the default.

## C. Pet tracking

### C.1 Comparison

| Product | Official API | Webhook | Works in Nigeria | Radio | Source |
|---|---|---|---|---|---|
| Tractive | **No.** Only the reverse-engineered `aiotractive` (Tractive: HA integration "not officially supported"; 429 throttling seen in 2026). Sanctioned third-party path is only via a Homey hub. | No | Device works on Premium roaming (175+ countries, 2G/LTE-M) but Nigeria is not in the shipping/subscription/support list. | 2G + LTE-M | https://github.com/zhulik/aiotractive · https://help.tractive.com/hc/en-us/articles/205664291-Where-does-Tractive-work |
| Fi | No (unofficial `pytryfi`) | No | **No** (38 countries; trackers don't connect where the app isn't available) | LTE-M | https://support.fitracking.com/hc/en-us/articles/360019764414 |
| Whistle | **Service shut down 31 Aug 2025** after Tractive acquisition | — | — | — | https://www.engadget.com/wearables/whistle-pet-trackers-are-shutting-down-next-month-212828325.html |
| Jiobit (Life360) | No; Life360 has no public API or webhooks | No | **No** (US, limited CA/MX) | LTE-M | https://github.com/api-evangelist/life360 |
| Weenect / Kippy / PitPat | No | No | **No** (Europe/US) | cellular | https://help.weenect.com/hc/en-us/articles/208540195 |
| Invoxia Pet | No (API limited to pro offer) | No | **No** (EU LoRa/Sigfox only) | LoRa/Sigfox | https://support.invoxia.com/hc/en-150/articles/4408426896657 |
| Garmin Alpha/T5 | No; proprietary VHF to handheld, no cloud | No | Radio only | VHF | https://www8.garmin.com/manuals/webhelp/alpha100tt5/ |
| Tile / Chipolo / Pebblebee | No public location API | No | BLE works; crowd density in Lagos unknown | BLE via Find My / Find Hub | https://github.com/bachya/pytile · https://chipolo.net/en-us/pages/integrations |
| Apple AirTag | No; Apple: "designed exclusively for tracking objects, and not people or pets" | No | Where iPhones pass by | BLE/UWB via Find My | https://www.apple.com/newsroom/2026/01/apple-introduces-new-airtag-with-expanded-range-and-improved-findability/ |
| **Generic 2G/4G GPS collar → Traccar/flespi** (TKSTAR TK909 = `h02`/5013; TK911 Pro 4G = `watch`/5093; Jimi LL705 = `gt06`/5023) | **Yes** (Traccar/flespi API) | **Yes** | **Yes** with a local SIM; server set by SMS `adminip123456 <ip> <port>` | H02 / GT06 / watch over TCP | https://www.traccar.org/forums/topic/pet-tracker-tk911-pro-4g-working-solution-with-home-assistant/ · https://www.maliatrack.com/ll705-animal-tracker |
| LoRaWAN / Helium / Sigfox collars | Via TTN/Helium console | Yes | **No**: TTN shows 0 gateways in Nigeria; Sigfox operator exists with no published Lagos coverage | LoRaWAN | https://www.thethingsnetwork.org/country/nigeria/ |

### C.2 Conclusions

- **No consumer pet-tracker brand has an official public API.** Every existing integration is reverse-engineered
  from a private app backend, requires storing the user's account password, and has already shown breakage and
  throttling. All are **excluded**.
- **None of the branded products officially supports Nigeria.** Tractive would function on roaming but must be
  bought and subscribed abroad, and still has no API.
- **AirTag on a collar** is possible for the owner via the Find My app only; AssetWatch represents it as a
  linked-tier `apple_findmy_reported` asset (manual check-in), exactly like any other AirTag (section A.2).
- **The viable path is the same as vehicles:** a GT06/H02-speaking GPS collar with a local SIM, reporting to
  Traccar/flespi, forwarded to the same ingest endpoint. Pets are a first-class asset type in the schema; the
  provider layer is shared with vehicles. Battery on these collars is 24–48 h at 60–90 s uploads, so the
  freshness thresholds for the `traccar` provider apply and `battery_low` alerts matter.
- **Bluetooth "last seen near me"** via a companion app (P3) is a useful supplement for home/away, not a lost-pet
  finder: iOS background BLE scanning is coalesced and service-UUID-filtered; range is 10–30 m.
  Source: https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html

### C.3 Recommended pet strategy

MVP: the simulated provider drives a pet asset ("Milo") wandering around Lekki Phase 1 with a battery-drain
curve and an accuracy that varies 5–150 m, so the UI, geofences ("Milo left Home") and alerts are fully
exercised without hardware.

Production (Lagos): Jimi LL705 (rugged, LTE Cat-1 + 2G, GT06) or TKSTAR TK909 (cheap, 2G, H02) on an MTN/Airtel
SIM, pointed at the same Traccar server as the vehicle. Provisioning by SMS is documented per unit.

## D. Summary of what is impossible or excluded

| Requested capability | Status |
|---|---|
| AirTag live location in a web app | Impossible (no API; end-to-end encryption; ToS). Manual check-in + Find My deep link only. |
| Any Find My / Find Hub tag via vendor API | Impossible. |
| Other Apple devices / family members' devices | Impossible without the companion app running on that device, with that person's consent. |
| Branded pet tracker APIs (Tractive, Fi, Jiobit…) | Unofficial only ⇒ excluded; none support Nigeria. |
| OEM connected-car APIs in Nigeria | Not offered. |
| US OBD dongle APIs in Nigeria | Not supported. |
| Live vehicle/pet tracking | **Possible** with GPS tracker hardware + Traccar/flespi ⇒ AssetWatch ingest. |
| Live iPhone tracking | **Possible** with the companion app (P3), consent-gated. |
