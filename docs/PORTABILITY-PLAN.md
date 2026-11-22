# Plan: turning this into a generic, public, install-it-yourself project

A plan for taking the HUD from "one bike, one laptop, one cloud project" to something anyone can put on their own Peloton + Android
tablet. The target user has **limited coding experience**, should **not need Claude Code, a CLI, or any cloud account**, and ideally just
**plugs a tablet into their laptop, runs one script, and it works** across a range of Peloton builds and tablets.

**Status (2026-11-21):** decision 1 is done (no cloud; the APK serves the web app; rides live on the device). Decision 2 is built: the
double-click installers (adb downloaded from Google, not redistributed), `installer/hud-setup.sh`, CI and the tag-triggered Release
workflow. The Bluetooth LE fallback from decision 3 is built (Settings → Sensor; `BleSource`, `BleCycling`). All of it is unit-tested but
**not yet run on a bike**. Still open: in-app discovery of the bike's own sensor service on other Peloton builds (needs reports from
other models), and the compatibility table.

## What stood in the way

The app itself is already portable — the web app is pure, the effort math has no bike in it, and rides already persist to `localStorage`.
What's *not* portable is the scaffolding around it:

| Then | Why it blocks a stranger |
|---|---|
| ~~Web app hosted on the owner's cloud project; the bike loaded that URL.~~ **Done:** served from the APK. | Tied every install to one account and a deploy. |
| ~~Rides synced to a cloud database under anonymous auth.~~ **Done:** local only. | A cloud project, rules and auth setup: far too much for a novice. |
| Install is **Node + Android SDK + adb + `npm run` scripts** over USB. | Five developer tools and a terminal. A non-coder can't follow it. |
| The bike bind is hard-coded to **`affernet` / `SensorData`** service names, found once by a probe. | Other Peloton builds expose different sensor services/interfaces. |
| Setup (launcher swap, overlay grant, freeing Netflix, blocking OTA) is **my bike's quirks**, run by hand. | Android version and Peloton build differ; steps need to detect and adapt. |
| Screen is assumed **1920×1080 @ 240dpi**. | Tablets vary; layout must scale. |

Good news: three of these (hosting, the cloud database, build-from-source) can be *removed* outright; the first two already are.

## Design decisions for the generic version

### 1. No cloud — the app serves itself, storage is local (DONE)

- **The web is served from inside the APK.** The `copyWebAssets` Gradle task bundles `dist/` into the APK and `WebViewAssetLoader` serves it
  at `https://appassets.androidplatform.net`. There is no hosting, no deploy and no auto-updater: updating means installing a new APK.
- **Rides stay on the device** in `localStorage` (see DATA-CONTRACT). Works offline, needs no account.
- **Sync, if ever, stays optional:** an export/import of a rides file, default off. Nothing in the repo needs a key.

### 2. No CLI, no Claude Code — a one-click installer that carries its own tools

- **Ship a prebuilt APK on GitHub Releases.** A CI workflow (GitHub Actions) builds the release APK on every tag and attaches it. Users
  never build, never install the Android SDK, never touch Node.
- **Bundle `adb` with the installer.** Google's `platform-tools` is a ~15 MB zip that runs standalone. Include it in the release so the user
  installs nothing.
- **One double-clickable installer per OS** (`install-windows.bat` / `install-mac.command` / `install-linux.sh`) that:
  1. waits for a tablet in USB-debugging mode and prints a friendly message if it doesn't see one,
  2. installs the bundled APK,
  3. grants the overlay / usage / write-settings permissions via `adb appops`,
  4. runs the **sensor scan** (below) and saves the result,
  5. optionally makes the HUD the launcher,
  6. prints "done — unplug and ride."
- The installer is the *only* thing the user runs. It's a thin wrapper over `adb` commands we already have in `scripts/bike.mjs`; the plan is
  to port those into plain shell/batch so there's no Node dependency on the user's side.

### 3. Work across many Peloton builds and tablets — detect, don't hard-code

- **Runtime sensor discovery, in the app.** Generalize today's `probe` into the shell: on first run, enumerate candidate Peloton sensor
  services/interfaces (a built-in list, growing from community reports), try to bind each read-only, and keep the first that streams
  plausible data. Expose a "re-scan / pick sensor" control in settings and store the choice. Ship a **compatibility table** in the repo that
  maps Peloton model/build → working service, which installs can read and users can contribute to.
- **A generic fallback for hardware we can't bind:** support a standard **Bluetooth LE power/cadence sensor** (or ANT+) so the app is useful
  even on a build whose internal sensor is locked, or on a non-Peloton bike. This is what makes "many builds" real rather than aspirational.
- **Adapt the setup, don't assume it.** Launcher swap, overlay grant, OTA/membership handling must each check the current state and Android
  version and do only what's needed, with clear skips when a step isn't possible. `minSdk`/`targetSdk` stay 30 (the bike's Android 11);
  guard any version-specific call if other tablets are supported later.
- **Already-responsive UI:** confirm the layout holds from ~1280×720 up, at different densities; nothing here is hard-coded except a couple of
  native overlay sizes to double-check.

### 4. Public-repo hygiene (no secrets)

- With the cloud gone there are **no keys to leak**. The public repo starts from a fresh squashed root commit, so old history (which had a
  cloud key) is not published.
- `check-secrets` runs in the pre-push hook and in CI, flags Google API keys, and blocks any personal string listed in a gitignored
  `.private-patterns` file.
- Add `LICENSE` (MIT), a top-level `README` with screenshots/GIFs, `CONTRIBUTING.md`, and the compatibility table.

### 5. Flexibility

- Media launchers are now a **list of packages** (`src/media/apps.ts`), not a Netflix/Kindle pair. The shell reports which are installed
  (`queryApps` → `apps`) and launches any of them (`openApp { pkg }`, keeping Netflix's membership-skip quirk); Settings → Apps toggles each
  one and the home screen's buttons follow. Adding Disney+, Hulu, a browser, etc. is a catalog entry plus a manifest `<queries>` line. **Done.**
- Still open: fold the rest (sensor source/override, units, rider defaults) into one editable store if it grows; today they are separate
  localStorage keys (see DATA-CONTRACT).

### 6. Guided rides over *all* media (the layer model)

A power plan (target watts over timed segments) is a **layer that rides on top of whatever's on screen**, not its own screen. This already
works; it's worth stating because it shapes the generic build. What it looks like per media:

- **Blank stage / a workout on its own:** the full power meter — a vertical band with a marker, numbers, segment timeline.
- **A YouTube or scenic video (in-WebView):** a **compact gauge floats over the video** (web overlay). A scenic route plus a plan is just
  "open a route, add a plan" — the combine the owner asked for. Any video can take a plan; any plan can take a view.
- **Netflix / Kindle (their own apps):** the gauge is drawn **natively**, as a second small overlay window beside the stats bar. The overlay is
  *our* window, so sizing a gauge into it is fully under our control — the earlier doubt was only that it can't be *screenshotted* remotely.
  The hard part is real but solvable: the plan is handed to the shell flattened to `{ durationSec, targetW }[]`, and the overlay **walks it
  against elapsed seconds itself**, because the WebView (and all the web's segment math) is frozen while another app is in front. So the native
  side carries a small duplicate of the segment logic — the same pattern already used for TIME/OUTPUT/CAL behind the app.

**What this means for the generic version:**

- The web gauge is pure UI and portable to any tablet with zero per-build work.
- The native gauge rides entirely on the `SYSTEM_ALERT_WINDOW` overlay, which is already the load-bearing permission for Netflix/Kindle — so it
  adds **no new portability surface**: if the stats bar works over Netflix on a build, the gauge does too. Builds where the overlay can't be
  granted simply get guided rides over YouTube/scenic (web) and none over Netflix/Kindle — a clean, honest degradation.
- Guided rides make the **BLE power-meter fallback (decision 3) more valuable**: a plan is only as good as the power reading, so on builds where
  the internal sensor can't bind, a standard BLE power meter is what lets targets (and the gauge) work at all.
- Keep the native segment math a thin, tested mirror of `src/rides/rides.ts` (`resolvePlan` + the walk), the same way calories are mirrored —
  so "two halves, one contract" still holds when the app is served from the APK.

## What the end-user actually does (the limited-experience path)

1. On the tablet: enable **Developer options → USB debugging** (repo has a one-page guide with screenshots).
2. Download the latest **release `.zip`** from the GitHub Releases page.
3. Plug the tablet into the laptop with a USB cable; tap **Allow** on the tablet.
4. Double-click **`install-windows`** (or the mac/linux file). Watch it print progress; tap any on-screen prompts it mentions.
5. When it says done, **reboot the tablet**. It boots into the HUD. Optionally open Settings to pick media apps or a Bluetooth sensor.

No terminal, no account, no build. Re-running the installer later updates the app.

## Rough roadmap and effort

- **Phase A — Remove the cloud backend.** DONE: web bundled into the APK, local storage authoritative, hosting/database/auth/deploy gone.
- **Phase B — In-app sensor discovery + BLE fallback.** Move the probe into the shell; add a scan/pick UI; add a BLE power/cadence source.
  *~Medium–large (BLE is the long pole).*
- **Phase C — One-click installer + Releases CI.** Port `bike.mjs`'s adb steps to plain shell/batch; bundle platform-tools; GitHub Actions to
  build and attach the APK. *~Medium.*
- **Phase D — Config + flexible media + compatibility table.** *~Small–medium.*
- **Phase E — Public polish.** License, README, screenshots, setup guide with photos, CONTRIBUTING, first community compatibility entries.
  *~Small.*

## Risks and open questions

- **Sensor services vary and some may be locked** on certain builds; the BLE fallback is the hedge, and the compatibility table will be
  honest about what works where. This is the single biggest unknown.
- **Serving the app from the APK** (asset loader) still needs proving on the bike's WebView: module loading, autoplay, YouTube embeds and the
  WebMessage bridge must all still work. Low risk, first thing to check on the next USB install.
- **Launcher swap / disabling OTA / freeing Netflix** differ by build and some resist automation; the installer should attempt, detect, and
  fall back to clear manual instructions rather than fail.
- **Granting `SYSTEM_ALERT_WINDOW` without a terminal:** `adb appops` from the bundled installer covers it; if a build refuses, fall back to
  walking the user through the on-device toggle.
- **Legal/positioning:** frame it as "use the bike *you own* without a subscription," on your own hardware, with no circumvention for
  piracy and no redistribution of Netflix/Kindle/Peloton software. Keep the README measured; ship no third-party APKs.
- **Non-rooted, no Peloton account** stays a hard rule (as today).

## What does *not* change

The two-halves architecture, the pure domain math, the data contract, the visual system (`STYLE.md`), and the "read-only on the bike's
sensors, never sign into Peloton, never take an OS update" rules all carry straight over. This plan is about the shell and the packaging, not
the app.
