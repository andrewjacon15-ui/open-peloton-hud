/**
 * The media apps the HUD can launch. Each is a native app the shell opens full screen with the stats overlay drawn on top (the overlay is
 * our own window, so it rides over any app). The shell reports which of these packages are actually installed (queryApps → apps), and the
 * rider enables/disables each in Settings; the home screen shows a button for every app that is installed *and* enabled. Only Netflix and
 * YouTube ship on the bike — the rest are sideloaded by the owner. Pure data + the enable/disable store; no React, no bridge.
 *
 * The in-WebView YouTube player (src/media/useMedia.ts openYouTube) is a separate thing: it exists for guided rides (a power gauge over a
 * scenic video), not general watching. For just watching YouTube, this catalog's native YouTube app is the better surface.
 */
export interface MediaApp {
  /** Stable id used for the enable/disable store and icons. */
  id: string
  name: string
  /** Android package name the shell launches and checks for. */
  pkg: string
  kind: 'video' | 'reading'
  /** The service's brand accent colour, so each launch tile looks distinct and on-brand (we use the colour + a plain mark, not the logo). */
  brand: string
  /** A short original mark for the tile (1–2 chars); defaults to the name's initial. */
  mark: string
  /**
   * This app has an in-HUD web player to fall back to when the native app isn't installed (YouTube). The original Peloton Bike has no
   * Google Play Services, so there is no native YouTube app to sign into — the web player is the only way to watch there. So a web-player
   * app always shows on the home screen; its button launches the native app where one exists (e.g. a Bike+ with a sideloaded YouTube), and
   * otherwise opens the in-HUD player. The web player is also what guided rides draw the power gauge over.
   */
  webPlayer?: boolean
}

export const MEDIA_APPS: MediaApp[] = [
  // YouTube: the in-HUD web player always works (webPlayer); if a native YouTube is installed its button launches that instead. On a bike with
  // no Google Play Services, the official YouTube app can't sign in — SmartTube (below) is the native, Google-services-free alternative.
  { id: 'youtube', name: 'YouTube', pkg: 'com.google.android.youtube', kind: 'video', webPlayer: true, brand: '#FF3D34', mark: 'YT' },
  // SmartTube Beta's package (the actively-maintained build; stable SmartTube is com.teamsmart.videomanager.tv).
  { id: 'smarttube', name: 'SmartTube', pkg: 'org.smarttube.beta', kind: 'video', brand: '#FF8A3D', mark: 'ST' },
  { id: 'netflix', name: 'Netflix', pkg: 'com.netflix.mediaclient', kind: 'video', brand: '#B81D24', mark: 'N' },
  { id: 'prime', name: 'Prime Video', pkg: 'com.amazon.avod.thirdpartyclient', kind: 'video', brand: '#1FA2E8', mark: 'PV' },
  { id: 'disney', name: 'Disney+', pkg: 'com.disney.disneyplus', kind: 'video', brand: '#2B6CF6', mark: 'D+' },
  { id: 'max', name: 'Max', pkg: 'com.wbd.stream', kind: 'video', brand: '#8A5CFF', mark: 'M' },
  { id: 'hulu', name: 'Hulu', pkg: 'com.hulu.plus', kind: 'video', brand: '#1CE783', mark: 'H' },
  { id: 'kindle', name: 'Kindle', pkg: 'com.amazon.kindle', kind: 'reading', brand: '#2BB3C0', mark: 'K' },
]

export const appByPkg = (pkg: string): MediaApp | undefined => MEDIA_APPS.find((a) => a.pkg === pkg)

/** Whether an app can be used right now: a native app that's installed, or any app with an in-HUD web player (always usable). */
export const isAppAvailable = (app: MediaApp, installed: Set<string>): boolean => app.webPlayer === true || installed.has(app.pkg)

// We persist the *disabled* ids (an opt-out set), so a freshly installed app — or a new catalog entry after an update — defaults to
// enabled with no migration. Reads/writes are guarded so a locked-down WebView never crashes the HUD.
const DISABLED_KEY = 'peloton-hud:apps-disabled'

export function loadDisabledApps(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore
  }
  return new Set()
}

export function saveDisabledApps(ids: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export function setAppEnabled(id: string, enabled: boolean): Set<string> {
  const disabled = loadDisabledApps()
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  saveDisabledApps(disabled)
  return disabled
}

/** The catalog apps that are available (installed, or a web-player app) and enabled (per the store), in catalog order — the home buttons. */
export function enabledApps(installed: Set<string>, disabled: Set<string> = loadDisabledApps()): MediaApp[] {
  return MEDIA_APPS.filter((a) => isAppAvailable(a, installed) && !disabled.has(a.id))
}
