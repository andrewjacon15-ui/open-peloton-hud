import { summarize, type MetricSample, type RideMetrics, type RideOptions } from '../domain/metrics'
import type { MediaKind } from '../media/kind'

/**
 * Records a ride from the 1 Hz sample stream: owns the state machine, keeps one sample per active second, and auto-pauses when you
 * stop pedaling. Pure (no React, no timers of its own) — the caller ticks it once a second. Unit-tested in recorder.test.ts.
 *
 * Phase 1 keeps recording in the web app, which is always in front today. When the Netflix overlay lands (docs/SOFTWARE-PLAN.md step 6)
 * this logic moves into the native foreground service so a ride keeps recording behind Netflix; the metrics stay here.
 */
export type RideState = 'idle' | 'active' | 'paused' | 'done'

/** Pause recording after this many seconds at zero cadence; resume on the next pedal stroke. */
export const AUTO_PAUSE_SEC = 12

export interface RideSummary {
  rideId: string
  state: RideState
  startedAt: number
  endedAt: number | null
  media: { kind: MediaKind; title?: string }
  metrics: RideMetrics
}

function makeRideId(now: number, rand: () => number): string {
  const d = new Date(now)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const suffix = Math.floor(rand() * 0x10000).toString(16).padStart(4, '0')
  return `${stamp}-${suffix}`
}

export class RideRecorder {
  state: RideState = 'idle'
  rideId = ''
  startedAt = 0
  endedAt: number | null = null
  media: { kind: MediaKind; title?: string } = { kind: 'none' }

  private samples: MetricSample[] = []
  private zeroCadenceSec = 0
  private readonly now: () => number
  private readonly rand: () => number

  constructor(opts: { now?: () => number; rand?: () => number } = {}) {
    this.now = opts.now ?? Date.now
    this.rand = opts.rand ?? Math.random
  }

  start(): void {
    this.rideId = makeRideId(this.now(), this.rand)
    this.startedAt = this.now()
    this.endedAt = null
    this.samples = []
    this.zeroCadenceSec = 0
    this.media = { kind: 'none' }
    this.state = 'active'
  }

  pause(): void {
    if (this.state === 'active') this.state = 'paused'
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'active'
      this.zeroCadenceSec = 0
    }
  }

  end(): void {
    if (this.state === 'active' || this.state === 'paused') {
      this.state = 'done'
      this.endedAt = this.now()
    }
  }

  setMedia(media: { kind: MediaKind; title?: string }): void {
    this.media = media
  }

  /** Clear the recorder back to a fresh idle state (no ride, no samples). Used when switching rider profile, which only happens off-ride. */
  reset(): void {
    this.state = 'idle'
    this.rideId = ''
    this.startedAt = 0
    this.endedAt = null
    this.samples = []
    this.zeroCadenceSec = 0
    this.media = { kind: 'none' }
  }

  /** Call once a second with the latest reading. Records it while active and handles auto-pause/resume. */
  tick(sample: MetricSample): void {
    if (this.state === 'paused') {
      if (sample.cadence > 0) this.resume()
      else return
    }
    if (this.state !== 'active') return
    this.samples.push(sample)
    if (sample.cadence > 0) {
      this.zeroCadenceSec = 0
    } else if (++this.zeroCadenceSec >= AUTO_PAUSE_SEC) {
      this.state = 'paused'
    }
  }

  metrics(opts?: RideOptions): RideMetrics {
    return summarize(this.samples, opts)
  }

  summary(opts?: RideOptions): RideSummary {
    return {
      rideId: this.rideId,
      state: this.state,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      media: this.media,
      metrics: this.metrics(opts),
    }
  }

  get sampleCount(): number {
    return this.samples.length
  }

  /** The recorded per-second samples (a copy), used to build the downsampled series saved with the ride for its detail chart. */
  get rawSamples(): MetricSample[] {
    return [...this.samples]
  }
}
