/**
 * The media apps the HUD can launch. Each is a native app the shell opens full screen with the stats overlay drawn on top (the overlay is
 * our own window, so it rides over any app). The shell reports which of these packages are actually installed (queryApps → apps), and the
 * rider enables/disables each in Settings; the home screen shows a button for every app that is installed *and* enabled. Only Netflix and
 * YouTube ship on the bike — the rest are sideloaded by the owner. Pure data + the enable/disable store; no React, no bridge.
 *
 * The in-WebView YouTube player (src/media/useMedia.ts openYouTube) is a separate thing: it exists for guided rides (a power gauge over a
 * scenic video), not general watching. For just watching YouTube, the catalog's "YouTube" tile launches SmartTube — a native,
 * Google-services-free YouTube client — when it's installed, and otherwise opens the in-HUD player.
 */
export interface MediaApp {
  /** Stable id used for the enable/disable store and icons. */
  id: string
  name: string
  /** Android package name the shell launches and checks for. */
  pkg: string
  kind: 'video' | 'reading'
  /** The service's brand accent colour, used as a subtle tile tint/accent behind the app's own logo. */
  brand: string
  /** A short mark for the tile (1–2 chars), shown only as a fallback when the logo image is missing. */
  mark: string
  /** The app's own logo, shown on its launcher tile (public/logos/*; gitignored proprietary assets, so a fresh clone falls back to `mark`). */
  logo?: string
  /**
   * This app has an in-HUD web player to fall back to when the native app isn't installed. The original Peloton Bike has no Google Play
   * Services, so a web-player app always shows on the home screen; its button launches the native app where `pkg` is installed, and otherwise
   * opens the in-HUD player. The web player is also what guided rides draw the power gauge over.
   */
  webPlayer?: boolean
  /**
   * This app renders the system navigation bar translucent (it sets TRANSLUCENT_NAVIGATION + LAYOUT_HIDE_NAVIGATION), so on the bike the
   * Peloton nav bar is still present and on top but reads as a black strip with no buttons — leaving the app hard to navigate. When set, the
   * shell draws its own opaque Back/Home pill at the bottom over it (NetflixOverlay.showNavStrip). SmartTube (the YouTube tile) does this.
   */
  hidesNav?: boolean
}

export const MEDIA_APPS: MediaApp[] = [
  // One YouTube: the tile wears the YouTube logo but launches SmartTube (org.smarttube.beta, the Google-services-free native YouTube client)
  // when it's installed — the official YouTube app can't sign in on this bike (no Play Services). With SmartTube absent it falls back to the
  // in-HUD web player (webPlayer). The in-HUD player is still what guided rides ride over, regardless of this tile.
  { id: 'youtube', name: 'YouTube', pkg: 'org.smarttube.beta', kind: 'video', webPlayer: true, hidesNav: true, brand: '#FF3D34', mark: 'YT', logo: '/logos/youtube.png' },
  { id: 'netflix', name: 'Netflix', pkg: 'com.netflix.mediaclient', kind: 'video', brand: '#B81D24', mark: 'N', logo: '/logos/netflix.png' },
  { id: 'prime', name: 'Prime Video', pkg: 'com.amazon.avod.thirdpartyclient', kind: 'video', brand: '#1FA2E8', mark: 'PV', logo: '/logos/prime.png' },
  { id: 'disney', name: 'Disney+', pkg: 'com.disney.disneyplus', kind: 'video', brand: '#2B6CF6', mark: 'D+', logo: '/logos/disney.png' },
  { id: 'max', name: 'Max', pkg: 'com.wbd.stream', kind: 'video', brand: '#8A5CFF', mark: 'M', logo: '/logos/max.png' },
  { id: 'peacock', name: 'Peacock', pkg: 'com.peacocktv.peacockandroid', kind: 'video', brand: '#6C47FF', mark: 'P', logo: '/logos/peacock.png' },
  { id: 'hulu', name: 'Hulu', pkg: 'com.hulu.plus', kind: 'video', brand: '#1CE783', mark: 'H', logo: '/logos/hulu.jpg' },
  { id: 'kindle', name: 'Kindle', pkg: 'com.amazon.kindle', kind: 'reading', brand: '#2BB3C0', mark: 'K', logo: '/logos/kindle.png' },
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
