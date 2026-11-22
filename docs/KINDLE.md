# Kindle on the bike

Read a Kindle book while you pedal, with the ride-stats overlay on top and the ride still recording — the same pattern as Netflix. Reading
progress stays in sync with the rest of your devices through Amazon's own Whispersync; we build none of that sync, we just run the Kindle app
signed into your account.

## How it works

- **Overlay path, like Netflix.** The Kindle Android app runs full screen; the shell draws the same `NetflixOverlay` stats strip over it
  (TIME / POWER / CADENCE / RESIST / OUTPUT, "‹ HUD" to leave) and keeps recording the ride via the N1 sample buffer
  ([SOFTWARE-PLAN.md](SOFTWARE-PLAN.md)). So biking + reading records a normal ride.
- **Whispersync does the cross-device part.** The Kindle app syncs your furthest page read, bookmarks and notes to your Amazon account and
  back down to your phone, tablet and other Kindles. All we have to do is run the Kindle app signed into your account; the bike becomes just
  another Kindle. We store no Amazon credentials and never type your password — **you sign into the Kindle app on the bike yourself, once.**
- **Launch.** The HUD's **Kindle** button sends `openKindle` over the bridge; `MainActivity.openKindle()` launches `com.amazon.kindle` and
  shows the overlay. `npm run bike -- kindle` does the same from the laptop.

## The one manual step: get the Kindle app onto the bike

This bike has **no Google Play Store and no Amazon Appstore**, and the Kindle app is not preinstalled, so it has to be sideloaded once:

1. Download the **Kindle for Android APK** from Amazon (amazon.com/kindleforandroid — Amazon distributes it directly, since it is not on
   Play). Put the `.apk` on the laptop.
2. `adb install path/to/kindle.apk`
3. `npm run bike -- kindle` to launch it (it also `pm enable`s it). The HUD's Kindle button works from then on.
4. In the Kindle app, **sign into your Amazon account** (you do this; we never see the password). Your library and reading progress appear,
   and Whispersync keeps them current across devices.

`npm run bike -- status` shows `Kindle: installed` once step 2 is done; until then the HUD's Kindle button reports "Install the Kindle app
first."

## What is built (this scaffolding)

- Home screen **Kindle** button (`src/ui/HomeView.tsx`), amber accent.
- `openKindle` web→shell command (`src/bridge/types.ts`, `docs/DATA-CONTRACT.md`) and `media.openKindle` (`src/media/useMedia.ts`).
- `MediaKind` gains `'kindle'` (`src/media/kind.ts`) so a Kindle ride saves like any other.
- `MainActivity.openKindle()` launches `com.amazon.kindle`, reuses the stats overlay, and buffers the ride behind it; package visibility in
  `AndroidManifest.xml`; `npm run bike -- kindle` + a `status` line in `scripts/bike.mjs`.

## Pending (needs the APK + a bike check)

- Sideload the Kindle APK and sign in (the manual step above) — can't be done from here (we don't fetch APKs or enter your Amazon password).
- Verify on the bike: Kindle launches full screen, the stats overlay sits on top, and a ride recorded while reading has no gap.
- Nice-to-have later: a "resume last book" deep link (Kindle supports `kindle://` and content deep links) so the button opens straight into
  the current book; and showing the book title in the saved ride's `media.title`.

## The bottom line of text is cut off (open)

Seen on the bike: Kindle's last line of text sits behind a black bar at the bottom of the screen. The HUD's own overlay is top-anchored
(and collapsible), so it is almost certainly the **system navigation bar**, not ours. Not yet confirmed on the device. Next USB session:

1. `npm run bike -- navbar` (read-only): prints the navigation bar's state and the nav-bar modes this build has.
2. If a gestural mode is listed, try `npm run bike -- navmode gestural` (shrinks the bar to a thin handle). Undo:
   `npm run bike -- navmode threebutton`. Check Kindle, Netflix and the HUD afterwards; if it helps, add it to `installer/hud-setup.sh`.

Ruled out: `settings put global policy_control immersive.navigation=*` (the usual trick) was removed in Android 11, which this bike runs.
We cannot hide another app's system bars from our app, and freeform windowing is never an option (it blanks the screen).

## Not needed / explicitly avoided

- No custom Amazon sync, no Amazon API, no stored credentials — Whispersync in the official app covers it.
- Never sign the bike into Peloton or take a Peloton OS update (unrelated to Amazon; the standing rule still holds).
