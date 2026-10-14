# GOLT — Taxi Driver Simulator

A workplace simulator for taxi drivers. Real map, real (optional) GPS, **fully fictional** orders, passengers and earnings.
Not connected to Bolt, Uber or any other platform. The app always shows **SIMULATION MODE**.

## Why this stack

| Need | Choice | Reason |
|---|---|---|
| Real GPS + interactive map + mobile UI, testable without a device | **Vite + React + TypeScript PWA** | `navigator.geolocation` works in any phone browser over HTTPS, installs to the home screen, and can be tested in a desktop browser with spoofed coordinates. |
| Native Android APK | **Capacitor** wrapper around the same build | Same code, real APK, native location permission dialog. |
| Map | **Leaflet** + OpenStreetMap tiles (swap via env) | No API key needed to start. |
| Routing | **OSRM** (public demo server, optional) with an offline fallback | Real road geometry and distances; the app keeps working if it is unreachable. |
| Why not Expo/React Native | — | Background GPS in Expo needs a custom dev build and native config; it cannot be verified inside a browser. The simulation core is framework-free (`src/core`), so a React Native UI can reuse it unchanged later. |

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN)
npm test             # 23 tests: state machine, generator, engine lifecycle, scenarios, GPS, i18n keys
npm run build        # production bundle in dist/
```

## Project structure

```
src/
  core/                 # pure TypeScript, no React/DOM — fully unit-tested
    types.ts            # domain types
    machine.ts          # state-machine transition table (the only source of legal moves)
    engine.ts           # simulation engine: clock, offers, legs/routes, stats, persistence hooks
    generator.ts        # fictional order generator (GPS-anchored, seeded, no repeated pickups)
    scenarios.ts        # 6 scenario definitions, demand curve, surge, traffic
    cities.ts           # Vilnius (full) + Kaunas/Klaipėda/Riga/Warsaw (generic areas) — add a city = add an entry
    pricing.ts geo.ts rng.ts
  services/             # browser integrations: gps.ts, routing.ts (OSRM), sound.ts (WebAudio + vibration), storage.ts
  i18n/                 # ru / en / lt dictionaries (a test fails if a used key is missing)
  ui/                   # MapView, Dock (offer / active order / summary), TopBar, Menu, Splash, screens/*
  store.ts              # engine singleton + UI store + hooks
tests/                  # vitest
```

## Phases of an order (state machine)

`offline → idle → offer → toPickup → waiting → inTrip → summary → idle`

Illegal moves are rejected by `machine.ts`: you cannot complete before starting, accept two orders, go offline mid-ride,
or switch scenario during an order. "Arrived" and "Complete" unlock within 150 m of the target; "No-show" unlocks after 90 s of waiting (simulation time).

## Scenarios

1. **Regular shift** — Tuesday 13:00, moderate flow.
2. **Rush hour** — Friday 17:36, many offers, surge, traffic jams (slower driving), longer trips.
3. **Night shift** — Saturday 02:30, few offers, long rides, dry spells.
4. **Airport** — start in the VNO queue; queue position counts down, then an airport pickup; drive back via the "to airport queue" button.
5. **Free simulation** — tap the map to drive there (or use real GPS); tune frequency and difficulty.
6. **Manual** — pick start point on the map, number of orders, average fare, orders/hour; the scenario ends after N orders.

Speed 1×/2×/5×. Same scenario + "reproducible orders" → same order sequence. **Demo mode** (Settings) = an offer every few seconds.

## Testing GPS

* **Real device (recommended):** deploy over HTTPS (e.g. `npm run build && npx vercel`, or any static host) and open on the phone, or use Android Chrome with `chrome://inspect` port forwarding to `localhost:5173` (localhost counts as secure). Tap **Use my location** / **GPS → Enable GPS**, allow the permission. You should see accuracy (±m), last-update age, heading and speed.
* **Desktop browser:** Chrome DevTools → ⋮ → More tools → **Sensors** → Location: pick a preset or enter lat/lng; change it while a ride is active to "drive".
* **No GPS at all:** pick **Demo without GPS**, or set a manual start point (GPS screen → preset / pick on map).
* **Errors handled:** permission denied, position unavailable, timeout, insecure origin (HTTP), unsupported device — each shows a specific message.
* In GPS mode the generated pickup/drop points are virtual, so "Arrived"/"Complete" unlock only when you physically (or via Sensors) get within 150 m. Anywhere on Earth works: outside a configured city, points are generated around you.

## Build the Android APK

Prereqs: JDK 17, Android Studio (SDK + platform tools).

```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
```
Add to `android/app/src/main/AndroidManifest.xml` (inside `<manifest>`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
```
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```
Release APK: `./gradlew assembleRelease` with your own keystore (see Android docs). Replace the launcher icon with `npx @capacitor/assets generate` using `public/icon.svg` as the source.

## Keys, permissions, configuration

* **API keys: none required.** Optional env vars (`.env`, see `.env.example`): `VITE_TILE_URL_DARK`, `VITE_TILE_URL_LIGHT` (keyed tile provider such as MapTiler), `VITE_OSRM_URL` (your own OSRM; empty = offline fallback routes only).
* **Permissions:** location (only after you tap enable; never sent anywhere), vibration (optional), audio (needs a first tap on the page).
* Default OpenStreetMap tiles and the OSRM demo server are for demos only — respect their usage policies and use your own provider for real traffic.

## Limitations & next steps

* No background GPS: the simulation pauses/slows when the browser tab is hidden. A native build with a foreground location service (Capacitor background-geolocation plugin) is the next step.
* Addresses are approximate district anchors + virtual points, labelled as such; no reverse geocoding.
* Kaunas, Klaipėda, Riga and Warsaw use generic compass areas until real district data is added to `cities.ts`.
* Lithuanian translation covers core screens (English fallback elsewhere).
* PWA icon is SVG only (no 192/512 PNG yet), so some browsers won't offer "install".
* Ideas: surge hexagons from a real grid, leaderboards of virtual drivers, shift goals, replay/export of a shift (CSV), tests for UI with Playwright, React Native UI over `src/core`.
