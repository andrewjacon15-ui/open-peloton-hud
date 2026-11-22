import { describe, expect, it } from 'vitest'
import { speedMsFromPower, summarize, zoneOf, type MetricSample } from './metrics'

const ride = (n: number, s: MetricSample): MetricSample[] => Array.from({ length: n }, () => ({ ...s }))

describe('zoneOf', () => {
  it('maps power to Coggan zones around FTP', () => {
    const ftp = 200
    expect(zoneOf(100, ftp)).toBe(1) // 50%
    expect(zoneOf(140, ftp)).toBe(2) // 70%
    expect(zoneOf(180, ftp)).toBe(3) // 90%
    expect(zoneOf(200, ftp)).toBe(4) // 100%
    expect(zoneOf(230, ftp)).toBe(5) // 115%
    expect(zoneOf(280, ftp)).toBe(6) // 140%
    expect(zoneOf(400, ftp)).toBe(7) // 200%
  })
})

describe('speedMsFromPower', () => {
  it('is zero at zero power and rises with power', () => {
    expect(speedMsFromPower(0, 84)).toBe(0)
    expect(speedMsFromPower(200, 84)).toBeGreaterThan(speedMsFromPower(100, 84))
  })
  it('gives a believable ~24 km/h at 100 W', () => {
    const kmh = speedMsFromPower(100, 84) * 3.6
    expect(kmh).toBeGreaterThan(20)
    expect(kmh).toBeLessThan(28)
  })
})

describe('summarize', () => {
  it('is all zeros for no samples', () => {
    const m = summarize([])
    expect(m.outputKj).toBe(0)
    expect(m.calories).toBe(0)
    expect(m.timeInZonesSec).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('computes output and weight-based calories from steady power', () => {
    // 100 W for 600 s = 60,000 J = 60 kJ. active kcal ≈ 60 / 0.24 / 4.184 ≈ 59.8; resting kcal = 1 · 75 kg · (600/3600 h) = 12.5; ≈ 72.
    const m = summarize(ride(600, { power: 100, cadence: 80, resistance: 40 }), { weightKg: 75 })
    expect(m.outputKj).toBe(60)
    expect(m.calories).toBe(72)
    expect(m.elapsedSec).toBe(600)
    expect(m.movingSec).toBe(600)
    expect(m.avgPower).toBe(100)
    expect(m.maxPower).toBe(100)
    expect(m.avgCadence).toBe(80)
    expect(m.distanceKm).toBeGreaterThan(0)
  })

  it('burns more calories for a heavier rider over the same ride', () => {
    const r = ride(1800, { power: 150, cadence: 85, resistance: 45 })
    const light = summarize(r, { weightKg: 60 }).calories
    const heavy = summarize(r, { weightKg: 90 }).calories
    // Same mechanical work, but the heavier rider's resting burn is larger: 1 · 30 kg · 0.5 h = 15 extra kcal.
    expect(heavy).toBe(light + 15)
  })

  it('counts coasting as elapsed but not moving, and lowers the average', () => {
    const samples = [...ride(100, { power: 150, cadence: 85, resistance: 45 }), ...ride(100, { power: 0, cadence: 0, resistance: 45 })]
    const m = summarize(samples)
    expect(m.elapsedSec).toBe(200)
    expect(m.movingSec).toBe(100)
    expect(m.avgPower).toBe(75) // 150 half the time
    expect(m.maxPower).toBe(150)
  })

  it('fills zones, intensity factor and TSS when given an FTP', () => {
    const m = summarize(ride(3600, { power: 200, cadence: 90, resistance: 50 }), { ftpWatts: 200 })
    // An hour at FTP: IF ≈ 1.0, TSS ≈ 100, all time in zone 4.
    expect(m.intensityFactor).toBeCloseTo(1, 1)
    expect(m.tss).toBeGreaterThan(95)
    expect(m.tss).toBeLessThan(105)
    expect(m.zone).toBe(4)
    expect(m.timeInZonesSec[3]).toBe(3600)
  })

  it('leaves FTP-only metrics null without an FTP', () => {
    const m = summarize(ride(60, { power: 200, cadence: 90, resistance: 50 }))
    expect(m.zone).toBeNull()
    expect(m.intensityFactor).toBeNull()
    expect(m.tss).toBeNull()
  })

  it('summarizes heart rate when present', () => {
    const m = summarize([
      { power: 100, cadence: 80, resistance: 40, hr: 120 },
      { power: 120, cadence: 82, resistance: 42, hr: 140 },
    ])
    expect(m.avgHr).toBe(130)
    expect(m.maxHr).toBe(140)
  })
})
