/**
 * adb helpers for the Peloton (plugged in over USB, USB debugging on).
 *
 *   npm run bike -- status     model, OS, screen, whether our app and its permissions are in place
 *   npm run bike -- setup      one-time: grant the HUD's permissions, free Netflix, block Peloton updates + remote management, make it the
 *                              launcher (runs installer/hud-setup.sh on the tablet; add --no-home to leave the launcher alone)
 *   npm run bike -- navbar     read-only: the system navigation bar's state (why Kindle's last line can be hidden)
 *   npm run bike -- navmode gestural|threebutton   switch the nav bar mode (untested on the bike; reversible)
 *   npm run bike -- reverse    let the bike reach this laptop's dev server (http://localhost:5180) for debug builds
 *   npm run bike -- probe      spike S1: which Peloton sensor services will let our app bind (needs the debug APK installed)
 *   npm run bike -- logs       follow our app's log
 *   npm run bike -- launch     cold-start our app (force-stops first, so it reloads the web app)
 *   npm run bike -- home       make our app the bike's launcher (boots the HUD, not Peloton); unhome reverses it
 *   npm run bike -- netflix    launch Netflix (needs setup first, which disables Peloton's membership gate)
 *   npm run bike -- kindle     launch the Kindle app (sideload its APK first; see docs/KINDLE.md)
 */
import { execFileSync, spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = 'app.pelotonhud'
const PORT = 5180

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r/g, '').trim()
const shell = (cmd) => adb('shell', cmd)
const tryShell = (cmd) => {
  try {
    return shell(cmd)
  } catch (e) {
    return `(failed: ${e.stderr?.toString().trim() || e.message})`
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function requireDevice() {
  const devices = adb('devices').split('\n').slice(1).filter((l) => /\tdevice$/.test(l))
  if (devices.length !== 1) {
    console.error(devices.length ? 'More than one device: unplug the others or set ANDROID_SERIAL.' : 'No bike found. Plug in the USB cable and accept the debugging prompt on the screen.')
    if (!process.env.ANDROID_SERIAL) process.exit(1)
  }
}

const commands = {
  status() {
    const installed = tryShell(`pm list packages ${PKG}`).includes(PKG)
    console.log(`Model:      ${shell('getprop ro.product.model')} (${shell('getprop ro.product.device')})`)
    console.log(`Android:    ${shell('getprop ro.build.version.release')}, Peloton OS ${shell('getprop ro.peloton.os.version')}`)
    console.log(`Screen:     ${shell('wm size').replace('Physical size: ', '')} @ ${shell('wm density').replace('Physical density: ', '')} dpi`)
    const nf = tryShell('pm list packages -e com.netflix.mediaclient').includes('netflix') ? 'enabled' : 'installed but disabled (npm run bike -- setup)'
    console.log(`Netflix:    ${tryShell('pm list packages com.netflix.mediaclient') ? nf : 'missing'}`)
    console.log(`Kindle:     ${tryShell('pm list packages com.amazon.kindle').includes('amazon') ? 'installed' : 'not installed (sideload the Kindle APK, then npm run bike -- kindle)'}`)
    console.log(`Our app:    ${installed ? tryShell(`dumpsys package ${PKG} | grep versionName`).trim() : 'not installed (npm run android:install)'}`)
    if (installed) console.log(`Overlay:    ${tryShell(`appops get ${PKG} SYSTEM_ALERT_WINDOW`)}`)
    if (installed) console.log(`Usage:      ${tryShell(`appops get ${PKG} android:get_usage_stats`)}`)
    if (installed) console.log(`Brightness: ${tryShell(`appops get ${PKG} android:write_settings`)}`)
    console.log(`Freeform:   ${tryShell('settings get global enable_freeform_support')}`)
    // Needs the MAIN action as well as the HOME category, or resolve-activity reports "No activity found" even when a home is set.
    console.log(`Home app:   ${tryShell('cmd package resolve-activity -a android.intent.action.MAIN -c android.intent.category.HOME --brief | tail -1').trim()}`)
    const disabled = tryShell('cmd package list packages -d')
    console.log(`Netflix gate: ${disabled.includes('com.onepeloton.systempluginui') ? 'disabled (Netflix free)' : 'ENABLED — run setup to free Netflix'}`)
    console.log(`Reactivate nag: ${disabled.includes('com.peloton.activity') ? 'disabled' : 'ENABLED — run setup to suppress'}`)
    const updaters = ['com.onepeloton.OTAService', 'com.onepeloton.fwupdateservice', 'com.onepeloton.bgupdater', 'com.peloton.updater', 'com.onepeloton.dm.android']
    const live = updaters.filter((p) => !disabled.includes(p))
    const autoOta = tryShell('settings get global ota_disable_automatic_update').trim()
    console.log(`Updates:    ${live.length ? `OPEN — enabled: ${live.join(', ')} (run setup)` : `locked (updaters + DM agent disabled, auto-OTA ${autoOta === '1' ? 'off' : autoOta})`}`)
  },
  // One-time setup. The steps live in installer/hud-setup.sh (runs on the tablet), shared with the double-click installers; the long notes
  // below on why each package is disabled stay here as the record of what was verified on the bike.
  setup() {
    adb('push', join(root, 'installer', 'hud-setup.sh'), '/data/local/tmp/hud-setup.sh')
    console.log(adb('shell', 'sh', '/data/local/tmp/hud-setup.sh', ...process.argv.slice(3)))
  },
  // Why the bottom of the Kindle page can be hidden: show the navigation bar's state and which nav-bar modes this build offers. Read-only.
  navbar() {
    console.log(tryShell("dumpsys window | grep -iE 'NavigationBar|mNavigationBarPosition|navbar' | head -20"))
    console.log('\nNav-bar overlays on this build (enable one with: npm run bike -- navmode gestural|threebutton):')
    console.log(tryShell('cmd overlay list | grep -i navbar') || '(none listed)')
  },
  // Switch the system navigation bar mode. "gestural" shrinks it to a thin handle, which may stop it covering Kindle's last line. Untested on
  // the bike (docs/KINDLE.md); reversible with "threebutton".
  navmode() {
    const mode = process.argv[3]
    const overlays = { gestural: 'com.android.internal.systemui.navbar.gestural', threebutton: 'com.android.internal.systemui.navbar.threebutton' }
    if (!overlays[mode]) {
      console.error('usage: npm run bike -- navmode gestural|threebutton')
      process.exit(2)
    }
    console.log(tryShell(`cmd overlay enable-exclusive --category ${overlays[mode]}`) || `Nav bar mode: ${mode}.`)
  },
  // What setup (installer/hud-setup.sh) disables, and why. Verified on the bike 2026-11-03:
  // Let the kiosk guard see which app is foregrounded, so it can pull the HUD back from a Peloton app. Reversible (appops set ... default).
  // Let the HUD's brightness slider change system brightness (replaces the Peloton bar's control). Reversible (appops set ... default).
  // Freeform windowing must stay OFF: with it on, our fullscreen WebView activity renders into a 0-size window and the screen goes
  // black. The Netflix overlay uses a fullscreen TYPE_APPLICATION_OVERLAY window instead of shrinking Netflix into a freeform box.
  // Netflix ships disabled on this build; enable it so the shell can launch it.
  // Free Netflix from Peloton's membership gate. `com.onepeloton.systempluginui` runs an AuthValidator that, with no Peloton login
  // (we never sign in), kills Netflix ~0.4s after it launches ("sending user to login screen" → "app died") — that's the "you must be
  // logged in and have an active subscription" error. Disabling that package stops the gate and Netflix launches and stays up. It is
  // also what drew the Peloton bottom bar and the lock screen, so those go (the HUD provides its own volume/brightness and wakes
  // straight to itself). Verified 2026-11-03: sensor binding (separate package com.peloton.service.SensorData) and sleep/wake are
  // unaffected. Reversible: pm enable com.onepeloton.systempluginui. (The "Anonymous-DexFile checksum mismatch" logcat line is a
  // harmless ART warning, not the cause — Netflix survives it; no recompile is needed.)
  // Suppress Peloton's "sign in to your account to reactivate" nag. `com.peloton.activity` is Peloton's activation/setup app
  // (com.peloton.activation.ActivationActivity, com.peloton.setup.SetupActivity). With no membership it repeatedly foregrounds those
  // screens over the HUD and over Netflix, held SYSTEM_ALERT_WINDOW so it could draw as an overlay too, and auto-starts on boot via a
  // BootCompleteReceiver. It shares no uid with the sensor service (com.peloton.service.SensorData) and is not the keyboard
  // (com.peloton.inputmethod.latin), so disabling it leaves live stats and the keypad untouched. Verified 2026-11-03: process stays dead,
  // no relaunch, HUD foreground, sensors bound. Reversible: pm enable com.peloton.activity.
  // Boot into our HUD, not Peloton's launcher: make our app the preferred HOME. Reversible (npm run bike -- unhome).
  // Stop Peloton pushing OS/app/firmware updates or remotely changing the bike now that it is on Wi-Fi. Disable the updater apps AND
  // com.onepeloton.dm.android — Peloton's device-management/installer agent: it wakes on every CONNECTIVITY_CHANGE, can install packages
  // (it handles peloton.INSTALL_PACKAGE and application/vnd.android.package-archive) and re-enabled com.peloton.activity after a Wi-Fi
  // reconnect, and is the likely culprit that wiped the saved Wi-Fi. It is not a device-admin/owner and shares no uid with the sensor
  // service, so disabling it leaves sensors and the HUD working (verified 2026-11-03). The firmware/OTA executors (com.onepeloton.raccoon
  // for MCB/stepper firmware, com.onepeloton.boomerang) are left enabled on purpose — they sit near the hardware stack and only *apply*
  // what this agent fetches, so cutting the agent (plus the updater apps below) starves them. All reversible with pm enable.
  // Belt-and-braces: turn Android's own automatic OTA off too.
  // This Peloton build only logs warnings and worse (log.tag=W); let our app's own tags through.
  // Make our HUD the bike's launcher, so it boots into our software instead of Peloton's paywall. Unprivileged, reversible.
  home() {
    console.log(tryShell(`cmd package set-home-activity ${PKG}/.MainActivity`) || `Home set to ${PKG}. Press the bike's home control to test.`)
  },
  unhome() {
    console.log(tryShell('cmd package set-home-activity com.peloton.launcher/.MainActivity') || 'Home restored to the Peloton launcher.')
    console.log('If that package/activity is wrong, run: adb shell cmd package query-activities -c android.intent.category.HOME')
  },
  reverse() {
    adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`)
    console.log(`The bike's localhost:${PORT} now reaches this laptop. Run npm run dev, then npm run bike -- launch.`)
  },
  // `-S` force-stops the app first, so launch always cold-starts and the WebView reloads the web app. Without it, `am start` on an
  // already-running HUD just brings the old WebView to the front, so a fresh dev-server change or reinstall would not show until a cold start.
  launch() {
    console.log(shell(`am start -S -n ${PKG}/.MainActivity`))
  },
  // Launch Netflix straight into NetflixComLaunchActivity (not Peloton's membership-gated wrapper). Needs the membership gate disabled
  // first (npm run bike -- setup); otherwise com.onepeloton.systempluginui kills it ~0.4s in. No recompile needed.
  netflix() {
    console.log(shell('am start -n com.netflix.mediaclient/.ui.launch.NetflixComLaunchActivity'))
  },
  // Launch the Kindle app (sideload the Kindle for Android APK first — it is not on this bike by default). The HUD's Kindle button does the
  // same over the bridge, drawing the ride-stats overlay on top and buffering the ride behind it (N1). Sign into Amazon once on the bike so
  // Whispersync keeps reading progress in sync across devices. See docs/KINDLE.md.
  kindle() {
    const pkg = 'com.amazon.kindle'
    if (!tryShell(`pm list packages ${pkg}`).includes(pkg)) {
      console.log('Kindle is not installed. Sideload it: adb install path/to/kindle.apk  (then: npm run bike -- kindle)')
      return
    }
    tryShell(`pm enable ${pkg}`)
    console.log(shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`))
  },
  async probe() {
    adb('logcat', '-c')
    shell(`am start -W -n ${PKG}/.ProbeActivity`)
    await sleep(8000)
    const lines = adb('logcat', '-d', '-s', 'PelotonHudProbe:*', 'ActivityManager:W', 'AndroidRuntime:E')
    console.log(lines || 'No probe output: is the debug APK installed? (npm run android:install)')
  },
  // Launch the live-data sniffer and capture its log while you pedal. SECONDS can be passed (default 45).
  async sniff() {
    const seconds = Number(process.argv[3]) || 45
    shell(`am start -W -n ${PKG}/.SniffActivity`)
    console.log(`Sniffer started. PEDAL NOW and turn the resistance knob through its range — capturing for ${seconds}s...`)
    await sleep(seconds * 1000)
    const lines = adb('logcat', '-d', '-s', 'PelotonHudSniff:*', '-v', 'time')
    console.log(lines || 'No sniff output: is the debug APK installed? (npm run android:install)')
  },
  logs() {
    const pid = tryShell(`pidof ${PKG}`)
    const args = /^\d+$/.test(pid) ? ['logcat', `--pid=${pid}`] : ['logcat', '-s', 'PelotonHud:*', 'PelotonHudProbe:*', 'chromium:*']
    spawn('adb', args, { stdio: 'inherit' })
  },
}

const name = process.argv[2]
if (!commands[name]) {
  console.error(`usage: npm run bike -- <${Object.keys(commands).join('|')}>`)
  process.exit(2)
}
requireDevice()
await commands[name]()
