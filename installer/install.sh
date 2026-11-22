#!/bin/sh
# Peloton HUD installer for macOS and Linux. On a Mac, double-click install-mac.command (it runs this); on Linux, run: sh install.sh
# Safe to run again later to update the app.
#
# What it does: finds adb (or downloads Google's official platform-tools into this folder), waits for the tablet, installs
# peloton-hud.apk, then runs hud-setup.sh on the tablet (permissions, stops Peloton updates, makes the HUD the home screen).
set -u
cd "$(dirname "$0")" || exit 1

fail() {
  echo
  echo "Stopped: $1"
  exit 1
}

echo 'Peloton HUD installer'
echo '====================='
[ -f peloton-hud.apk ] || fail 'peloton-hud.apk is missing. Unzip the whole download into one folder and run this from there.'

# 1. adb: a copy next to this script, else one on the PATH, else download Google's official platform-tools.
if [ -x platform-tools/adb ]; then
  ADB=./platform-tools/adb
elif command -v adb >/dev/null 2>&1; then
  ADB=adb
else
  case "$(uname -s)" in
    Darwin) OS=darwin ;;
    Linux) OS=linux ;;
    *) fail "unsupported system $(uname -s)" ;;
  esac
  command -v unzip >/dev/null 2>&1 || fail 'unzip is needed to unpack adb. Install it (e.g. sudo apt install unzip) and run this again.'
  echo
  echo "Downloading Google's Android platform-tools (adb, about 7 MB) from dl.google.com ..."
  URL="https://dl.google.com/android/repository/platform-tools-latest-$OS.zip"
  if command -v curl >/dev/null 2>&1; then curl -fsSL -o platform-tools.zip "$URL" || fail 'download failed; check the internet connection.'
  else wget -q -O platform-tools.zip "$URL" || fail 'download failed; check the internet connection.'; fi
  unzip -q -o platform-tools.zip && rm -f platform-tools.zip
  ADB=./platform-tools/adb
fi
echo "Using adb: $ADB"

# 2. Wait for the tablet (USB debugging on, cable plugged in, "Allow" tapped on the tablet).
echo
echo 'Plug the tablet into this computer with a USB cable. If the tablet asks "Allow USB debugging?", tick "Always allow" and tap Allow.'
"$ADB" start-server >/dev/null 2>&1
STATE=''
i=0
while [ $i -lt 90 ]; do
  LINES="$("$ADB" devices | sed 1d | grep -v '^[[:space:]]*$')"
  COUNT="$(printf '%s\n' "$LINES" | grep -c .)"
  [ "$COUNT" -gt 1 ] && fail 'More than one Android device is connected. Unplug the others and run this again.'
  if printf '%s\n' "$LINES" | grep -q '	device$'; then STATE=device; break; fi
  if printf '%s\n' "$LINES" | grep -q '	unauthorized$' && [ "$STATE" != unauthorized ]; then
    STATE=unauthorized
    echo 'Waiting for you to tap Allow on the tablet ...'
  fi
  sleep 2
  i=$((i + 1))
done
[ "$STATE" = device ] || fail 'No tablet found. Check that USB debugging is on (see INSTALL.md), try another cable or port, and run this again.'
echo "Found: $("$ADB" shell getprop ro.product.model | tr -d '\r')"

# 3. Install (or update) the app.
echo
echo 'Installing the HUD app ...'
OUT="$("$ADB" install -r peloton-hud.apk 2>&1)"
case "$OUT" in
  *Success*) echo 'Installed.' ;;
  *INSTALL_FAILED_UPDATE_INCOMPATIBLE*)
    fail "A different build of the HUD is already installed (signed by someone else). Uninstalling it erases its saved rides, so this installer won't do it for you. If you're sure: run  $ADB uninstall app.pelotonhud  and then run this installer again." ;;
  *) fail "The install failed: $OUT" ;;
esac

# 3b. Optional extra media apps. Put their installer files in an "apps" folder next to this installer — single .apk files, or the split
# bundles some apps ship as (.apkm / .xapk / .apks). For a split bundle this picks the parts that match THIS tablet's CPU and screen density,
# so you don't have to. Files that don't fit the tablet are skipped (not fatal); afterwards turn each app on in the HUD under Settings -> Apps.
if [ -d apps ] && ls apps/* >/dev/null 2>&1; then
  ABI="$("$ADB" shell getprop ro.product.cpu.abi | tr -d '\r')"
  ABI_U="$(printf '%s' "$ABI" | tr '-' '_')"
  DPI="$("$ADB" shell wm density | tr -d '\r' | grep -oE '[0-9]+' | tail -1)"
  [ -n "$DPI" ] || DPI=240
  echo
  echo "Installing extra apps from the 'apps' folder (this tablet: ${ABI:-unknown}, ${DPI}dpi) ..."
  for f in apps/*; do
    case "$f" in *.apk | *.apkm | *.xapk | *.apks) ;; *) continue ;; esac
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    if [ "${f##*.}" = apk ]; then
      O="$("$ADB" install -r "$f" 2>&1)"
    else
      # Split bundle: unzip, then install base + the split that matches our CPU + the nearest screen-density split + English.
      D="$(mktemp -d)"
      unzip -q -o "$f" -d "$D" 2>/dev/null
      SPLITS=""
      for b in "$D"/*.apk; do case "$(basename "$b")" in split_config.*) ;; *) [ -f "$b" ] && { SPLITS="$b"; break; } ;; esac; done
      [ -f "$D/split_config.$ABI_U.apk" ] && SPLITS="$SPLITS $D/split_config.$ABI_U.apk"
      BEST=""; BESTD=99999
      for s in "$D"/split_config.*.apk; do
        [ -f "$s" ] || continue
        k="$(basename "$s" | sed -E 's/^split_config\.//; s/\.apk$//')"
        case "$k" in ldpi) p=120 ;; mdpi) p=160 ;; tvdpi) p=213 ;; hdpi) p=240 ;; xhdpi) p=320 ;; xxhdpi) p=480 ;; xxxhdpi) p=640 ;; nodpi) p=$DPI ;; *) continue ;; esac
        diff=$((p - DPI)); [ "$diff" -lt 0 ] && diff=$((-diff))
        [ "$diff" -lt "$BESTD" ] && { BESTD=$diff; BEST="$s"; }
      done
      [ -n "$BEST" ] && SPLITS="$SPLITS $BEST"
      [ -f "$D/split_config.en.apk" ] && SPLITS="$SPLITS $D/split_config.en.apk"
      if [ -n "$SPLITS" ]; then O="$("$ADB" install-multiple -r $SPLITS 2>&1)"; else O="no installable parts found inside"; fi
      rm -rf "${D:?}"
    fi
    case "$O" in
      *Success*) echo "  installed $name" ;;
      *NO_MATCHING_ABIS*) echo "  skipped $name — built for a different CPU than this tablet (${ABI:-?})" ;;
      *) echo "  skipped $name — $(printf '%s' "$O" | tr '\n' ' ' | cut -c1-140)" ;;
    esac
  done
  echo 'Turn each app on in the HUD under Settings -> Apps.'
fi

# 4. One-time setup on the tablet (the same script `npm run bike -- setup` runs).
echo
echo 'Setting up the tablet ...'
"$ADB" push hud-setup.sh /data/local/tmp/hud-setup.sh >/dev/null || fail 'could not copy the setup script to the tablet.'
"$ADB" shell sh /data/local/tmp/hud-setup.sh || fail 'setup did not finish (see the messages above).'

echo
printf 'Reboot the tablet now so it starts in the HUD? (Y/n) '
read -r ANSWER
case "$ANSWER" in
  [Nn]*) echo 'Done. Reboot the tablet when you are ready; it will start in the HUD.' ;;
  *)
    "$ADB" reboot
    echo 'Rebooting. When it comes back it starts in the HUD. You can unplug the cable.' ;;
esac
