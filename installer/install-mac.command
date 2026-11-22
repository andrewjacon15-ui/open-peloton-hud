#!/bin/sh
# Peloton HUD installer for macOS: double-click me (the first time, right-click > Open, since it was downloaded). Runs install.sh.
cd "$(dirname "$0")" || exit 1
sh ./install.sh
echo
printf 'Press Return to close this window.'
read -r _
