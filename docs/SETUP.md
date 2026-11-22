# Developer setup

This is for building the app yourself. To just install it on a bike, see [INSTALL.md](INSTALL.md).

## Computer (once)

- Node 24 (`.nvmrc`), then `npm install` (it also switches on the pre-push secrets hook).
- JDK 17 or newer.
- The Android SDK, command line only, with `platforms/android-36` and `build-tools/36.1.0`. Install Google's command line tools into
  `<sdk>/cmdline-tools/latest`, then run `sdkmanager "platforms;android-36" "build-tools;36.1.0"`. Set `ANDROID_HOME` to `<sdk>` (or put
  the SDK in the default place: `%LOCALAPPDATA%\Android\Sdk` on Windows, `~/Library/Android/sdk` on macOS, `~/Android/Sdk` on Linux).
- `adb` (Google's platform-tools) on the PATH.
- Optional: list your own personal strings (name, email, bike serial) in a gitignored `.private-patterns` file, one per line, and the
  pre-push hook will refuse to push any file that contains them.

## The bike (once)

1. Turn on USB debugging (see [INSTALL.md](INSTALL.md)), connect the cable, and accept the prompt on the screen. `npm run bike -- status`
   should list the bike.
2. Build and install: `npm run build`, then `node scripts/android.mjs assembleRelease`, then
   `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
3. `npm run bike -- setup` grants the HUD its permissions (overlay, usage access, brightness), enables Netflix, disables Peloton's
   membership gate, reactivation nag, updaters and device-management agent, turns auto-OTA off, keeps freeform windowing **off**, and makes
   the HUD the launcher. Everything it does can be undone (see the comments in `scripts/bike.mjs`).
4. `npm run bike -- probe` (debug APK) should list the sensor services the app can bind.

Do **not** sign the bike into a Peloton account at any point, and never take a Peloton OS update. `npm run bike -- unhome` restores Peloton's
launcher.

## Day to day

```bash
npm run dev               # web app on http://127.0.0.1:5180 (add ?sim for a simulated, pedaling bike)
npm run bike -- reverse   # let the bike's localhost:5180 reach this computer (debug APK)
npm run bike -- launch    # cold-start the HUD on the bike
npm run bike -- logs      # native + web console logs
npm run verify            # before pushing
npm run android:test      # Kotlin unit tests
```

The debug APK loads the dev server through `adb reverse`; the release APK serves its own bundled copy of the web app and needs no
internet (only the media apps do). Rebuild the web (`npm run build`) before `assembleRelease`, so the APK bundles the latest web.
