/** Messages between the Android shell and the web app. Source of truth: docs/DATA-CONTRACT.md ("Shell → web bridge"). */

export type SensorSource = 'affernet' | 'sensordata' | 'ble' | 'simulated' | 'none'

/** A Bluetooth LE power meter or cadence sensor found by a scan (`id` is its Bluetooth address). */
export interface FoundSensor {
  id: string
  name: string
  kind: 'power' | 'cadence'
}
export type RideState = 'idle' | 'active' | 'paused' | 'done'

export type ShellMessage =
  // `device` is the tablet model, `android` the Android release (e.g. "11"), `abi` the primary CPU ABI (e.g. "arm64-v8a") — shown in
  // Settings so a user knows which APK variant to sideload.
  | { type: 'hello'; shellVersion: string; device: string; sensor: SensorSource; android?: string; abi?: string }
  | { type: 'sample'; t: number; power: number; cadence: number; resistance: number; hr?: number }
  | { type: 'ride'; rideId: string; state: RideState; startedAt?: number }
  | { type: 'error'; code: string; message: string }
  // The native overlay was dismissed; the web resets media to none and navigates where `nav` says: 'select' (its Back button — the media
  // picker) or 'home' (its Home button, or the HUD coming back to front any other way). Absent nav is treated as 'home'.
  | { type: 'overlayClosed'; nav?: 'home' | 'select' }
  // The native overlay's Start button began a ride while an entertainment app was in front. The web starts the recorder; any seconds already
  // buffered behind the app arrive as a `samples` batch right after, so a ride started here is reconstructed with no gap.
  | { type: 'rideStarted' }
  // The native overlay's Stop button ended the ride (the overlay mirrors the HUD bar's controls). The web ends the recorder and saves the
  // ride; a `samples` flush precedes it, and the overlayClosed that follows resets media to none.
  | { type: 'rideEnded' }
  // Current device audio volume and screen brightness, each 0..1, so the HUD's controls can reflect the real state. Sent on connect
  // and whenever the shell changes them (e.g. the Netflix overlay's own buttons).
  | { type: 'levels'; volume: number; brightness: number }
  // A batch of 1 Hz samples the shell buffered while a ride kept recording behind the Netflix overlay (the WebView's timers were frozen
  // while MainActivity was stopped). The web replays them into the recorder on return, one entry per second, so the ride has no gap.
  | { type: 'samples'; samples: { power: number; cadence: number; resistance: number; hr?: number }[] }
  // Settings → Sensor: the live-data source in use ('internal' = the bike's own sensor, else a Bluetooth address), whether a scan is
  // running, what it has found so far, and any problem (Bluetooth off, Location off, permission refused). Sent on connect and on changes.
  | { type: 'sensors'; current: string; currentName: string; scanning: boolean; devices: FoundSensor[]; error?: string }
  // Which of the media-app packages the web asked about (queryApps) are installed and launchable on this device. The home screen shows a
  // launch button only for apps that are installed and enabled (src/media/apps.ts). Sent in reply to queryApps.
  | { type: 'apps'; installed: string[] }
  // Every launchable app on the device (minus the HUD itself and Peloton's own launcher), each with its label and real launcher icon as a PNG
  // data URL. Answers queryInstalledApps; powers Settings → Apps "Add an app", which lets a rider put any sideloaded app on the home screen.
  | { type: 'installedApps'; apps: { pkg: string; label: string; icon?: string }[] }

export type WebCommand =
  | { type: 'startRide' }
  | { type: 'pauseRide' }
  | { type: 'resumeRide' }
  | { type: 'endRide' }
  // Launch a native media app (by Android package name) and show the native stats overlay over it. When launched mid-ride, elapsedSec/outputKj
  // seed the overlay so its TIME and OUTPUT continue the ride instead of resetting to zero (the overlay then advances them in lockstep with the
  // shell's 1 Hz sample buffer). weightKg lets the overlay compute CALORIES the same way the web does (src/domain/metrics.ts); omitted → the
  // overlay's default weight. plan is a power plan flattened to segment durations + watt targets (src/rides/rides.ts resolvePlan); when present
  // the overlay draws the guide gauge and advances its target off elapsedSec while the web is frozen. Omitted → no guide gauge. The shell knows
  // the quirks of specific packages (e.g. Netflix's membership-gated launcher), so the web only supplies the package.
  // hidesNav marks an app that renders the system navigation bar translucent so it reads as a black strip with no buttons (SmartTube); the
  // shell then draws its own opaque Back/Home pill at the bottom so the app stays navigable. Omitted/false for apps that show the bar normally.
  | { type: 'openApp'; pkg: string; elapsedSec?: number; outputKj?: number; weightKg?: number; plan?: { durationSec: number; targetW: number }[]; hidesNav?: boolean }
  // Ask which of these packages are installed and launchable; the shell answers with an `apps` message. Sent once on connect.
  | { type: 'queryApps'; pkgs: string[] }
  // Ask for every launchable app on the device (label + icon); the shell answers with an `installedApps` message. Sent when the "Add an app"
  // picker opens, so a rider can add any sideloaded app to the home screen beyond the built-in catalog.
  | { type: 'queryInstalledApps' }
  | { type: 'closeOverlay' }
  // Set device audio volume / screen brightness, each a level 0..1. The shell clamps and applies them, then echoes a `levels` message.
  | { type: 'setVolume'; level: number }
  | { type: 'setBrightness'; level: number }
  // The way out, from Settings (the same actions as the shell's native recovery screen): open Peloton's own home screen (the kiosk guard
  // stands down until the HUD is back), open Android Settings, or open Android's default-home-app picker.
  | { type: 'openPeloton' }
  | { type: 'openAndroidSettings' }
  | { type: 'chooseHomeApp' }
  // Look for Bluetooth power meters / cadence sensors (~12 s; results stream back as `sensors`), and switch the live-data source:
  // 'internal' for the bike's own sensor, or a found sensor's id. The shell remembers the choice.
  | { type: 'scanSensors' }
  | { type: 'useSensor'; id: string; name?: string }

export type Sample = Extract<ShellMessage, { type: 'sample' }>

export interface Bridge {
  /** Subscribe to everything the shell sends. Returns an unsubscribe function. */
  subscribe(listener: (message: ShellMessage) => void): () => void
  send(command: WebCommand): void
}

const SENSORS: readonly string[] = ['affernet', 'sensordata', 'ble', 'simulated', 'none']
const STATES: readonly string[] = ['idle', 'active', 'paused', 'done']
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/** Parses an untrusted message from the shell; anything malformed is dropped rather than crashing the HUD. */
export function parseShellMessage(raw: unknown): ShellMessage | null {
  let m: unknown = raw
  if (typeof raw === 'string') {
    try {
      m = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  switch (o.type) {
    case 'hello':
      return typeof o.shellVersion === 'string' &&
        typeof o.device === 'string' &&
        SENSORS.includes(o.sensor as string) &&
        (o.android === undefined || typeof o.android === 'string') &&
        (o.abi === undefined || typeof o.abi === 'string')
        ? (o as ShellMessage)
        : null
    case 'sample':
      return isNum(o.t) && isNum(o.power) && isNum(o.cadence) && isNum(o.resistance) && (o.hr === undefined || isNum(o.hr)) ? (o as ShellMessage) : null
    case 'ride':
      return typeof o.rideId === 'string' && STATES.includes(o.state as string) ? (o as ShellMessage) : null
    case 'error':
      return typeof o.code === 'string' && typeof o.message === 'string' ? (o as ShellMessage) : null
    case 'overlayClosed':
      return o.nav === undefined || o.nav === 'home' || o.nav === 'select' ? (o as ShellMessage) : null
    case 'rideStarted':
      return o as ShellMessage
    case 'rideEnded':
      return o as ShellMessage
    case 'levels':
      return isNum(o.volume) && isNum(o.brightness) ? (o as ShellMessage) : null
    case 'samples':
      return Array.isArray(o.samples) &&
        (o.samples as unknown[]).every((s) => {
          const r = s as Record<string, unknown>
          return r && typeof r === 'object' && isNum(r.power) && isNum(r.cadence) && isNum(r.resistance) && (r.hr === undefined || isNum(r.hr))
        })
        ? (o as ShellMessage)
        : null
    case 'sensors':
      return typeof o.current === 'string' &&
        typeof o.currentName === 'string' &&
        typeof o.scanning === 'boolean' &&
        (o.error === undefined || typeof o.error === 'string') &&
        Array.isArray(o.devices) &&
        (o.devices as unknown[]).every((d) => {
          const r = d as Record<string, unknown>
          return r && typeof r === 'object' && typeof r.id === 'string' && typeof r.name === 'string' && (r.kind === 'power' || r.kind === 'cadence')
        })
        ? (o as ShellMessage)
        : null
    case 'apps':
      return Array.isArray(o.installed) && (o.installed as unknown[]).every((p) => typeof p === 'string') ? (o as ShellMessage) : null
    case 'installedApps':
      return Array.isArray(o.apps) &&
        (o.apps as unknown[]).every((a) => {
          const r = a as Record<string, unknown>
          return r && typeof r === 'object' && typeof r.pkg === 'string' && typeof r.label === 'string' && (r.icon === undefined || typeof r.icon === 'string')
        })
        ? (o as ShellMessage)
        : null
    default:
      return null
  }
}
