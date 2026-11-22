# Working on Peloton HUD

Read [README.md](README.md) for the layout, [docs/PLAN.md](docs/PLAN.md) for why it is built this way, and
[docs/SOFTWARE-PLAN.md](docs/SOFTWARE-PLAN.md) for what comes next. This file is the rules and gotchas.

## Rules

- **Two halves, one contract.** The Android shell (`android/`) only does what web code cannot: bind the sensor service, record rides in
  a foreground service, draw over Netflix. Everything you see, and all effort math, is the web app. Messages between them are defined in
  [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md), `src/bridge/types.ts` and `android/.../Messages.kt`: change all three together.
- **`src/domain/` is pure**: no React, no storage, no bridge. Effort math goes there with tests beside it.
- **No cloud, no keys.** Rides and settings live in `localStorage` on the device (keys listed in the data contract). Never add a backend,
  account or committed key; personal data (your subscriptions, etc.) goes in gitignored `*.local.ts` files, and personal strings in
  `.private-patterns` so the pre-push hook blocks them.
- **Read-only on the bike's services.** Only call sensor-service methods whose purpose is known; affernet can also send commands to the
  bike's hardware.
- US spelling in everything the user reads.

## Branches

Commits go straight to `main` (personal project). The pre-push hook (`.githooks/pre-push`, switched on by `npm install`) blocks
credentials, signing keys and built APKs. Run `npm run verify` before pushing, and `npm run android:test` when Kotlin changed.

## Gotchas

- The bike is Android 11 (API 30): `minSdk` and `targetSdk` stay 30. Release lint's `ExpiredTargetSdkVersion` is disabled on purpose
  (we sideload, never publish to Play).
- **Never enable freeform windowing** (`settings put global enable_freeform_support 1`). With it on, our fullscreen WebView activity
  renders into a 0-size window and the whole screen goes black; it takes a reboot to recover. `npm run bike -- setup` forces it off.
- The debug build loads the laptop dev server, but **Vite's dev ESM can be flaky in the bike WebView**; for a real on-bike check run
  `npm run build`, then `node scripts/android.mjs assembleRelease`, then `adb install -r` the release APK, which serves the web app
  bundled into it (rebuild the web first, or the APK bundles a stale one). `MainActivity` pipes the
  page console to logcat (`PelotonHudWeb` tag) and enables WebView remote debugging — use `npm run bike -- logs`.
- This Peloton build drops logs below warning (`log.tag=W`). `npm run bike -- setup` turns our tags up; until then use `Log.w`.
- `adb logcat -c` fails on this build; filter by time or pid instead.
- XML comments cannot contain `--` (so no `npm run bike -- x` inside `AndroidManifest.xml` comments).
- Debug builds load `http://localhost:5180`, which reaches the laptop only after `npm run bike -- reverse`. Release builds serve
  `https://appassets.androidplatform.net/index.html` from the APK, with no internet needed.
- Web UI can be checked without the bike: `npm run dev`, then `http://127.0.0.1:5180/?sim` (a simulated pedaling bike). The bike's
  screencap captures black (WebView surface), and the native overlay can only be checked by eye on the bike.
