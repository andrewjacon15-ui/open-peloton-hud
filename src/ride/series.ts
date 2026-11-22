import type { MetricSample } from '../domain/metrics'

/**
 * A compact power/cadence series for the ride-detail chart (N4): a small downsampled series stored with each ride in localStorage, so the
 * detail view charts a ride on the device itself, with no network. Pure and unit-tested.
 */
export interface RideSeries {
  /** Averaged watts per bucket, oldest first. */
  power: number[]
  /** Averaged rpm per bucket, oldest first. */
  cadence: number[]
}

/** Average the per-second samples into at most `maxPoints` evenly spaced buckets (enough to draw a smooth line, small enough to store). */
export function downsampleSeries(samples: MetricSample[], maxPoints = 180): RideSeries {
  if (samples.length <= maxPoints) {
    return { power: samples.map((s) => s.power), cadence: samples.map((s) => s.cadence) }
  }
  const bucket = samples.length / maxPoints
  const power: number[] = []
  const cadence: number[] = []
  for (let i = 0; i < maxPoints; i++) {
    const lo = Math.floor(i * bucket)
    const hi = Math.max(lo + 1, Math.floor((i + 1) * bucket))
    let sumP = 0
    let sumC = 0
    let n = 0
    for (let j = lo; j < hi && j < samples.length; j++) {
      sumP += samples[j].power
      sumC += samples[j].cadence
      n++
    }
    power.push(n ? Math.round(sumP / n) : 0)
    cadence.push(n ? Math.round(sumC / n) : 0)
  }
  return { power, cadence }
}
