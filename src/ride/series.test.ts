import { describe, expect, it } from 'vitest'
import type { MetricSample } from '../domain/metrics'
import { downsampleSeries } from './series'

const mk = (powers: number[]): MetricSample[] => powers.map((power, i) => ({ power, cadence: 60 + (i % 10), resistance: 40 }))

describe('downsampleSeries', () => {
  it('passes short series through unchanged', () => {
    const s = downsampleSeries(mk([100, 110, 120]), 180)
    expect(s.power).toEqual([100, 110, 120])
    expect(s.cadence).toHaveLength(3)
  })

  it('averages into at most maxPoints buckets', () => {
    const s = downsampleSeries(mk(Array.from({ length: 1000 }, () => 200)), 180)
    expect(s.power.length).toBeLessThanOrEqual(180)
    expect(s.power.every((p) => p === 200)).toBe(true) // constant input → constant buckets
  })

  it('preserves the overall shape (rising input stays monotonic across buckets)', () => {
    const s = downsampleSeries(mk(Array.from({ length: 600 }, (_, i) => i)), 60)
    expect(s.power).toHaveLength(60)
    for (let i = 1; i < s.power.length; i++) expect(s.power[i]).toBeGreaterThan(s.power[i - 1])
  })

  it('handles an empty ride', () => {
    expect(downsampleSeries([], 180)).toEqual({ power: [], cadence: [] })
  })
})
