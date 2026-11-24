/**
 * Rider profiles: a simple way to keep separate bike stats (weight, FTP) and separate ride history on one bike, so more than one person —
 * or one person with different setups — can use the HUD without mixing numbers. A profile is just a name; switching the active profile
 * changes which `peloton-hud:settings:<id>` and `peloton-hud:rides:<id>` the app reads and writes (see src/ride/storage.ts).
 *
 * Profiles are intentionally small: they affect only bike stats and saved rides. They do NOT touch the media apps or their sign-ins
 * (Netflix, YouTube, …) — those live in the native apps' own accounts, not here — nor device-level prefs (enabled apps, added apps,
 * recents), which stay shared across profiles. Every read/write is guarded so a locked-down WebView never crashes the HUD.
 */

export interface Profile {
  id: string
  name: string
}

const PROFILES_KEY = 'peloton-hud:profiles'
const ACTIVE_KEY = 'peloton-hud:active-profile'
// The legacy single-profile keys, migrated into the first profile on first run so existing rides/settings carry over untouched.
const LEGACY_SETTINGS = 'peloton-hud:settings'
const LEGACY_RIDES = 'peloton-hud:rides'
export const DEFAULT_PROFILE_ID = 'default'

const listeners = new Set<() => void>()

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore: the app still works this session without a saved profile
  }
}

/** Create the default profile the first time, carrying any pre-profile settings/rides into it so nothing is lost. Cheap + idempotent: it
 *  just checks for an existing profiles list, so it runs on every access without memoizing (which also keeps it correct if storage is reset). */
function ensureInit(): void {
  const existing = read<Profile[]>(PROFILES_KEY)
  if (existing && existing.length) return
  write(PROFILES_KEY, [{ id: DEFAULT_PROFILE_ID, name: 'Rider' }])
  write(ACTIVE_KEY, DEFAULT_PROFILE_ID)
  // Move the old global settings/rides under the default profile's keys (only if present and not already migrated).
  try {
    const s = localStorage.getItem(LEGACY_SETTINGS)
    if (s && !localStorage.getItem(settingsKey(DEFAULT_PROFILE_ID))) localStorage.setItem(settingsKey(DEFAULT_PROFILE_ID), s)
    const r = localStorage.getItem(LEGACY_RIDES)
    if (r && !localStorage.getItem(ridesKey(DEFAULT_PROFILE_ID))) localStorage.setItem(ridesKey(DEFAULT_PROFILE_ID), r)
  } catch {
    // ignore: a fresh profile just starts empty
  }
}

export const settingsKey = (id: string): string => `peloton-hud:settings:${id}`
export const ridesKey = (id: string): string => `peloton-hud:rides:${id}`

export function loadProfiles(): Profile[] {
  ensureInit()
  const list = read<Profile[]>(PROFILES_KEY)
  return list && list.length ? list : [{ id: DEFAULT_PROFILE_ID, name: 'Rider' }]
}

export function activeProfileId(): string {
  ensureInit()
  // The id is stored JSON-encoded (via write()), so it must be parsed back — reading it raw would never match a profile id and would always
  // fall back to the first profile.
  const id = read<string>(ACTIVE_KEY)
  const profiles = loadProfiles()
  // Guard against a stale active id (e.g. the active profile was deleted) by falling back to the first profile.
  return id && profiles.some((p) => p.id === id) ? id : profiles[0].id
}

export function activeProfile(): Profile {
  const id = activeProfileId()
  return loadProfiles().find((p) => p.id === id) ?? { id: DEFAULT_PROFILE_ID, name: 'Rider' }
}

/** Subscribe to active-profile changes (switch/rename/add/delete). Returns an unsubscribe fn. */
export function subscribeProfiles(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const notify = () => listeners.forEach((l) => l())

export function setActiveProfile(id: string): void {
  ensureInit()
  if (!loadProfiles().some((p) => p.id === id)) return
  write(ACTIVE_KEY, id)
  notify()
}

/** Add a profile with the given name (its own empty settings/rides). Returns the new profile and makes it active. */
export function addProfile(name: string): Profile {
  ensureInit()
  const trimmed = name.trim() || 'Rider'
  const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const profiles = [...loadProfiles(), { id, name: trimmed }]
  write(PROFILES_KEY, profiles)
  write(ACTIVE_KEY, id)
  notify()
  return { id, name: trimmed }
}

export function renameProfile(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  write(PROFILES_KEY, loadProfiles().map((p) => (p.id === id ? { ...p, name: trimmed } : p)))
  notify()
}

/** Delete a profile and its stored settings/rides. The last profile can't be deleted; deleting the active one switches to another. */
export function deleteProfile(id: string): void {
  const profiles = loadProfiles()
  if (profiles.length <= 1) return
  const wasActive = activeProfileId() === id // check before removing it from the list, or activeProfileId() would already have fallen back
  const next = profiles.filter((p) => p.id !== id)
  write(PROFILES_KEY, next)
  try {
    localStorage.removeItem(settingsKey(id))
    localStorage.removeItem(ridesKey(id))
  } catch {
    // ignore
  }
  if (wasActive) write(ACTIVE_KEY, next[0].id)
  notify()
}
