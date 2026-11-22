import type { RideOptions } from '../domain/metrics'
import type { RideSummary } from './recorder'
import type { RideSeries } from './series'

/**
 * Per-device persistence for ride settings and finished rides, in localStorage — the device is the only store (no account, no cloud). Every
 * access is guarded so a locked-down WebView never crashes the HUD.
 */

/** The pure metric options (weight, FTP) plus display preferences. `weightUnit` is how weight is entered/shown; `weightKg` stays the
 * stored value the metric math uses, so the unit can change without touching it. */
export interface RideSettings extends RideOptions {
  units?: 'imperial' | 'metric'
  weightUnit?: 'lb' | 'kg'
}

/** A finished ride as stored on the device: the summary plus a small downsampled series for the detail chart (N4). */
export interface StoredRide extends RideSummary {
  series?: RideSeries
}

const SETTINGS_KEY = 'peloton-hud:settings'
const RIDES_KEY = 'peloton-hud:rides'
const MAX_RIDES = 50

export const defaultSettings: RideSettings = { weightKg: 75, units: 'imperial', weightUnit: 'lb' }

export function loadSettings(): RideSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    // ignore: fall back to defaults
  }
  return { ...defaultSettings }
}

export function saveSettings(settings: RideSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore: a ride still works without saved settings
  }
}

export function loadRides(): StoredRide[] {
  try {
    const raw = localStorage.getItem(RIDES_KEY)
    if (raw) return JSON.parse(raw) as StoredRide[]
  } catch {
    // ignore
  }
  return []
}

/** Prepend a finished ride and keep the most recent MAX_RIDES. Returns the new list. */
export function addRide(ride: StoredRide): StoredRide[] {
  const rides = [ride, ...loadRides().filter((r) => r.rideId !== ride.rideId)].slice(0, MAX_RIDES)
  try {
    localStorage.setItem(RIDES_KEY, JSON.stringify(rides))
  } catch {
    // ignore: the summary is still shown this session
  }
  return rides
}
