# Install Peloton HUD on your bike

Peloton HUD turns your Peloton Bike's screen into your own ride dashboard: live power, cadence, output and calories around the edges,
with YouTube, Netflix and any other media apps you add in the middle. **No Peloton membership, no account, no cloud, no root.** Your rides
are saved on the bike itself.

You need:

- Your Peloton Bike (the tablet), switched on.
- A computer: Windows, Mac or Linux.
- A **USB data cable** that fits the port on the back of the tablet (some cables only charge; if the computer never sees the tablet, try
  another cable).
- About 15 minutes. No coding, no terminal.

> **Before you start:** never sign the bike into a Peloton account, and decline any Peloton software update. An update can undo this setup
> and can switch off USB debugging. The installer turns Peloton's automatic updates off for you.

## 1. Turn on USB debugging on the tablet

This lets your computer install an app on the tablet. Menu names vary a little between Peloton software versions.

1. On the bike's screen, open the settings (the gear icon), then **Device Settings**. This opens the tablet's Android settings.
2. Tap **About tablet**.
3. Tap **Build number** seven times in a row. You'll see "You are now a developer!"
4. Go back, then open **System** → **Developer options** (on some versions Developer options is directly in the main settings list).
5. Turn on **USB debugging**, and confirm.

## 2. Download Peloton HUD

1. Go to this project's **Releases** page on GitHub and download the latest `peloton-hud-vX.Y.Z.zip`.
2. Unzip it into a folder (on Windows: right-click → **Extract All**). Keep all the files together.

## 3. Run the installer

1. Plug the tablet into your computer with the USB cable.
2. Double-click the installer for your computer:
   - **Windows:** `install-windows.bat`. If Windows shows "Windows protected your PC", click **More info** → **Run anyway**.
   - **Mac:** `install-mac.command`. The first time, **right-click it → Open → Open** (macOS blocks double-clicking downloaded scripts).
   - **Linux:** open a terminal in the folder and run `sh install.sh`.
3. When the tablet asks **"Allow USB debugging?"**, tick **Always allow from this computer** and tap **Allow**.
4. The installer downloads Google's `adb` tool if your computer doesn't have it (about 7 MB, from Google), installs the app, sets up the
   tablet, and offers to reboot it. Say yes.

When the tablet restarts, it opens straight into the HUD. You can unplug the cable.

**What the installer changes on the tablet** (all reversible; see "Undo" below): lets the HUD draw its stats bar over other apps, see
which app is in front, and set the screen brightness; turns on a small accessibility service so the stats bar's **Back** button can step
back inside full-screen apps like SmartTube that hide the system navigation bar (it watches nothing and reads no screen content); turns off
Peloton's updaters, its remote-management agent and Android's automatic updates; turns off the Peloton membership screens that block Netflix
and keep asking you to sign in; enables Netflix; makes the HUD the home screen. It keeps "freeform windows" off (turning that on blanks the screen).

## Using it

- **Start** a ride from the HUD; it auto-pauses when you stop pedaling. Rides are listed under **History**.
- **Profiles.** One bike, more than one rider: **Settings → Profile** keeps separate weight, FTP and ride history per person. It only
  changes your bike stats — not the media apps or their sign-ins, which are shared.
- **Settings** (the gear at the top of the HUD): your weight and FTP (for calories and power zones), units, which media apps show on the
  home screen (**Apps**), rider profiles, and **Device**: open Peloton's own app, Android settings (Wi-Fi), or choose a different home screen.
- **Media apps.** Only Netflix comes on the bike. Everything else you *sideload* — see below. Once an app is installed, turn it on under
  **Settings → Apps** and a launch button appears on the home screen; each opens full screen with the stats bar over it, and you sign into
  each one once. The stats bar's **Back** (‹) and **Home** buttons navigate even when the app itself hides the system nav bar.
- **YouTube.** The **YouTube** button launches **SmartTube** (a free, Google-services-free native YouTube client) when it's installed —
  the bike has no Google Play Services, so the official YouTube app can't sign in. Sideload SmartTube to use it. Without it, the YouTube
  button falls back to a built-in web player (also what guided rides draw the power gauge over).

## Adding more apps (sideloading)

The bike runs ordinary Android apps, but it has no app store, so you add apps by copying their installer file onto it. The installer does
that for you — you just drop the files in a folder.

> **Apps are specific to the tablet.** An app's installer file is built for a particular CPU and Android version, so the ones that work are
> the ones that match *your* tablet. The HUD shows your tablet's details under **Settings → Apps** (e.g. `arm64-v8a`, Android 11). The
> installer reads your tablet and installs only the parts that fit, skipping anything that doesn't — so **don't expect a file that worked on
> someone else's tablet to work on yours.** This is why the public download ships *no* apps; you add your own.

1. **Download the apps** on your computer from a trusted source such as **apkmirror.com**. Get the normal phone/tablet app (not the "Android
   TV" one). Two kinds of file both work:
   - a single **`.apk`** — pick the variant for your tablet's CPU (shown in Settings → Apps; e.g. `arm64-v8a`), or a *universal* / *nodpi* one;
   - a split **bundle** (**`.apkm`**, `.xapk`, `.apks`) — APKMirror offers these for some apps. The installer unpacks it and picks the parts
     that match your tablet's CPU and screen density automatically, so just download and drop it in.
2. **Put the files in the `apps` folder** inside the unzipped download (next to the installer).
3. **Run the installer** (or run it again). It installs the HUD, then each app in `apps` that fits your tablet, and tells you which it skipped.
4. **Turn them on** in the HUD under **Settings → Apps**.

Apps that work without Google services (so they work here): **Netflix** (already on the bike), **Prime Video** and **Kindle** (Amazon),
**Disney+**, **Hulu**, **Max**, and **SmartTube** for YouTube. Each needs its own sign-in. Video may be standard-definition on some apps
(the bike isn't Google-certified for HD DRM). Google's own apps (the official YouTube / YouTube TV) need Play Services and won't work.
- **Stuck?** Hold your finger on the **top-left corner of the screen for 3 seconds**. A recovery screen opens (it works even if the HUD
  itself didn't load) with Retry, Android settings, Choose home app and Open Peloton app.

## Updating

Download the newer zip from Releases and run the installer again. Your rides and settings are kept.

## Undo / go back to Peloton

- **Just for now:** Settings → **Open Peloton app**. Press the Home button to come back to the HUD.
- **Make Peloton the home screen again:** Settings → **Choose home app** → pick Peloton's launcher. (Or hold the top-left corner for 3
  seconds → Choose home app.)
- **Remove the HUD:** Android settings → Apps → Peloton HUD → Uninstall. This erases its saved rides.
- **Turn Peloton's apps back on:** with the tablet plugged in, run `adb shell pm enable <package>` for each package the installer listed as
  "disabled" (e.g. `com.onepeloton.systempluginui`). Turning the updaters back on lets Peloton update the bike again.
- **Turn off the HUD's Back-button accessibility service:** `adb shell settings put secure enabled_accessibility_services ""` (the stats
  bar's Back button then just returns to the HUD instead of stepping back inside an app).

## Troubleshooting

| Problem | Try |
|---|---|
| "No tablet found" | USB debugging on? A different cable (data, not charge-only) or USB port? Tap **Allow** on the tablet. |
| "A different build of the HUD is already installed" | Someone installed a HUD signed with another key. Uninstalling it erases its rides; the message says how if you're sure. |
| No live stats (zeros while pedaling) | Your bike's software may expose its sensor differently. Use a Bluetooth power meter or cadence sensor instead (Settings → Sensor → Find a Bluetooth sensor; Android asks for location permission and needs Location turned on to scan). And please open an issue with your bike model and the Peloton OS version shown at the top of the installer's output. |
| Netflix closes right away | Run the installer again; it turns off the membership gate that kills Netflix. |
| The screen goes black after a change | Hold the power button and reboot. Never turn on "freeform windows" in Developer options. |
| Kindle's bottom line (or an app's bottom edge) is cut off | A hardware limit: the bike's system navigation bar sits ~72px up the screen, and this Peloton build offers no way to hide or shrink it without rooting (which this project doesn't do). The top of the HUD's stats bar can be tucked away with its chevron, but the bottom bar is the system's. |
| Video looks soft / standard-definition | Expected on some apps. The bike isn't Google-certified for high-definition DRM, so those apps fall back to SD. Netflix and Kindle are unaffected. |
| A sideloaded app won't open or sign in | It probably needs Google Play Services, which the bike doesn't have. Google's own apps (official YouTube, YouTube TV) won't work — use SmartTube or the built-in YouTube player. Most other streaming apps (they ship on Amazon Fire / smart TVs too) are fine. |
| Can't go back inside SmartTube (or another app with no on-screen Back) | Use the **‹ Back** button on the HUD's stats bar at the top. If it only returns to the HUD instead of stepping back in the app, the Back accessibility service isn't enabled — run the installer again, or `adb shell settings put secure enabled_accessibility_services app.pelotonhud/app.pelotonhud.BackAccessibilityService` then `adb shell settings put secure accessibility_enabled 1`. |

## Which bikes work

Tested on the original **Peloton Bike** (Android 11). Other models and Peloton software versions may differ, especially in how the
power/cadence sensor is exposed. If you try it on another model, please report what worked in an issue so others know.
