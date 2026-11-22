import { useEffect, useState } from 'react'
import { getBridge, type ShellMessage } from '../bridge'

export type SensorsState = Extract<ShellMessage, { type: 'sensors' }>

// The shell reports the sensor state when the page connects, long before Settings opens, so keep the latest report here for whoever asks.
let latest: SensorsState | null = null
const listeners = new Set<(s: SensorsState) => void>()
let watching = false

/** Start listening for `sensors` reports. Called once at app start (App), so the first report isn't missed. */
export function watchSensors(): void {
  if (watching) return
  watching = true
  getBridge().subscribe((m) => {
    if (m.type !== 'sensors') return
    latest = m
    listeners.forEach((l) => l(m))
  })
}

/** The live-data source in use, plus any Bluetooth scan in progress and what it found (null until the shell first reports). */
export function useSensors(): SensorsState | null {
  const [state, setState] = useState(latest)
  useEffect(() => {
    watchSensors()
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}
