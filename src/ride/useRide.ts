import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBridge, type SensorSource } from '../bridge'
import type { MediaKind } from '../media/kind'
import type { MetricSample, RideMetrics } from '../domain/metrics'
import { RideRecorder, type RideState, type RideSummary } from './recorder'
import { downsampleSeries } from './series'
import { addRide, loadRides, loadSettings, saveSettings, type RideSettings, type StoredRide } from './storage'
import { subscribeProfiles } from './profiles'

export interface RideView {
  /** The sensor the shell reported, and whether a reading has arrived. */
  sensor: SensorSource | 'unknown'
  error: string | null
  /** The latest raw reading (shown live even when not recording). */
  live: MetricSample
  state: RideState
  rideId: string
  elapsedSec: number
  metrics: RideMetrics
  /** The last finished ride, shown as a summary until a new ride starts. */
  lastSummary: RideSummary | null
  rides: StoredRide[]
  settings: RideSettings
}

const ZERO: MetricSample = { power: 0, cadence: 0, resistance: 0 }

/**
 * Drives ride recording from the bridge: keeps the latest reading, ticks the recorder once a second, and exposes live metrics, the
 * ride state and the controls. Recording and the metric math are pure (recorder.ts, metrics.ts); this hook is the React glue.
 */
export function useRide(): RideView & {
  start: () => void
  pause: () => void
  resume: () => void
  end: () => void
  setMedia: (media: { kind: MediaKind; title?: string }) => void
  updateSettings: (patch: RideSettings) => void
} {
  const bridge = useMemo(() => getBridge(), [])
  const recorder = useRef<RideRecorder>(new RideRecorder()).current
  const live = useRef<MetricSample>(ZERO)

  const [settings, setSettings] = useState<RideSettings>(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [sensor, setSensor] = useState<RideView['sensor']>('unknown')
  const [error, setError] = useState<string | null>(null)
  const [rides, setRides] = useState<StoredRide[]>(loadRides)
  const [lastSummary, setLastSummary] = useState<RideSummary | null>(null)
  const [tickState, setTickState] = useState({ state: 'idle' as RideState, rideId: '', elapsedSec: 0, liveSample: ZERO })

  useEffect(() => {
    return bridge.subscribe((m) => {
      if (m.type === 'hello') {
        setSensor(m.sensor)
      } else if (m.type === 'sample') live.current = { power: m.power, cadence: m.cadence, resistance: m.resistance, hr: m.hr }
      else if (m.type === 'samples') {
        // The shell buffered these 1 Hz samples while the ride kept recording behind the Netflix overlay (our tick was frozen). Replay
        // them into the recorder, in order, so the ride has no gap; the recorder applies auto-pause/resume exactly as if they'd ticked live.
        for (const s of m.samples) recorder.tick({ power: s.power, cadence: s.cadence, resistance: s.resistance, hr: s.hr })
        setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: recorder.metrics().elapsedSec, liveSample: live.current })
      } else if (m.type === 'rideStarted') {
        // The native overlay's Start button began a ride while an entertainment app was in front. Start the recorder the same as the web
        // start() — minus the startRide send, since this IS the shell telling us. The seconds buffered behind the app arrive next as a
        // `samples` batch and replay in, so the ride is reconstructed from its true start.
        setLastSummary(null)
        setError(null)
        recorder.start()
        setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: 0, liveSample: live.current })
      } else if (m.type === 'rideEnded') {
        // The native overlay's End button ended the ride. Any seconds recorded behind the overlay arrive as a `samples` batch just before
        // this, so the recorder already has them — finish and save, the same as the web End control, without echoing endRide back.
        recorder.end()
        const summary = recorder.summary(settingsRef.current)
        setLastSummary(summary)
        setRides(addRide({ ...summary, series: downsampleSeries(recorder.rawSamples) }))
        setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: recorder.metrics().elapsedSec, liveSample: live.current })
      } else if (m.type === 'error') setError(`${m.code}: ${m.message}`)
    })
  }, [bridge, recorder])

  // Switching the active rider profile (Settings → Profiles) swaps in that profile's own settings and ride history. It only happens off-ride
  // (the UI blocks it mid-ride), so clear the recorder and reload both from the newly-active profile's storage keys.
  useEffect(() => {
    return subscribeProfiles(() => {
      recorder.reset()
      setSettings(loadSettings())
      setRides(loadRides())
      setLastSummary(null)
      setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: 0, liveSample: live.current })
    })
  }, [recorder])

  // One tick a second: record the latest reading and publish a fresh snapshot.
  useEffect(() => {
    const id = setInterval(() => {
      recorder.tick(live.current)
      setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: recorder.metrics().elapsedSec, liveSample: live.current })
    }, 1000)
    return () => clearInterval(id)
  }, [recorder])

  // Recompute from the recorder each render (cheap: a few thousand samples at most). Zeros before a ride starts.
  const metrics = recorder.metrics(settings)

  const start = useCallback(() => {
    setLastSummary(null)
    setError(null)
    recorder.start()
    bridge.send({ type: 'startRide' })
    setTickState({ state: recorder.state, rideId: recorder.rideId, elapsedSec: 0, liveSample: live.current })
  }, [bridge, recorder])

  const pause = useCallback(() => {
    recorder.pause()
    bridge.send({ type: 'pauseRide' })
    setTickState((s) => ({ ...s, state: recorder.state }))
  }, [bridge, recorder])

  const resume = useCallback(() => {
    recorder.resume()
    bridge.send({ type: 'resumeRide' })
    setTickState((s) => ({ ...s, state: recorder.state }))
  }, [bridge, recorder])

  const end = useCallback(() => {
    recorder.end()
    bridge.send({ type: 'endRide' })
    const summary = recorder.summary(settingsRef.current)
    setLastSummary(summary)
    setRides(addRide({ ...summary, series: downsampleSeries(recorder.rawSamples) }))
    setTickState((s) => ({ ...s, state: recorder.state }))
  }, [bridge, recorder])

  // Record what was watched/read on this ride (the last non-none media), so the saved ride and history can show "YouTube: …", "Netflix",
  // "Kindle". Read into the summary at end() — see App.tsx, which calls this when media changes during a ride.
  const setMedia = useCallback((media: { kind: MediaKind; title?: string }) => {
    recorder.setMedia(media)
  }, [recorder])

  const updateSettings = useCallback((patch: RideSettings) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  return {
    sensor,
    error,
    live: tickState.liveSample,
    state: tickState.state,
    rideId: tickState.rideId,
    elapsedSec: tickState.elapsedSec,
    metrics,
    lastSummary,
    rides,
    settings,
    start,
    pause,
    resume,
    end,
    setMedia,
    updateSettings,
  }
}
