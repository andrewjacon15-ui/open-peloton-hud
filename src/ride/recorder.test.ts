import { describe, expect, it } from 'vitest'
import { AUTO_PAUSE_SEC, RideRecorder } from './recorder'
import type { MetricSample } from '../domain/metrics'

const pedaling: MetricSample = { power: 150, cadence: 85, resistance: 45 }
const coasting: MetricSample = { power: 0, cadence: 0, resistance: 45 }

function recorder() {
  let t = 1_762_000_000_000
  return new RideRecorder({ now: () => (t += 1000), rand: () => 0.5 })
}

describe('RideRecorder', () => {
  it('starts idle and ignores ticks until started', () => {
    const r = recorder()
    expect(r.state).toBe('idle')
    r.tick(pedaling)
    expect(r.sampleCount).toBe(0)
  })

  it('makes a sortable ride id and records while active', () => {
    const r = recorder()
    r.start()
    expect(r.state).toBe('active')
    expect(r.rideId).toMatch(/^\d{8}-\d{6}-[0-9a-f]{4}$/)
    for (let i = 0; i < 10; i++) r.tick(pedaling)
    expect(r.sampleCount).toBe(10)
    expect(r.metrics().avgPower).toBe(150)
  })

  it('auto-pauses after sustained zero cadence and resumes on pedaling', () => {
    const r = recorder()
    r.start()
    for (let i = 0; i < AUTO_PAUSE_SEC; i++) r.tick(coasting)
    expect(r.state).toBe('paused')
    const atPause = r.sampleCount
    r.tick(coasting) // ignored while paused
    expect(r.sampleCount).toBe(atPause)
    r.tick(pedaling) // resumes and records
    expect(r.state).toBe('active')
    expect(r.sampleCount).toBe(atPause + 1)
  })

  it('honors manual pause and resume', () => {
    const r = recorder()
    r.start()
    r.tick(pedaling)
    r.pause()
    r.tick(pedaling) // paused, but pedaling resumes it, so it records
    expect(r.state).toBe('active')
    expect(r.sampleCount).toBe(2)
  })

  it('finishes with an end time and a summary, then ignores further ticks', () => {
    const r = recorder()
    r.start()
    for (let i = 0; i < 5; i++) r.tick(pedaling)
    r.end()
    const s = r.summary()
    expect(s.state).toBe('done')
    expect(s.endedAt).toBeGreaterThan(s.startedAt)
    expect(s.metrics.movingSec).toBe(5)
    r.tick(pedaling)
    expect(r.sampleCount).toBe(5)
  })
})
