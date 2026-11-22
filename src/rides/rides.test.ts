import { describe, expect, it } from 'vitest'
import { parseZwo, segmentAt, targetWatts, workoutDurationSec, WORKOUTS, type Workout } from './rides'

const ZWO = `<?xml version="1.0"?>
<workout_file>
  <name>Test Workout</name>
  <workout>
    <Warmup Duration="300" PowerLow="0.4" PowerHigh="0.6"/>
    <SteadyState Duration="600" Power="0.65" Cadence="90"/>
    <IntervalsT Repeat="3" OnDuration="60" OffDuration="120" OnPower="1.1" OffPower="0.5"/>
    <Cooldown Duration="180" PowerLow="0.6" PowerHigh="0.4"/>
  </workout>
</workout_file>`

describe('parseZwo', () => {
  const w = parseZwo(ZWO, 'test')

  it('reads the name and expands IntervalsT into on/off pairs', () => {
    expect(w.title).toBe('Test Workout')
    // Warmup + SteadyState + 3×(interval+rest) + Cooldown = 9 segments.
    expect(w.segments).toHaveLength(9)
    expect(w.segments.map((s) => s.kind)).toEqual(['warmup', 'steady', 'interval', 'rest', 'interval', 'rest', 'interval', 'rest', 'cooldown'])
  })

  it('reads durations, powers (PowerLow when Power is absent) and cadence', () => {
    expect(w.segments[0]).toMatchObject({ kind: 'warmup', durationSec: 300, targetFtpPct: 0.4 })
    expect(w.segments[1]).toMatchObject({ kind: 'steady', durationSec: 600, targetFtpPct: 0.65, cadence: 90 })
    expect(w.segments[2]).toMatchObject({ kind: 'interval', durationSec: 60, targetFtpPct: 1.1 })
    expect(w.segments[3]).toMatchObject({ kind: 'rest', durationSec: 120, targetFtpPct: 0.5 })
    expect(w.segments[8]).toMatchObject({ kind: 'cooldown', durationSec: 180, targetFtpPct: 0.6 })
  })

  it('totals the duration', () => {
    expect(workoutDurationSec(w)).toBe(300 + 600 + 3 * (60 + 120) + 180)
  })
})

describe('targetWatts', () => {
  it('scales the FTP fraction, or returns null without an FTP', () => {
    expect(targetWatts({ kind: 'steady', durationSec: 60, targetFtpPct: 0.75 }, 200)).toBe(150)
    expect(targetWatts({ kind: 'steady', durationSec: 60, targetFtpPct: 0.75 }, undefined)).toBeNull()
    expect(targetWatts({ kind: 'steady', durationSec: 60, targetFtpPct: 0.75 }, 0)).toBeNull()
  })
})

describe('segmentAt', () => {
  const w: Workout = {
    id: 'x',
    title: 'x',
    segments: [
      { kind: 'warmup', durationSec: 300, targetFtpPct: 0.5 },
      { kind: 'steady', durationSec: 600, targetFtpPct: 0.65 },
      { kind: 'cooldown', durationSec: 120, targetFtpPct: 0.45 },
    ],
  }

  it('locates the current segment and the time left in it', () => {
    expect(segmentAt(w, 0)).toMatchObject({ index: 0, intoSegmentSec: 0, segmentRemainingSec: 300, done: false })
    expect(segmentAt(w, 299)).toMatchObject({ index: 0, segmentRemainingSec: 1 })
    expect(segmentAt(w, 300)).toMatchObject({ index: 1, intoSegmentSec: 0, segmentRemainingSec: 600 })
    expect(segmentAt(w, 300).next?.kind).toBe('cooldown')
  })

  it('reports done past the end', () => {
    expect(segmentAt(w, 1020)).toMatchObject({ done: true, segment: null })
    expect(segmentAt(w, 5000).done).toBe(true)
  })
})

describe('WORKOUTS catalog', () => {
  it('has well-formed starter workouts', () => {
    expect(WORKOUTS.length).toBeGreaterThanOrEqual(4)
    for (const w of WORKOUTS) {
      expect(w.segments.length).toBeGreaterThan(0)
      expect(workoutDurationSec(w)).toBeGreaterThan(0)
      expect(w.segments.every((s) => s.durationSec > 0 && s.targetFtpPct > 0)).toBe(true)
    }
  })

  it('follows best-practice structure: every workout warms up and cools down', () => {
    for (const w of WORKOUTS) {
      expect(w.segments[0].kind).toBe('warmup')
      expect(w.segments[w.segments.length - 1].kind).toBe('cooldown')
      // Nothing beyond anaerobic territory, and recovery/cooldown stay genuinely easy.
      expect(w.segments.every((s) => s.targetFtpPct <= 1.2)).toBe(true)
      expect(w.segments.filter((s) => s.kind === 'cooldown').every((s) => s.targetFtpPct <= 0.55)).toBe(true)
      expect(w.segments.filter((s) => s.kind === 'rest').every((s) => s.targetFtpPct <= 0.6)).toBe(true)
    }
  })

  it('the VO2 session actually reaches VO2-max intensity for real intervals', () => {
    const vo2 = WORKOUTS.find((w) => w.id === 'vo2-5x3')!
    const hard = vo2.segments.filter((s) => s.kind === 'interval' && s.durationSec >= 180)
    expect(hard.length).toBe(5)
    expect(hard.every((s) => s.targetFtpPct >= 1.06)).toBe(true)
  })

  it('the FTP test is a maximal 20-minute effort, not a hold at a preset %', () => {
    const ftp = WORKOUTS.find((w) => w.id === 'ftp-test-20')!
    // The signature of a real test: a single sustained ~20-minute effort at threshold-or-above.
    const test = ftp.segments.find((s) => s.durationSec === 1200)
    expect(test).toBeDefined()
    expect(test!.targetFtpPct).toBeGreaterThanOrEqual(1.0)
    // And a proper warm-up ahead of it (the old version jumped almost straight into the effort).
    expect(workoutDurationSec({ ...ftp, segments: ftp.segments.slice(0, ftp.segments.findIndex((s) => s.durationSec === 1200)) })).toBeGreaterThanOrEqual(900)
  })
})
