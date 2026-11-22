# Data contract

The source of truth for what the Android shell and the web app send each other, and what the web app stores on the device. Types live in
[`src/bridge/types.ts`](../src/bridge/types.ts) and `android/.../Messages.kt`; change this file and both of those together, additively.

## Stored on the device

There is no account and no cloud: everything lives in the WebView's `localStorage` on the bike (origin
`https://appassets.androidplatform.net`, the web app bundled in the APK). Uninstalling the app or clearing its data erases it. Every
read and write is guarded, so a locked-down WebView never crashes the HUD.

| Key | Shape | Written by |
|---|---|---|
| `peloton-hud:settings` | `{ weightKg, ftpWatts?, units?: "imperial" \| "metric", weightUnit?: "lb" \| "kg" }` | `src/ride/storage.ts` |
| `peloton-hud:rides` | `StoredRide[]`, newest first, at most 50 | `src/ride/storage.ts` |
| `peloton-hud:subscriptions` | YouTube channels `{ id, name }[]` | `src/media/subscriptions.ts` |
| `peloton-hud:youtube-recents` | recently watched videos | `src/media/useMedia.ts` |
| `peloton-hud:yt-instance`, `peloton-hud:feed-cache` | last working YouTube instance, cached feeds | `src/media/youtubeApi.ts` |

A `StoredRide` is a `RideSummary` (`src/ride/recorder.ts`) plus a small downsampled `series` for the detail chart (`src/ride/series.ts`):

| Field | Type | Notes |
|---|---|---|
| `rideId` | string | made on the bike at start (`yyyyMMdd-HHmmss-xxxx`) |
| `state` | `"done"` | |
| `startedAt`, `endedAt` | epoch ms | |
| `media` | `{ kind: "netflix" \| "youtube" \| "kindle" \| "none", title?: string }` | what was on |
| `metrics` | `RideMetrics` (`src/domain/metrics.ts`) | elapsed seconds, output, calories, distance, averages, maxima |
| `series` | `{ power: number[], cadence: number[] }`, optional | at most 180 evenly spaced averages, oldest first |

## Shell → web bridge

The Android shell posts JSON messages to the page over a `WebMessagePort`. In a normal browser, `src/bridge/simulated.ts` produces the same
messages so the web app can be built and tested on a laptop.

| `type` | Fields | When |
|---|---|---|
| `hello` | `shellVersion`, `device` (tablet model), `sensor: "affernet" \| "sensordata" \| "ble" \| "simulated" \| "none"`, `android?` (release, e.g. "11"), `abi?` (e.g. "arm64-v8a") | once, on connect (and again after the source changes) |
| `sensors` | `current` (`"internal"` or a Bluetooth address), `currentName`, `scanning`, `devices: { id, name, kind: "power" \| "cadence" }[]`, `error?` | on connect, during a Bluetooth scan as devices appear, and after the source changes |
| `apps` | `installed: string[]` — which of the queried media-app packages are installed and launchable here | in reply to `queryApps` |
| `sample` | `t` (ms since epoch), `power`, `cadence`, `resistance`, `hr?` | about once a second while the bike reports |
| `ride` | `rideId`, `state: "idle" \| "active" \| "paused" \| "done"`, `startedAt?` | when the ride state changes |
| `error` | `code`, `message` | sensor lost, permission refused |
| `levels` | `volume` (0–1), `brightness` (0–1) | on connect, and when the shell changes either (e.g. the Netflix overlay's buttons) |
| `samples` | `samples: { power, cadence, resistance, hr? }[]` (one entry per second) | on returning from an entertainment overlay (Netflix/Kindle) — the seconds the shell buffered while the WebView's recorder was frozen, replayed into the recorder so the ride has no gap |
| `overlayClosed` | `nav?: "home" \| "select"` | the overlay was dismissed; the web resets media to none and goes to the HUD (`"home"`, the default and what the HUD coming back to front any other way sends) or the media picker (`"select"`, the overlay's Back button) |
| `rideStarted` | — | the overlay's Start button began a ride behind an entertainment app; the web starts the recorder (a `samples` flush follows on return so the ride has no gap) |
| `rideEnded` | — | the overlay's Stop button ended the ride; the web ends the recorder and saves (a `samples` flush precedes it) |

Web → shell: `startRide`, `pauseRide`, `resumeRide`, `endRide`, `openApp` (`{ pkg }` plus optionally `{ elapsedSec, outputKj, weightKg,
plan }` to seed the overlay — TIME/OUTPUT from an in-progress ride, the rider weight the overlay needs for CALORIES, and `plan`, a power plan
flattened to `{ durationSec, targetW }[]` (src/rides/rides.ts `resolvePlan`) so the overlay draws the guide gauge and advances its target off
elapsedSec while the WebView is frozen; omitted → no gauge — the shell launches the package full screen with the native overlay over it, and
knows each package's launch quirks e.g. Netflix's membership-gated wrapper), `queryApps` (`{ pkgs: string[] }` — which media apps are installed;
answered with an `apps` message; the catalog is src/media/apps.ts), `closeOverlay`,
`setVolume` (`{ level: 0–1 }`), `setBrightness` (`{ level: 0–1 }`) — the shell clamps, applies, then echoes a `levels` message (`{ type, ...args }`),
and the way out from Settings: `openPeloton` (Peloton's own home screen; the kiosk guard stands down until the HUD is back in front),
`openAndroidSettings`, `chooseHomeApp` (Android's default-home picker). The shell offers the same three on its native recovery screen, which
needs no web app: it appears when the HUD fails to load or crashes, or when you hold the top-left corner of the screen for 3 seconds.
Sensor choice: `scanSensors` (look for Bluetooth LE power meters / cadence sensors for ~12 s; results stream back as `sensors`) and
`useSensor` (`{ id, name? }`: `"internal"` for the bike's own sensor, or a found device's `id`; the shell remembers it). A Bluetooth sensor
reports power and/or cadence and resistance 0 (resistance isn't part of the Bluetooth standards).

A ride is **independent of what is on screen**: switching media, or returning to the HUD (Back/Home), never ends it; only an explicit
Stop/End does. So Start/Stop lives wherever the rider is — the HUD, the YouTube bar, or the native entertainment overlay — and the overlay's
Back/Home just move between screens with the ride still recording underneath.
