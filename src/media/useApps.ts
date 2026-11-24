import { useEffect, useState } from 'react'
import { getBridge } from '../bridge'
import { MEDIA_APPS } from './apps'

// The shell reports which media-app packages are installed once the page connects. Keep the latest report here (like useSensors) so Home and
// Settings both see it, and so the first report isn't missed. Null until the shell answers; an older shell that doesn't answer leaves it null
// (then no app buttons show, which is correct — we can't launch what we can't confirm is there).
let installed: Set<string> | null = null
const listeners = new Set<(s: Set<string>) => void>()
let watching = false

export interface DeviceInfo {
  device: string
  android?: string
  abi?: string
}
let deviceInfo: DeviceInfo | null = null
const deviceListeners = new Set<(d: DeviceInfo) => void>()

/** Start listening for `apps` and `hello` reports and ask the shell which catalog packages are installed. Called once at app start. */
export function watchApps(): void {
  if (watching) return
  watching = true
  const bridge = getBridge()
  bridge.subscribe((m) => {
    if (m.type === 'apps') {
      const next = new Set(m.installed)
      installed = next
      listeners.forEach((l) => l(next))
    } else if (m.type === 'hello') {
      deviceInfo = { device: m.device, android: m.android, abi: m.abi }
      deviceListeners.forEach((l) => l(deviceInfo!))
    }
  })
  bridge.send({ type: 'queryApps', pkgs: MEDIA_APPS.map((a) => a.pkg) })
}

/** The tablet's model / Android version / CPU ABI (from the shell's hello), so Settings can tell the user what APK variant to sideload. */
export function useDeviceInfo(): DeviceInfo | null {
  const [state, setState] = useState(deviceInfo)
  useEffect(() => {
    deviceListeners.add(setState)
    watchApps()
    if (deviceInfo) setState(deviceInfo)
    return () => {
      deviceListeners.delete(setState)
    }
  }, [])
  return state
}

// Every launchable app on the device (label + icon), for Settings → Apps "Add an app". Fetched on demand (when the picker opens) rather than
// on connect, since rasterizing every icon is heavier than the catalog's installed-set check and isn't needed until the rider adds an app.
export interface InstalledApp {
  pkg: string
  label: string
  icon?: string
}
let allInstalled: InstalledApp[] | null = null
const allListeners = new Set<(a: InstalledApp[]) => void>()
let watchingAll = false

/** Ask the shell for every launchable app (answered with `installedApps`), wiring the listener once. Called when the picker opens. */
export function requestInstalledApps(): void {
  const bridge = getBridge()
  if (!watchingAll) {
    watchingAll = true
    bridge.subscribe((m) => {
      if (m.type === 'installedApps') {
        allInstalled = m.apps
        allListeners.forEach((l) => l(m.apps))
      }
    })
  }
  bridge.send({ type: 'queryInstalledApps' })
}

/** Every launchable app on the device (null until the shell answers; an older shell that doesn't answer leaves it null → the picker says so). */
export function useAllInstalledApps(): InstalledApp[] | null {
  const [state, setState] = useState(allInstalled)
  useEffect(() => {
    allListeners.add(setState)
    requestInstalledApps()
    if (allInstalled) setState(allInstalled)
    return () => {
      allListeners.delete(setState)
    }
  }, [])
  return state
}

/** The set of installed media-app packages the shell reported (null until it first answers). */
export function useInstalledApps(): Set<string> | null {
  const [state, setState] = useState(installed)
  useEffect(() => {
    // Register before asking, so the reply (which the simulated bridge answers synchronously) isn't missed; and pick up a report that
    // already arrived for an earlier-mounted component (setState with the same Set reference is a no-op).
    listeners.add(setState)
    watchApps()
    if (installed) setState(installed)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}
