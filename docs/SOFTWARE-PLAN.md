# Software plan: phase 1 (subscription-free riding: stats, Netflix, YouTube, and the HUD as the launcher)

> **2026-11 update:** the cloud backend (hosting, anonymous auth, ride sync) mentioned in the history below has been removed. The release
> APK now serves the web app it bundles, rides live only on the bike, and there is no deploy step: updating the app means installing a new
> APK. The forward plan is [PORTABILITY-PLAN.md](PORTABILITY-PLAN.md).

Phase 0 is done: repo, web app, a cloud backend (since removed), Android shell building from the command line, adb tooling, and spike S1
answered (see below). This is the order for phase 1. Each step ends with `npm run verify` (and
`npm run android:test` when Kotlin changed) passing, and a check on the bike itself.

**The goal is to use the bike with no Peloton membership, ever** (see docs/PLAN.md). Two things make that real and are part of phase 1, not
later: the sensor data must flow with the Peloton app signed out (step 1), and our HUD must be the thing the bike boots into (step 9). Root
is not available and not needed.

## Where we start

- **S1 passed (2026-11-02).** A normal sideloaded app can bind to `affernetservice` with `IV1Interface` (the Bike is "V1"; asking for
  `IBikeInterface`, the Bike+ "TITAN" interface, is refused) and to `SensorData`'s `SensorService`, which hands back an `IMessenger`.
- We do **not** yet know the method numbers or message codes of either interface: that is step 1.
- **Device facts (from the device-triage session, 2026-11-02):** no Google Play Services or Play Store; Netflix ships disabled (`pm enable`
  then launch `com.netflix.mediaclient/.ui.launch.NetflixComLaunchActivity`); Peloton's OTA packages were **running** and triage disabled
  them (`pm disable-user`, so they now read `enabled=3` — watch out: `enabled=0` is default-state, not off); NewPipe (`org.schabi.newpipe`
  v0.29.1) is installed and plays video, our native YouTube fallback; an **ANT+ stack** (`com.dsi.ant.*`) is installed and `SensorData` holds
  a SERIAL_PORT permission; no browser, no Kindle; root is not possible (locked bootloader, Preloader rejects mtkclient). Wi-Fi is on. Do not
  sign the bike into a Peloton account.
- The bike shows Peloton's own navigation bar (72 px at the bottom). The HUD hides it with immersive mode or plans around it.
- This Peloton build only logs warnings and worse; `npm run bike -- setup` turns our own tags up to verbose.
- **One bike, possibly two sessions.** Device triage (enabling apps, sideloading NewPipe, logcat spelunking) may run in a separate session.
  Coordinate: this repo owns the software we build and folds confirmed device facts into `scripts/bike.mjs` and these docs; avoid both
  sessions issuing conflicting `pm enable/disable` or `set-home-activity` at once.

## Steps

### 1. Read live data (spike S2, native)
Find how to get power, cadence and resistance, in this order of preference:
- **SensorData (Messenger)**: the simpler path. Send a register message with our own `replyTo` Messenger and log every `Message` that
  comes back (`what`, `arg1`, `arg2`, the keys of the `Bundle`). Pedal and change resistance while watching the log.
- **affernet IV1Interface**: AIDL. Recover the method order from the Peloton app's or affernet's compiled stubs
  (`IV1Interface$Stub`, `IV1Callback`), write matching `.aidl` files under `android/app/src/main/aidl/`, and register a callback.
- **ANT+** (`com.dsi.ant.*` plugins, the ANT+ Android SDK): if the bike broadcasts over ANT+, this is a clean, documented API and not
  Peloton-specific. Likely gives heart rate for sure, possibly cadence/power. Worth a quick check with an ANT+ scan early, since it would
  sidestep reverse-engineering entirely; keep it as the heart-rate source even if power comes from affernet/SensorData.
- Whichever gives power+cadence+resistance first becomes `SensorSource` (Kotlin interface: `start(onSample)`, `stop()`), the others fall back.
- **This is the subscription test.** Do the whole step with the Peloton membership app **signed out / never launched**. If the data
  streams anyway, riding is subscription-free and the plan holds. If a method returns nothing or is permission-gated until Peloton is in the
  foreground, stop and switch the sensor source to a **Bluetooth power/cadence sensor** (standard BLE Cycling Power / CSC profile, read in
  the shell) — the HUD, recording and math are identical; only `SensorSource` changes.
- **Done when** `npm run bike -- logs` shows changing watts, rpm and resistance while pedaling with no Peloton login, and the status page
  shows them live.
- Do this read-only: never call a method whose purpose is unclear (affernet also writes commands to the bike).

**RESULT (2026-11-02): decoded — see [SENSOR.md](SENSOR.md).** `SensorData`'s Messenger streams cadence (`what=7`), power (`what=8`) and
resistance (`what=9`) at ~10 Hz, **with Peloton signed out** — riding is subscription-free. The bike reports real watts, so the power-curve
work (old step 3 `power.ts`) is dropped. Remaining in this step: turn the sniffer into a `SensorSource` (register 7/8/9, range-validate,
emit a 1 Hz combined `sample` to the bridge) and show it live on the status page. ANT+ not needed for the core metrics (keep for optional
heart rate later).

### 2. Ride recording — DONE 2026-11-02 (web-side for now)
Recording is in the web app (`src/ride/`), not yet a native service: the WebView is always in front today (no Netflix overlay yet), so
web-side recording works and was far quicker to build and test. When the Netflix overlay lands (step 6) this moves into a native foreground
`RideService` so a ride keeps recording behind Netflix — the recorder and metrics are already pure, so only their host changes.
- `recorder.ts` (`RideRecorder`, pure, unit-tested): state machine `idle → active ⇄ paused → done`, ride id `yyyyMMdd-HHmmss-xxxx`, one
  sample per active second, **auto-pause after 12 s at 0 rpm, auto-resume on pedaling**.
- `useRide.ts`: React glue — subscribes to the bridge, ticks the recorder once a second, exposes live metrics and the controls.
- `storage.ts`: finished rides and settings (weight, FTP, units) in `localStorage` (the only store).

### 3. Effort math — DONE 2026-11-02 (`src/domain/metrics.ts`, pure, unit-tested)
One `summarize(samples, {weightKg, ftpWatts})` computes it all: output kJ, calories (kJ ÷ 0.24 ÷ 4.184, the ~24%-efficiency estimate),
distance (speed-from-power via the cycling power equation, ~24 km/h at 100 W), avg/max power, cadence, resistance, moving + elapsed time,
normalized power, avg speed, avg/max HR, and — with an FTP — power zone, time-in-zone, intensity factor and TSS.
- ~~`power.ts`: a resistance × cadence power curve~~ — **not needed**: the bike reports real watts (`what=8`, see SENSOR.md).
- Still open: compare calories/distance against the Peloton app's own numbers over a few rides and tune the constants.
- Tests use recorded sample files (a real ride from step 2, saved as a fixture), so the numbers are checked against reality.

### 4. HUD layout (web) — DONE 2026-11-03 (reworked)
Two screens, not a perimeter frame (the original "stats around all four edges" shrank the video too much). See [STYLE.md](STYLE.md).
- **Home** (`src/ui/HomeView.tsx`): live gauges, **Start ride** / **Just watch**, settings, recent rides, last-ride summary.
- **Ride** (`src/ui/RideView.tsx`): a slim top bar with the essential biking stats (time, power, cadence, resistance, output, calories,
  distance, zone) over a maximized stage. The stage is either the YouTube browser or a video filling the whole area. Controls (pause,
  resume, end/exit, "‹ Videos") live on the bar. Large touch targets for mid-ride.

### 5. YouTube, browsed in-app — DONE 2026-11-03 (reworked)
No more pasting a link every time. You start a ride, open the browser, and pick a video; it plays maximized with the stats bar on top.
See [YOUTUBE.md](YOUTUBE.md).
- **Browse**: search, trending and a subscription feed via public **Piped**/**Invidious** instances (keyless, open-source, no Google
  account, no Play Services). `src/media/youtubeApi.ts` normalizes both APIs and fails over across a list of instances.
- **Subscriptions**: imported once from the viewer's own Takeout `subscriptions.csv` / NewPipe JSON / pasted links
  (`src/media/subscriptions.ts`), kept in localStorage, and `defaultSubscriptions.ts` can bake in the owner's channels so the bike boots
  with a feed. Feed uses Piped's unauthenticated endpoint (still no login).
- **Playback**: the YouTube IFrame embed (`src/media/youtube.ts`), confirmed working in the bike's WebView; the instances supply only
  metadata. A paste-a-link escape hatch remains at the bottom of the browser.
- Optional native fallback (**NewPipe**, installed on the bike) via the overlay path is still available if the IFrame player proves too
  limited for a given video; not needed so far.

### 6. Netflix with the stats frame (native + web) — WORKING 2026-11-03
The overlay is fully wired: `MainActivity` routes the web's `openNetflix`/`closeOverlay` commands, launches the Netflix app, draws
`NetflixOverlay.kt` (a `TYPE_APPLICATION_OVERLAY` stats strip) over it, feeds it from `SensorSource`, and tells the web when it's dismissed
(`overlayClosed`). The home screen has a Netflix button.

**Netflix runs subscription-free on this bike** — no Peloton membership, not signed in. Two things had to be right, both found on device
2026-11-03:
- **Launch the real Netflix, not Peloton's wrapper.** The package's default launcher resolves to `com.netflix.mediaclient/.ui.launch.UIWebViewActivity`,
  Peloton's **entitlement-gated** shell ("active Peloton subscription" prompt). Launching `.ui.launch.NetflixComLaunchActivity` directly skips
  it and lands in the real Netflix home. `MainActivity.openNetflix()` and `npm run bike -- netflix` both use that activity.
- **Disable Peloton's membership gate.** `com.onepeloton.systempluginui` runs an `AuthValidator` that, with no signed-in Peloton user,
  kills Netflix ~0.4 s after it launches (logcat: `AuthValidator: No authenticated user found, sending user to login screen` → the Netflix
  process dies) — that's the "you must be logged in and have an active subscription" error. `pm disable-user com.onepeloton.systempluginui`
  (in `npm run bike -- setup`, reversible with `pm enable`) stops the gate and Netflix launches and stays up with **no recompile**.
  Verified 2026-11-03 that this leaves the sensor service (a separate package, `com.peloton.service.SensorData`) and sleep/wake working.
  The `Anonymous-DexFile ... dex file checksum mismatch` line that earlier looked like the cause is a **harmless ART warning** — Netflix
  survives it; the real killer was always the gate. (The gate also drew the Peloton bottom bar and the lock screen, so those go; the HUD
  provides its own volume/brightness and, with no keyguard, wakes straight to itself.) **Widevine DRM is present** (`libwvdrmengine.so`,
  `drm@1.3-service.widevine` running), so playback works despite there being no Google Play Services.

Design (now the shipped design):
- Netflix ships **disabled**; `npm run bike -- setup` enables it (`pm enable`, adb-only), disables Peloton's membership gate, and launches
  go straight to `NetflixComLaunchActivity` — no Peloton launcher, no login gate.
- Netflix plays **full screen**; we draw a fullscreen `TYPE_APPLICATION_OVERLAY` window on top with the stats on the edges and a
  pass-through center. **Do not use freeform windowing** to shrink Netflix into a box — with `enable_freeform_support=1` our own
  fullscreen WebView renders into a 0-size window and the screen goes black (found 2026-11-02; `npm run bike -- setup` keeps it off).
- The overlay is a second WebView in a `TYPE_APPLICATION_OVERLAY` window showing the HUD in overlay mode. Only its controls take touches;
  the center passes touches through to Netflix.
- A floating "back to HUD" button closes Netflix and the overlay.

### 7. Accounts and saving rides — superseded
Rides are saved on the bike only (no accounts); see N3 below.

### 8. Ride history (web)
- List of rides with totals and the media watched; a ride detail with power/cadence charts; personal bests.

### 9. The HUD is the bike (launcher + release) — DONE 2026-11-03
This is what makes the bike subscription-free day to day: it boots into our HUD, not Peloton's paywall. Because `setup` disables
`com.onepeloton.systempluginui` (step 6), the Peloton bottom bar is gone, so the HUD carries its own volume + brightness controls
(`DeviceControls`, over the `setVolume`/`setBrightness` bridge) and, with no keyguard, the screen wakes straight to the HUD.
- **DONE:** `MainActivity`'s intent filter carries the **`HOME`** and `DEFAULT` categories (alongside `LAUNCHER`), and `npm run bike -- setup`
  now makes our app the preferred home automatically (`cmd package set-home-activity app.pelotonhud/.MainActivity`, unprivileged and
  per-user) — so after setup the bike wakes/returns into the HUD, not Peloton's launcher. `npm run bike -- home` re-applies it on its own;
  `npm run bike -- unhome` restores Peloton's launcher.
- **DONE (2026-11-03):** kiosk hardening. `MainActivity` runs immersive sticky full screen (status + nav bars hidden, `goImmersive()` re-armed
  on focus) and swallows BACK so a stray tap can't drop to Peloton (it closes the Netflix overlay, else steps back through web history, else
  no-ops). `GuardService` is a foreground service that polls `UsageStatsManager` every ~1.5 s and, via the pure `FocusPolicy`, pulls the HUD
  back whenever a Peloton app foregrounds itself — while deliberately leaving Netflix (and our own app) alone. Needs the `PACKAGE_USAGE_STATS`
  op, granted by `npm run bike -- setup`; without it the guard is simply inert. Verified on device: Peloton launcher is bounced in ~2 s,
  Netflix is not.
- **DONE (2026-11-03):** suppress Peloton's "sign in to your account to reactivate" nag. `com.peloton.activity` (Peloton's activation/setup
  app) repeatedly foregrounded `ActivationActivity`/`SetupActivity` over the HUD and over Netflix, held `SYSTEM_ALERT_WINDOW` so it could
  also draw as an overlay, and auto-started on boot. `npm run bike -- setup` now `pm disable-user`s it (reversible, `pm enable
  com.peloton.activity`). It shares no uid with `com.peloton.service.SensorData` and is not the keyboard, so live stats and the keypad are
  unaffected; verified the process stays dead with the HUD foreground and sensors bound.
- **DONE (2026-11-03):** block Peloton updates and remote management. Peloton's device-management/installer agent `com.onepeloton.dm.android`
  wakes on every `CONNECTIVITY_CHANGE`, installs packages (`peloton.INSTALL_PACKAGE` / `application/vnd.android.package-archive`), and had
  re-enabled `com.peloton.activity` after a Wi-Fi reconnect (it is also the likely cause of the saved Wi-Fi being wiped). `setup` now
  `pm disable-user`s it alongside the four updater apps (`OTAService`, `fwupdateservice`, `bgupdater`, `com.peloton.updater`) and sets
  `ota_disable_automatic_update=1`. The firmware/OTA executors (`raccoon` for MCB/stepper firmware, `boomerang`) are left enabled on purpose —
  they only apply what the agent fetches, so cutting the agent starves them, and they sit near the sensor/hardware stack. It is not a
  device-admin/owner and shares no uid with the sensor service; verified sensors and the HUD keep working. `status` shows the lockdown.
  All reversible with `pm enable`.
- The release build serves the web app bundled in the APK (it used to load a hosted copy); a new web build reaches the bike by
  reinstalling the APK.
- `npm run android:install` for the release APK. Never sign the bike into Peloton or take a Peloton OS update (they may close adb, reset our
  tweaks, or re-enable the membership flow); the update lockdown above is what enforces "no OS update" day to day.

## What's next — build order (set 2026-11-03)

Phase 1's daily driver is **working and deployed** (steps 1–6 and 9 done; web fixes for YouTube CSP, kg/lbs, the keypad inset and the
HUD volume/brightness sliders went live and were verified on the bike 2026-11-03). What remains is making a ride you record while
watching Netflix actually survive, saving rides off the bike (the old steps 7–8), and two robustness gaps found while verifying. Build
in this order; each ends with `npm run verify` (and `npm run android:test` when Kotlin changed) and a check on the bike.

### N1. Ride recording that survives behind Netflix — DONE 2026-11-04 (native sample buffering)
Recording is web-side (`src/ride/useRide.ts` ticks the pure `RideRecorder` once a second). When Netflix is in front, the HUD WebView's
activity is stopped and Android freezes the WebView's timers, so the per-second tick stalled for the whole Netflix span — the ride you most
want recorded. (YouTube plays *inside* the WebView, so it never backgrounds; this was always a Netflix-only gap.)

**What shipped:** `MainActivity` now tracks whether a ride is recording (from the web's `startRide`/`endRide` bridge messages) and, while
the Netflix overlay is up and a ride is recording, buffers one sample per second on the main looper (which keeps running — the same reason
the overlay stays live). On return (`exitOverlay`), it posts a `samples` batch and the web replays it into the recorder, one entry per
second, so there is no gap; the recorder applies auto-pause/resume during replay exactly as if the seconds had ticked live. The metric math
stays web-side. New bridge message `samples` added in all three places (`docs/DATA-CONTRACT.md`, `src/bridge/types.ts`, `Messages.kt`).
Kept in `MainActivity` rather than a separate foreground `RideService` because MainActivity demonstrably survives behind Netflix (its
overlay + sensor binding keep it alive); promoting to a dedicated foreground service is optional hardening if Android ever kills it under
memory pressure. **Needs a web deploy + release-APK install to go live; verify with a real ride behind Netflix (no gap in the saved ride).**

**N1 reachability + overlay unification — 2026-11-04.** Verifying N1 surfaced that its native buffer could never trigger: `openNetflix`/
`openKindle` only fired from the home screen (ride idle), and the ride screen had no entertainment launcher, so you could never be *recording*
and behind an app at once. Fixed: the ride screen (`RideView`) now has "switch to Netflix / Kindle" controls, so you launch them mid-ride and
recording keeps running. At the same time the native overlay (`NetflixOverlay.kt`) was rewritten to be a faithful copy of the web YouTube
overlay (`.obar`) so the top UI is identical no matter what you launch: left-grouped stats, muted small units, red power, the same ghost
controls (‹ HUD / Pause|Resume / End). TIME and OUTPUT are seeded from the ride at launch (new optional `elapsedSec`/`outputKj` on
`openNetflix`/`openKindle`) and advanced in lockstep with the sample buffer, so they continue the ride instead of resetting; Pause gates the
buffer; End flushes and ends the ride via a new `rideEnded` shell→web message. Contract updated in all three places.

Original design notes (kept for the foreground-service hardening option):
The native side already receives every sample at ~10 Hz (`SensorSource`), so the fix keeps the math in the web and only moves *sample
delivery* somewhere that doesn't freeze.
- **First, confirm the gap empirically:** start a ride, open Netflix, pedal 3+ min, return, and inspect the recorded sample timeline for a
  hole. Don't build on the assumption — measure it.
- **Preferred fix (keeps `recorder.ts`/`metrics.ts` pure and web-side):** a foreground `RideService` (Kotlin; `FOREGROUND_SERVICE` is
  already in the manifest) started on the `startRide` bridge command and stopped on `endRide`. While the WebView is backgrounded it
  buffers timestamped samples in a ring buffer; on return it replays the buffer to the web recorder, which already keys samples by second
  so it reconstructs a continuous timeline. If measurement shows the WebView process itself is killed (not just throttled), fall back to a
  Kotlin recorder and hand the web a finished ride.
- **Contract:** add native handling for `startRide`/`pauseRide`/`resumeRide`/`endRide` and a batched `samples` message. Change the three
  halves together: `docs/DATA-CONTRACT.md`, `src/bridge/types.ts`, `android/.../Messages.kt`.
- Files: `android/.../RideService.kt` (new), `MainActivity.kt`, `Messages.kt`, `src/bridge/types.ts`, `src/ride/useRide.ts`, `docs/DATA-CONTRACT.md`.
- **Done when** a ride recorded across a 3+ min Netflix session shows no gap in its samples, on the bike.

### N2. YouTube instance resilience — small, prevents a known regression
Live probe 2026-11-03: only 1 of the 10 `PROVIDERS` responds (`pipedapi.ducks.party`); the rest return non-JSON or time out. YouTube works
only because that one is up — when it rots, the "no open-source YouTube instance is reachable" error the user just hit comes straight back.
- Re-curate `PROVIDERS` to instances that are actually live (re-probe before shipping), and update `docs/YOUTUBE.md`.
- Persist the last-good instance to `localStorage` so a HUD restart starts from a known-good host, not the top of the list (today `preferred`
  only lives in memory).
- Consider pulling the instance list at runtime from the public Piped/Invidious instance-list APIs so it self-heals.
- Make the all-failed error name what was tried. NewPipe (installed on the bike) remains the native fallback.
- Files: `src/media/youtubeApi.ts`, `docs/YOUTUBE.md`, `src/media/youtubeApi.test.ts`.
- **Done when** YouTube search still returns results on the bike with the current top instance blocked, and the last-good host survives a restart.

### N3. Saving rides off the bike — shipped 2026-11-04, then REMOVED 2026-11
A cloud ride sync (anonymous auth) shipped briefly and was removed with the rest of the cloud backend: the owner only rides one bike, and a
public install must need no account or keys. Rides live in `localStorage` on the bike (see DATA-CONTRACT). An optional export/import of a
rides file is the planned answer to "survives an app-data clear".

### N4. Ride history and detail (was step 8)
- A list of rides with totals and the media watched; a detail view with power/cadence charts; personal bests.
- **Done when** the history screen lists saved rides and a detail view charts one ride's power and cadence.

### N5. Calibration and overlay polish — low, do alongside
- Compare calories and distance against the Peloton app's own numbers over a few rides and tune the constants in `src/domain/metrics.ts`
  (the open item from step 3). Needs a few real rides' data first.
- Optional: put the volume/brightness controls inside the Netflix overlay (`NetflixOverlay.kt`) so they can be adjusted without leaving
  Netflix — the `setVolume`/`setBrightness` bridge is already there.
- Eyeball the new HUD volume/brightness sliders and the Netflix stats overlay on the bike (can't be screenshotted — the secure-video lock
  blanks captures).

## Phase 2 (after phase 1)
- **YouTube TV**: the web player needs Widevine in the WebView; check `MediaDrm` security level on the bike first. If it is not enough,
  use the overlay path with the Android TV app if it installs.
- **Kindle**: overlay path (same as Netflix), now scaffolded and wired to the home screen — see [KINDLE.md](KINDLE.md). Pending: sideload the
  Kindle APK and sign into Amazon on the bike (Whispersync handles cross-device progress), then verify on the bike.
- **Embedded rides** (scenic + instructional): a rides mode inside the HUD — scenic routes reuse the YouTube player, workouts run a
  `.zwo`-driven target player. Plan and scaffolding in [RIDES.md](RIDES.md) (`src/rides/`, `src/ui/RidesView.tsx`); player UI and home wiring
  are the next build step.
- **Open-source cycling app**: qdomyos-zwift reads Peloton bikes and broadcasts them as a Bluetooth trainer — a separate app, kept as a
  future option (see RIDES.md "Alternatives considered").

## Verification on the bike
`npm run bike -- reverse` + `npm run dev` + `npm run bike -- launch` to see changes live; `npm run bike -- logs` for the native side;
`adb exec-out screencap -p > shot.png` for screenshots.
