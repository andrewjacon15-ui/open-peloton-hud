# Peloton HUD installer for Windows. Double-click install-windows.bat (it runs this). Safe to run again later to update the app.
#
# What it does: finds adb (or downloads Google's official platform-tools into this folder), waits for the tablet, installs
# peloton-hud.apk, then runs hud-setup.sh on the tablet (permissions, stops Peloton updates, makes the HUD the home screen).
# 'Continue', not 'Stop': adb writes some normal output and its failures to stderr, which Windows PowerShell 5.1 would otherwise turn into a
# terminating error. Failures are checked from adb's output and exit codes instead.
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Say($msg) { Write-Host $msg }
function Fail($msg) {
  Write-Host ''
  Write-Host "Stopped: $msg" -ForegroundColor Red
  exit 1
}

Say 'Peloton HUD installer'
Say '====================='
$apk = Join-Path $here 'peloton-hud.apk'
if (-not (Test-Path $apk)) { Fail 'peloton-hud.apk is missing. Unzip the whole download into one folder and run this from there.' }

# 1. adb: a copy next to this script, else one on the PATH, else download Google's official platform-tools.
$adb = Join-Path $here 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
  $onPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($onPath) {
    $adb = $onPath.Source
  } else {
    Say ''
    Say "Downloading Google's Android platform-tools (adb, about 7 MB) from dl.google.com ..."
    $zip = Join-Path $here 'platform-tools.zip'
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $zip -ErrorAction Stop
      Expand-Archive -Path $zip -DestinationPath $here -Force -ErrorAction Stop
      Remove-Item $zip -Force
    } catch {
      Fail "Could not download platform-tools ($($_.Exception.Message)). Check the internet connection and try again."
    }
    $adb = Join-Path $here 'platform-tools\adb.exe'
  }
}
Say "Using adb: $adb"

# 2. Wait for the tablet (USB debugging on, cable plugged in, "Allow" tapped on the tablet).
Say ''
Say 'Plug the tablet into this computer with a USB cable. If the tablet asks "Allow USB debugging?", tick "Always allow" and tap Allow.'
& $adb start-server | Out-Null
$deadline = (Get-Date).AddMinutes(3)
$state = ''
while ((Get-Date) -lt $deadline) {
  $lines = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  if (@($lines).Count -gt 1) { Fail 'More than one Android device is connected. Unplug the others and run this again.' }
  if ($lines -match "`tdevice$") { $state = 'device'; break }
  if ($lines -match "`tunauthorized$" -and $state -ne 'unauthorized') { $state = 'unauthorized'; Say 'Waiting for you to tap Allow on the tablet ...' }
  Start-Sleep -Seconds 2
}
if ($state -ne 'device') { Fail 'No tablet found. Check that USB debugging is on (see INSTALL.md), try another cable or port, and run this again.' }
$model = (& $adb shell getprop ro.product.model).Trim()
Say "Found: $model"

# 3. Install (or update) the app.
Say ''
Say 'Installing the HUD app ...'
$out = (& $adb install -r $apk 2>&1) | Out-String
if ($out -notmatch 'Success') {
  if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') {
    Fail ("A different build of the HUD is already installed (signed by someone else). Uninstalling it erases its saved rides, so this " +
      "installer won't do it for you. If you're sure: run  `"$adb`" uninstall app.pelotonhud  and then run this installer again.")
  }
  Fail "The install failed: $out"
}
Say 'Installed.'

# 3b. Optional extra media apps. Put their installer files in an "apps" folder next to this installer — single .apk files, or the split
# bundles some apps ship as (.apkm / .xapk / .apks). For a split bundle this picks the parts that match THIS tablet's CPU and screen density,
# so you don't have to. Files that don't fit the tablet are skipped (not fatal); afterwards turn each app on in the HUD under Settings -> Apps.
$appsDir = Join-Path $here 'apps'
if (Test-Path $appsDir) {
  $files = @(Get-ChildItem -Path $appsDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.apk', '.apkm', '.xapk', '.apks' })
  if ($files.Count -gt 0) {
    $abi = (& $adb shell getprop ro.product.cpu.abi).Trim()
    $abiU = $abi -replace '-', '_'
    $dpi = 240; $dpiRaw = (& $adb shell wm density) -join ' '; if ($dpiRaw -match '(\d+)') { $dpi = [int]$Matches[1] }
    $densityDpi = @{ ldpi = 120; mdpi = 160; tvdpi = 213; hdpi = 240; xhdpi = 320; xxhdpi = 480; xxxhdpi = 640 }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Say ''
    Say "Installing extra apps from the 'apps' folder (this tablet: $abi, ${dpi}dpi) ..."
    foreach ($file in $files) {
      $name = $file.Name
      if ($file.Extension -eq '.apk') {
        $o = (& $adb install -r $file.FullName 2>&1) | Out-String
      } else {
        # Split bundle: unzip, then install base + the split that matches our CPU + the nearest screen-density split + English.
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $tmp | Out-Null
        try {
          [IO.Compression.ZipFile]::ExtractToDirectory($file.FullName, $tmp)
          $apks = @(Get-ChildItem -Path $tmp -Filter *.apk -File)
          $splits = @()
          $base = $apks | Where-Object { $_.Name -notlike 'split_config.*' } | Select-Object -First 1
          if ($base) { $splits += $base.FullName }
          $arch = $apks | Where-Object { $_.Name -eq "split_config.$abiU.apk" } | Select-Object -First 1
          if ($arch) { $splits += $arch.FullName }
          $best = $null; $bestd = 99999
          foreach ($s in ($apks | Where-Object { $_.Name -match '^split_config\.(ldpi|mdpi|tvdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|nodpi)\.apk$' })) {
            $k = ($s.Name -replace '^split_config\.', '') -replace '\.apk$', ''
            $p = if ($k -eq 'nodpi') { $dpi } else { $densityDpi[$k] }
            $d = [math]::Abs($p - $dpi)
            if ($d -lt $bestd) { $bestd = $d; $best = $s.FullName }
          }
          if ($best) { $splits += $best }
          $en = $apks | Where-Object { $_.Name -eq 'split_config.en.apk' } | Select-Object -First 1
          if ($en) { $splits += $en.FullName }
          if ($splits.Count -gt 0) { $o = (& $adb install-multiple -r @splits 2>&1) | Out-String } else { $o = 'no installable parts found inside' }
        } catch {
          $o = "could not read the bundle ($($_.Exception.Message))"
        }
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
      }
      if ($o -match 'Success') { Say "  installed $name" }
      elseif ($o -match 'NO_MATCHING_ABIS') { Say "  skipped $name - built for a different CPU than this tablet ($abi)" }
      else { Say "  skipped $name - $(($o -replace '\s+', ' ').Trim())" }
    }
    Say 'Turn each app on in the HUD under Settings -> Apps.'
  }
}

# 4. One-time setup on the tablet (the same script `npm run bike -- setup` runs).
Say ''
Say 'Setting up the tablet ...'
& $adb push (Join-Path $here 'hud-setup.sh') /data/local/tmp/hud-setup.sh | Out-Null
& $adb shell sh /data/local/tmp/hud-setup.sh
if ($LASTEXITCODE -ne 0) { Fail 'Setup did not finish (see the messages above).' }

Say ''
$answer = Read-Host 'Reboot the tablet now so it starts in the HUD? (Y/n)'
if ($answer -notmatch '^[Nn]') {
  & $adb reboot
  Say 'Rebooting. When it comes back it starts in the HUD. You can unplug the cable.'
} else {
  Say 'Done. Reboot the tablet when you are ready; it will start in the HUD.'
}
