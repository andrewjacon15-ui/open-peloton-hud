#!/system/bin/sh
# Peloton HUD: one-time bike setup. Runs ON the tablet, as the adb shell user (no root):
#
#   adb push hud-setup.sh /data/local/tmp/ && adb shell sh /data/local/tmp/hud-setup.sh [--no-home]
#
# The installers (install-windows.bat, install-mac.command, install.sh) and `npm run bike -- setup` all run this same file, so the
# steps live in one place. Every step checks first and skips cleanly when something isn't on this build. Everything here is reversible
# (see the "undo" notes), nothing needs root, and it NEVER enables freeform windowing (that blanks the screen until a reboot).

PKG=app.pelotonhud
SET_HOME=1
[ "$1" = "--no-home" ] && SET_HOME=0

ok() { echo "  ok    $1"; }
skip() { echo "  skip  $1"; }
warn() { echo "  WARN  $1"; }

PACKAGES="$(pm list packages 2>/dev/null)"
has() { echo "$PACKAGES" | grep -q "^package:$1\$"; }

# Disable an app for this user (the reversible kind: `pm enable <pkg>` undoes it). Only if it is installed.
disable() {
  if has "$1"; then
    if pm disable-user --user 0 "$1" >/dev/null 2>&1; then ok "disabled $1 ($2)"; else warn "could not disable $1 ($2)"; fi
  else
    skip "$1 not on this build ($2)"
  fi
}

echo "Peloton HUD setup on $(getprop ro.product.model), Android $(getprop ro.build.version.release)"
PELOTON_OS="$(getprop ro.peloton.os.version)"
[ -n "$PELOTON_OS" ] && echo "Peloton OS $PELOTON_OS" || echo "Not a Peloton build: the Peloton-specific steps will skip."

if ! has "$PKG"; then
  echo "The HUD app ($PKG) is not installed. Install the APK first."
  exit 1
fi

echo
echo "Permissions for the HUD:"
# Draw the stats bar over Netflix/Kindle. Undo: appops set $PKG SYSTEM_ALERT_WINDOW default
appops set "$PKG" SYSTEM_ALERT_WINDOW allow && ok "draw over other apps"
# See which app is in front, so the kiosk guard can bring the HUD back from a Peloton screen.
appops set "$PKG" android:get_usage_stats allow && ok "usage access (kiosk guard)"
# Change screen brightness from the HUD's slider.
appops set "$PKG" android:write_settings allow && ok "change brightness"
# Let the overlay's Back button step back inside full-screen apps like SmartTube, which hide the system nav bar and have no on-screen Back.
# The service observes nothing; it only performs a system Back on request. Undo: settings put secure enabled_accessibility_services ""
A11Y="$PKG/$PKG.BackAccessibilityService"
CUR="$(settings get secure enabled_accessibility_services 2>/dev/null)"
case ":$CUR:" in
  *":$A11Y:"*) ok "overlay Back (already enabled)" ;;
  *)
    if [ -z "$CUR" ] || [ "$CUR" = "null" ]; then NEW="$A11Y"; else NEW="$CUR:$A11Y"; fi
    settings put secure enabled_accessibility_services "$NEW" && settings put secure accessibility_enabled 1 && ok "overlay Back button (accessibility)"
    ;;
esac

echo
echo "Safety:"
# Freeform windowing must stay OFF: with it on, the HUD renders into a 0-size window and the screen goes black until a reboot.
settings put global enable_freeform_support 0 && ok "freeform windowing off"

echo
echo "Stop Peloton updates and remote management (an update can undo all of this):"
for p in com.onepeloton.OTAService com.onepeloton.fwupdateservice com.onepeloton.bgupdater com.peloton.updater; do
  disable "$p" "updater"
done
# Peloton's device-management/installer agent: it can install packages and re-enable what we disable. Not a device admin; sensors and the
# HUD keep working without it. The firmware executors (raccoon, boomerang) are left alone on purpose: they only apply what this fetches.
disable com.onepeloton.dm.android "device-management agent"
settings put global ota_disable_automatic_update 1 && ok "Android automatic OTA off"

echo
echo "Membership screens (the HUD never signs in to Peloton):"
# Peloton's membership gate: with no Peloton login it kills Netflix ~0.4 s after launch and draws the Peloton bottom bar. The HUD has its own
# volume/brightness controls. Sensors are a separate package and are unaffected.
disable com.onepeloton.systempluginui "membership gate, frees Netflix"
# The "sign in to reactivate" nag that keeps popping over the HUD and Netflix.
disable com.peloton.activity "reactivation nag"
if has com.netflix.mediaclient; then
  pm enable com.netflix.mediaclient >/dev/null 2>&1 && ok "Netflix enabled"
else
  skip "Netflix not installed"
fi

# Our own log tags (this Peloton build drops anything below warning).
setprop log.tag.PelotonHud VERBOSE 2>/dev/null
setprop log.tag.PelotonHudProbe VERBOSE 2>/dev/null

echo
if [ "$SET_HOME" = "1" ]; then
  # Boot into the HUD instead of Peloton's launcher. Undo: Settings > Apps > Default apps > Home app, or the HUD's
  # Settings > "Choose home app", or hold the top-left corner of the HUD for 3 s.
  if [ "$(cmd package set-home-activity "$PKG/.MainActivity" 2>&1)" = "Success" ]; then ok "HUD is the home screen"; else warn "could not set the HUD as home; pick it in Settings > Apps > Default apps"; fi
else
  skip "home screen left as it is (--no-home)"
fi

echo
echo "Done. Reboot the tablet; it should start in the HUD."
