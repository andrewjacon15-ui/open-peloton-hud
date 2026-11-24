# Peloton HUD

Turn your Peloton Bike's screen into your own ride dashboard — live power, cadence, output and calories around the edges, with YouTube,
Netflix, and other apps you add in the middle. **No Peloton membership, no account, no cloud, no root.** The bike boots straight into the
HUD instead of Peloton's sign-in wall, everything runs as a normal sideloaded app, and your rides are saved on the bike itself.

> Use the bike **you own**, without a subscription. This doesn't pirate anything or modify Peloton's or anyone else's apps — it's a home
> screen that puts your own dashboard around whatever you choose to watch, and launches the streaming apps you install and sign into yourself.

## What you get

- **Ride tracking** — power, cadence, resistance, speed, output (kJ) and calories, recorded to a history on the bike. Works with the bike's
  built-in sensor, or a standard Bluetooth power meter / cadence sensor if yours can't be read.
- **Workouts** — structured power sessions (recovery, Z2 endurance, sweet spot, VO2 max, a real 20-minute FTP test), with a live power trace
  you keep inside the target band. Import any `.zwo` workout too.
- **Scenic routes** — full-bleed POV cycling videos; add a power plan on top to ride a target over the scenery.
- **Your apps in the middle** — a launch button for each media app you've enabled, each opening full screen with the stats bar drawn over it.

## Install it on your bike

A USB cable, a computer, and about 15 minutes — no coding. See **[docs/INSTALL.md](docs/INSTALL.md)**.

In short: turn on USB debugging, download the latest release zip, drop any extra app APKs into its `apps` folder, and run the installer for
your OS. It installs the HUD, sideloads your APKs, sets the bike up, and reboots into the HUD.

## Media apps

Only **Netflix** comes on the bike. Everything else you sideload (the installer does it for you — see INSTALL.md), then enable under
**Settings → Apps**. Apps that run without Google Play Services — which the bike doesn't have — work here:

| App | Notes |
|---|---|
| Netflix | Pre-installed; the one Peloton ships. |
| YouTube | The YouTube button launches **SmartTube** (a Google-services-free native YouTube client) when it's installed; otherwise a built-in web player (also what guided rides ride over). The official YouTube app needs Play Services, which the bike lacks. |
| Prime Video, Disney+, Max, Hulu, Peacock | Sideload from a trusted source (e.g. APKMirror); each uses its own sign-in. |
| Kindle | Sideload; read with your stats around the page. |

Sign into each app once on the bike. The stats bar's **‹ Back** and **Home** buttons navigate even in full-screen apps (like SmartTube)
that hide the system nav bar. **Video may be standard-definition** on some apps — the bike isn't Google-certified for HD DRM.

## Known limitations

- **Kindle's bottom line / full-screen apps** can sit behind the system navigation bar. This Peloton build gives no way to hide or shrink
  that bar without rooting, which this project does not do.
- **Google's own apps** (the official YouTube, YouTube TV) need Google Play Services and won't run; use SmartTube / the built-in player.
- Scenic routes play from YouTube, so a video can go away over time; swap the id in `src/rides/rides.ts`.
- Tested on the original **Peloton Bike** (`PLTN-RB1VQ`, Android 11, arm64-v8a). Other models may expose their sensor differently — a
  Bluetooth sensor is the fallback. If you try another model, please open an issue with what worked.

## Privacy

No account, no cloud, no telemetry. Rides and settings live in the WebView's local storage on the bike and never leave it. The repo carries
no keys; personal data stays in gitignored files on your own machine.

## For developers

Two halves, one contract: a React/TypeScript web app (`src/`) and a Kotlin Android shell (`android/`) that talks to it over a message port.
The web app is pure and testable on a laptop; the shell does only what the web can't (bind the sensor, record in the background, draw over
other apps).

| Path | What |
|---|---|
| `src/` | Web app (React, TypeScript, Vite). `bridge/` talks to the shell (or a simulated bike), `ride/` records/stores rides, `domain/` is pure effort math, `media/` is the app catalog + YouTube. |
| `android/` | Native shell (Kotlin): full-screen WebView serving the bundled web app, sensor binding, ride recording, the native stats overlay. |
| `scripts/` | `bike.mjs` (adb helpers), `android.mjs` (Gradle), `check-secrets.mjs`. |

| Command | |
|---|---|
| `npm run dev` | Web app at http://127.0.0.1:5180 (`?sim` simulates a pedaling bike) |
| `npm run verify` | Secrets, lint, types, unit tests, build, audit |
| `npm run android:build` / `android:test` / `android:install` | Build the shell, run its tests, install on the bike |
| `npm run bike -- <status\|setup\|logs\|home\|unhome>` | Bike helpers over adb |

More: [docs/PLAN.md](docs/PLAN.md) (architecture, what's on the bike), [docs/DATA-CONTRACT.md](docs/DATA-CONTRACT.md) (shell ↔ web messages),
[docs/SETUP.md](docs/SETUP.md) (dev setup), [docs/PORTABILITY-PLAN.md](docs/PORTABILITY-PLAN.md) (the generic-version plan),
[docs/RELEASING.md](docs/RELEASING.md) (cutting releases). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE). Not affiliated with Peloton, Netflix, Amazon, or any other company named here; all trademarks belong to their
owners. Launching an app you installed is yours to do on hardware you own.
