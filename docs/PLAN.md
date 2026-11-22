# Peloton HUD: plan

Ride the Peloton Bike with your own effort tracking, while Netflix or YouTube plays in the middle of the screen and your stats run around
the edges.

**Goal: never pay for a Peloton membership again.** The bike's hardware (flywheel, resistance, screen) is used entirely through our own
software; Peloton's paywalled app is bypassed, not signed into. The end state is that the bike **boots into our HUD** and the Peloton
launcher is never seen (see "Replacing the launcher" below). This is done **without rooting** — the bootloader is locked and its Preloader
rejects the MediaTek (mtkclient) exploit on this chip, confirmed 2026-11-02, so root is permanently off the table.

## What we found on the bike (2026-11-02)

| | |
|---|---|
| Model | Peloton Bike, `PLTN-RB1VQ`, board `qbert`, serial `QAPLBS2112041132` |
| OS | Android 11 (API 30), Peloton OS 11.35.2401, `user` build, release keys (not rooted) |
| Screen | 1920x1080 landscape, 240 dpi (a 1280x720 dp canvas) |
| Sensor wiring | The flywheel sensor board talks to `com.onepeloton.affernetservice` (system uid) over USB serial. The serial ports (`/dev/ttyS*`) are root-only, so no app (and not adb) can open them directly. |
| Sensor services | `com.onepeloton.affernetservice/.AffernetService`, exported, actions `IBikeInterface`, `IV1Interface`, `IAuroraInterface` and more, with an `IBikeCallback` AIDL. `com.peloton.service.SensorData/com.peloton.sensor.SensorService`, exported, action `android.intent.action.peloton.SensorData`, category `BIKE`. Neither declares a manifest permission; affernet calls `checkCallingPermission` at runtime on some methods. |
| Installed | Netflix (`com.netflix.mediaclient`, **ships disabled** — `pm enable` it, then launch `com.netflix.mediaclient/.ui.launch.NetflixComLaunchActivity` directly), Android System WebView. No YouTube app, no Chrome. |
| No Google | No Google Play Services and no Play Store. So the official YouTube app is not viable; YouTube is the WebView IFrame player (needs neither), with NewPipe as an optional native fallback. |
| Updates | Peloton's OTA packages (`OTAService`, `bgupdater`, `fwupdateservice`, `updater`) were **running** on this bike (`enabled=0` is default-state, *not* off); triage disabled them with `pm disable-user` (`enabled=3`) on 2026-11-02, and `npm run bike -- setup` keeps them that way. Still: do not sign the bike into a Peloton account (its account flow is what drives updates). |
| Sensors, other paths | An ANT+ stack is installed (`com.dsi.ant.*`: service, USB service, plugins), and `com.peloton.service.SensorData` holds a SERIAL_PORT permission. So besides binding affernet/SensorData, a possible path is reading ANT+ (at least heart rate; maybe cadence/power) through the ANT+ Android plugins. Evaluated in phase 1 step 1. |
| Root | Bootloader locked; the tablet exposes only Preloader mode and its SLA/DAA auth rejects mtkclient. Not rootable with any known method. Everything here is unprivileged (adb shell uid 2000, our app a normal uid). |

So "reading the serial data" means binding to Peloton's own sensor service, which has already decoded the serial packets into power, cadence
and resistance. This is what open-source overlays such as Grupetto do. Whether this firmware still lets a third-party app bind was the
first thing to prove, and **it does** (spike S1, 2026-11-02): our sideloaded app binds `IV1Interface` (the Bike is "V1"; the Bike+
`IBikeInterface` is refused with "requested binder for TITAN while attached to V1") and `SensorData`, which answers with an `IMessenger`.
What the interfaces' methods and messages are is the first step of phase 1.

## Architecture

```
┌──────────────────────────── Peloton (Android 11) ────────────────────────────┐
│  affernetservice / SensorService  ──AIDL──▶  Android shell app (Kotlin)      │
│                                               • RideService (foreground):    │
│                                                 binds the sensor, 1 Hz       │
│                                                 samples, crash-safe log      │
│                                               • MainActivity: full-screen    │
│                                                 WebView (HUD + YouTube)      │
│                                               • Overlay: perimeter WebView   │
│                                                 over the Netflix app         │
│                       samples (WebMessagePort, JSON) ▼                       │
│                   Web app (React + TS, bundled in and served by the APK)     │
│                        • src/domain: pure metric math (output, calories…)   │
│                        • HUD layout around a center media frame              │
│                        • ride history in localStorage, on the bike only      │
└──────────────────────────────────────────────────────────────────────────────┘
```

(Phases 0–1 used a cloud backend for hosting and ride sync; it was removed in 2026-11 so the app needs no account, no internet to run,
and no keys. The phase notes below are kept as history.)

Why not a web page alone: a browser cannot reach the sensor service, and Netflix will not play inside a web page on this device (Netflix
blocks embedding, and its web player is not supported in Android WebView). So a thin native shell does the two things only native code can
do (read the sensor, draw over the Netflix app), and everything you see is the web app, which is linted and unit tested, then bundled into
the APK.

- **YouTube**: inside our own page, via the YouTube IFrame player in the center frame. True perimeter layout, no overlay tricks.
- **Netflix**: we launch the real Netflix app and draw a transparent stats frame over it (`SYSTEM_ALERT_WINDOW`, granted once over adb).
  The frame is a fullscreen `TYPE_APPLICATION_OVERLAY` window with stats on the edges and a pass-through center. **Freeform windowing is
  not an option**: with `enable_freeform_support=1` our fullscreen WebView renders into a 0-size window and the screen goes black
  (found 2026-11-02). So Netflix plays full screen behind the overlay, not shrunk into a box.
- **Effort math lives in TypeScript** (`src/domain/`), computed from the raw sample stream, so the bike, a laptop replaying a ride, and the
  tests all get the same numbers. The native side records raw samples and never does the math.
- **Recording lives natively** (a foreground service), so a ride keeps recording while Netflix is in front and our WebView is paused.

## Replacing the launcher (the "no subscription" core)

Peloton's launcher (`com.peloton.launcher`) is a system app we cannot remove unrooted, but we do not need to. Our `MainActivity` already
declares the `LAUNCHER` category; we add the **`HOME`** category and `DEFAULT` so Android offers it as a home app, then make it the default
with `cmd package set-home-activity app.pelotonhud/.MainActivity` over adb (no root; this is a normal per-user default). The bike then boots
straight into our HUD. Peloton's launcher still exists but is never shown, and nothing we do needs a Peloton login, so the membership is
irrelevant. If a future state is "Peloton app foregrounds itself", we also set our app via `cmd package set-home-activity` and, as a backstop,
a watchdog in the foreground service that brings the HUD back.

Does riding itself need the subscription? The **sensor services bind with no login** (phase 0). Phase 1 step 1 must confirm the data actually
streams while the Peloton membership app is never signed in — if it does, riding + stats are fully subscription-free; if a method is gated,
the fallback is a cheap Bluetooth power/cadence sensor clipped to the bike (still our HUD, still no Peloton).

## Phases

**Phase 0: infrastructure and backend (done 2026-11-02)**
1. Repo `peloton-hud`, private GitHub, direct commits to `main`, pre-push secret check.
2. Web app skeleton: Vite, React, TypeScript, oxlint, vitest, `npm run verify`.
3. A cloud backend for hosting and ride sync (since removed; see above).
4. Bridge contract between the shell and the web app (`src/bridge/`), with a simulated bike so the web app runs on a laptop.
5. Android toolchain (SDK command line tools, Gradle wrapper) and the shell project in `android/`, building from the command line.
6. `scripts/bike.mjs`: adb helpers (status, install, grant overlay, port forward to the dev server, logs).

**Phase 1: rides, stats, Netflix and YouTube, and the HUD as the launcher**: see [SOFTWARE-PLAN.md](SOFTWARE-PLAN.md). The subscription-free
end state (HOME launcher + confirmed login-free sensor data) is part of phase 1, not deferred, because it is the actual goal.

**Phase 2 (later)**: YouTube TV (web player in WebView needs Widevine; check `MediaDrm` level first), Kindle (Android app, same overlay
path as Netflix), an open-source cycling app (for example qdomyos-zwift, which can also broadcast the bike as a Bluetooth FTMS trainer to
Zwift-style apps). These reuse the overlay; nothing in phase 0 or 1 should assume Netflix is the only app behind the frame.

## Risks

| Risk | Plan |
|---|---|
| The sensor service refuses third-party binds | Cleared by S1: both services bind. Remaining risk is a method that checks the caller's permission; then use the other service, and as a last resort a Bluetooth cadence/power sensor. |
| Sensor data only flows with a Peloton login | Confirm in phase 1 step 1 with the Peloton app signed out. If gated, add a Bluetooth power/cadence sensor; the HUD and everything else stay the same. |
| Root was the plan | It is not possible on this chip (Preloader auth rejects mtkclient). Unnecessary anyway: binding the sensor, the launcher swap and the overlays are all unprivileged. |
| A Peloton OS update removes adb or sideloading | OTA packages already ship disabled; keep the APK and `scripts/bike.mjs` so re-setup is one command; never sign the bike into Peloton (its account flow is what would drive an update). |
| Netflix blocks overlays or screenshots | Overlays are allowed for non-secure surfaces; Netflix's video surface is secure but our window is ours. If not, fall back to PiP. |
| Peloton's "output" formula is not public | Use the bike's reported watts when present; otherwise a resistance/cadence power curve calibrated against a few Peloton rides. |
