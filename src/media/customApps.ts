import { useEffect, useState } from 'react'
import type { MediaApp } from './apps'

/**
 * User-added apps: any app installed on the bike that the rider put on the home screen themselves, beyond the built-in catalog (src/media/apps.ts).
 * This is what makes the HUD extensible to any sideloaded APK. We keep only package + name + icon (the shell's rasterized launcher icon, a PNG
 * data URL); everything else a tile needs — a brand colour, a letter mark — is derived. Stored in localStorage, per device (not per profile:
 * which apps are installed is a property of the bike, like the catalog's installed set). Reads/writes are guarded so a locked-down WebView
 * never crashes the HUD.
 */
export interface CustomApp {
  pkg: string
  name: string
  /** The app's launcher icon as a PNG data URL (from the shell). Absent → the tile shows a derived letter mark instead. */
  icon?: string
}

const KEY = 'peloton-hud:custom-apps'
const listeners = new Set<() => void>()

export function loadCustomApps(): CustomApp[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const list = JSON.parse(raw) as CustomApp[]
      if (Array.isArray(list)) return list.filter((a) => a && typeof a.pkg === 'string' && typeof a.name === 'string')
    }
  } catch {
    // ignore
  }
  return []
}

function save(list: CustomApp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

/** Add an app (no-op if its package is already added). */
export function addCustomApp(app: CustomApp): void {
  const list = loadCustomApps()
  if (list.some((a) => a.pkg === app.pkg)) return
  save([...list, { pkg: app.pkg, name: app.name, icon: app.icon }])
}

/** Remove an added app by package. */
export function removeCustomApp(pkg: string): void {
  save(loadCustomApps().filter((a) => a.pkg !== pkg))
}

/** Subscribe to add/remove so Home and Settings re-render together (like the profiles store). Returns an unsubscribe. */
export function subscribeCustomApps(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** A stable brand colour for a custom app, hashed from its package, so each added tile reads as a distinct launcher even without a logo. */
export function brandForPkg(pkg: string): string {
  let h = 0
  for (let i = 0; i < pkg.length; i++) h = (h * 31 + pkg.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360} 52% 46%)`
}

/** A short mark from the app name, for the fallback tile when there's no icon: the initials of the first two words, else the first two letters. */
export function markForName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (name.trim().slice(0, 2) || '?').toUpperCase()
}

/** The added apps (reactive): re-renders the component whenever one is added or removed. */
export function useCustomApps(): CustomApp[] {
  const [list, setList] = useState(loadCustomApps)
  useEffect(() => subscribeCustomApps(() => setList(loadCustomApps())), [])
  return list
}

/** The added apps as `MediaApp` tiles, so they flow through the same home grid, enabled-set and launch path as the catalog. The device icon
 *  becomes the tile logo (a data URL works as an <img> src); id is namespaced so it never collides with a catalog id. */
export function customMediaApps(list: CustomApp[] = loadCustomApps()): MediaApp[] {
  return list.map((a) => ({
    id: `custom:${a.pkg}`,
    name: a.name,
    pkg: a.pkg,
    kind: 'video' as const,
    brand: brandForPkg(a.pkg),
    mark: markForName(a.name),
    logo: a.icon,
  }))
}
