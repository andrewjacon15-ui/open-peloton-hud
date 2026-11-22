/**
 * Embedded rides (docs/RIDES.md): scenic routes (reuse the YouTube player) and instructional workouts (a .zwo-driven target player).
 * Pure data + parsing — no React, no bridge. Scaffolding: the workout player UI and the home-screen wiring come next.
 */

export interface ScenicRide {
  id: string
  title: string
  /** Plays through the existing YouTube embed via media.openYouTube. */
  videoId: string
  region?: string
}

export type SegmentKind = 'warmup' | 'steady' | 'interval' | 'rest' | 'cooldown'

export interface WorkoutSegment {
  kind: SegmentKind
  durationSec: number
  /** Target as a fraction of FTP (0.75 = 75% FTP). Multiply by the rider's ftpWatts for target watts. */
  targetFtpPct: number
  cadence?: number
}

export interface Workout {
  id: string
  title: string
  segments: WorkoutSegment[]
}

export const workoutDurationSec = (w: Workout): number => w.segments.reduce((s, seg) => s + seg.durationSec, 0)

/** Display names for the segment kinds, shared by the full workout stage and the compact guide overlay. */
export const KIND_LABEL: Record<SegmentKind, string> = {
  warmup: 'Warm-up',
  steady: 'Steady',
  interval: 'Interval',
  rest: 'Recovery',
  cooldown: 'Cool-down',
}

/** A workout flattened to durations and resolved watt targets (0 where no FTP is set). The native overlay walks these against the ride's
 *  elapsed seconds to show the right target band while the web is frozen behind Netflix/Kindle — the native twin of segmentAt + targetWatts. */
export interface PlanSegment {
  durationSec: number
  targetW: number
}
export function resolvePlan(workout: Workout, ftpWatts: number | undefined): PlanSegment[] {
  return workout.segments.map((s) => ({ durationSec: s.durationSec, targetW: targetWatts(s, ftpWatts) ?? 0 }))
}

/** Target watts for a segment given the rider's FTP, or null when no FTP is set (then the player shows the % / cadence cue instead). */
export function targetWatts(seg: WorkoutSegment, ftpWatts: number | undefined): number | null {
  return ftpWatts && ftpWatts > 0 ? Math.round(seg.targetFtpPct * ftpWatts) : null
}

export interface WorkoutPosition {
  /** Index of the current segment, or `segments.length` once the workout is complete. */
  index: number
  segment: WorkoutSegment | null
  next: WorkoutSegment | null
  /** Seconds elapsed within the current segment, and seconds left in it. */
  intoSegmentSec: number
  segmentRemainingSec: number
  done: boolean
}

/**
 * Where a workout is `intoSec` seconds in (driven by the ride's elapsed *active* seconds, so resting pauses the plan too). Pure and
 * unit-tested — the player is thin on top. `intoSec` past the end returns `done`.
 */
export function segmentAt(workout: Workout, intoSec: number): WorkoutPosition {
  const t = Math.max(0, Math.floor(intoSec))
  let acc = 0
  for (let i = 0; i < workout.segments.length; i++) {
    const seg = workout.segments[i]
    if (t < acc + seg.durationSec) {
      return { index: i, segment: seg, next: workout.segments[i + 1] ?? null, intoSegmentSec: t - acc, segmentRemainingSec: acc + seg.durationSec - t, done: false }
    }
    acc += seg.durationSec
  }
  return { index: workout.segments.length, segment: null, next: null, intoSegmentSec: 0, segmentRemainingSec: 0, done: true }
}

/**
 * Parse a Zwift `.zwo` workout (open XML) into a Workout. Handles the common elements — Warmup, Cooldown, SteadyState, IntervalsT, Ramp,
 * FreeRide — reading Duration, Power/PowerLow/PowerHigh (fractions of FTP) and Cadence. Unknown elements are skipped. Pure; tests belong
 * beside this file (docs/RIDES.md build step 1).
 */
export function parseZwo(xml: string, id = 'imported', title = 'Workout'): Workout {
  const segments: WorkoutSegment[] = []
  const attr = (tag: string, name: string): number | undefined => {
    const m = tag.match(new RegExp(`${name}="([0-9.]+)"`, 'i'))
    return m ? Number(m[1]) : undefined
  }
  const workoutTitle = xml.match(/<name>([^<]*)<\/name>/i)?.[1]?.trim() || title
  const body = xml.match(/<workout>([\s\S]*?)<\/workout>/i)?.[1] ?? xml
  const tagRe = /<(Warmup|Cooldown|SteadyState|IntervalsT|FreeRide|Ramp)\b[^>]*\/?>/gi
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(body))) {
    const tag = m[0]
    const el = m[1].toLowerCase()
    const cadence = attr(tag, 'Cadence')
    if (el === 'intervalst') {
      const repeat = attr(tag, 'Repeat') ?? 1
      for (let i = 0; i < repeat; i++) {
        segments.push({ kind: 'interval', durationSec: attr(tag, 'OnDuration') ?? 0, targetFtpPct: attr(tag, 'OnPower') ?? 0, cadence })
        segments.push({ kind: 'rest', durationSec: attr(tag, 'OffDuration') ?? 0, targetFtpPct: attr(tag, 'OffPower') ?? 0 })
      }
      continue
    }
    const kind: SegmentKind = el === 'warmup' ? 'warmup' : el === 'cooldown' ? 'cooldown' : 'steady'
    const power = attr(tag, 'Power') ?? attr(tag, 'PowerLow') ?? attr(tag, 'PowerHigh') ?? 0
    segments.push({ kind, durationSec: attr(tag, 'Duration') ?? 0, targetFtpPct: power, cadence })
  }
  return { id, title: workoutTitle, segments }
}

/**
 * Scenic routes — long-form 4K POV cycling videos that play through the YouTube embed (so stats and recording come for free). Each videoId
 * was checked to actually play in an embed on a non-YouTube origin (some owners disable embedding); if one ever goes dark, swap its id or
 * drop it. Extend freely: paste a YouTube id, a short title, and a region. Mostly Alpine for the scenery, with a US coast ride for variety.
 */
export const SCENIC_RIDES: ScenicRide[] = [
  { id: 'dolomites-toblach-cortina', title: 'Dolomites: Toblach to Cortina', videoId: 'nKbiq_xsWDs', region: 'Dolomites, Italy' },
  { id: 'southtyrol-brixen-kiens', title: 'Brixen to Kiens (GoPro POV)', videoId: 'WhkSN97UvnA', region: 'South Tyrol, Italy' },
  { id: 'austria-achensee', title: 'Lake Achensee Loop', videoId: 'Pzx9hk1UT1Y', region: 'Tyrol, Austria' },
  { id: 'alps-zugspitze-valley', title: 'Zugspitze Mountain Valley', videoId: 'fXaFHAGK6cA', region: 'Bavarian Alps' },
  { id: 'bavaria-five-lakes', title: "Bavaria's Five Lakes Loop", videoId: 'mJM_7U2h_Fk', region: 'Bavaria, Germany' },
  { id: 'scotland-isle-of-skye', title: 'Isle of Skye', videoId: 'Fd8DWf9j8qM', region: 'Scotland' },
  { id: 'california-coleman-valley', title: 'Coleman Valley Road', videoId: 'USUJa3N3TOM', region: 'California, USA' },
]

/**
 * Starter workouts spanning the training spectrum, each built to standard coaching structure (zones as % of FTP): a recovery spin, a Z2
 * endurance base, a sweet-spot session (the best bang-for-buck for a time-limited rider), a VO2-max interval set, and a real FTP test.
 * Targets are fractions of FTP; with no FTP set the player shows the % and cadence cue instead of watts. Rough zone guide used here:
 * recovery <0.55, endurance/Z2 0.56–0.75, tempo 0.76–0.87, sweet spot 0.88–0.94, threshold 0.95–1.05, VO2 max 1.06–1.20. Extend freely,
 * or import a `.zwo` with parseZwo (docs/RIDES.md). The card shows each workout's total time, so titles describe the session, not minutes.
 */
export const WORKOUTS: Workout[] = [
  {
    // Easy Zone-1 spin: low force, high cadence — for an active-recovery day, never a workout in itself.
    id: 'recovery-20',
    title: 'Recovery spin',
    segments: [
      { kind: 'warmup', durationSec: 180, targetFtpPct: 0.45 },
      { kind: 'steady', durationSec: 840, targetFtpPct: 0.52, cadence: 90 },
      { kind: 'cooldown', durationSec: 180, targetFtpPct: 0.4 },
    ],
  },
  {
    // The aerobic base ride: a long steady Zone-2 block with a mid upper-Z2 push. The kind of ride that should be most of your training.
    id: 'endurance-45',
    title: 'Endurance (Z2)',
    segments: [
      { kind: 'warmup', durationSec: 300, targetFtpPct: 0.55 },
      { kind: 'steady', durationSec: 1200, targetFtpPct: 0.65 },
      { kind: 'steady', durationSec: 600, targetFtpPct: 0.72, cadence: 85 },
      { kind: 'steady', durationSec: 300, targetFtpPct: 0.65 },
      { kind: 'cooldown', durationSec: 300, targetFtpPct: 0.5 },
    ],
  },
  {
    // Sweet spot: 2×12 min at ~90% FTP with easy recovery between — the most time-efficient way to raise threshold.
    id: 'sweet-spot-2x12',
    title: 'Sweet Spot 2×12',
    segments: [
      { kind: 'warmup', durationSec: 480, targetFtpPct: 0.6 },
      { kind: 'steady', durationSec: 720, targetFtpPct: 0.9, cadence: 90 },
      { kind: 'rest', durationSec: 300, targetFtpPct: 0.55 },
      { kind: 'steady', durationSec: 720, targetFtpPct: 0.9, cadence: 90 },
      { kind: 'cooldown', durationSec: 240, targetFtpPct: 0.5 },
    ],
  },
  {
    // VO2 max: 5×3 min at ~110% FTP with equal recovery, after a short opener to prime the legs. One of the hardest, most potent sessions —
    // standard prescription is 3–5 min at 106–120% FTP, repeated 4–6 times, once or twice a week.
    id: 'vo2-5x3',
    title: 'VO2 Max 5×3',
    segments: [
      { kind: 'warmup', durationSec: 300, targetFtpPct: 0.55 },
      { kind: 'interval', durationSec: 30, targetFtpPct: 1.0, cadence: 100 }, // opener
      { kind: 'rest', durationSec: 90, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 180, targetFtpPct: 1.1, cadence: 95 },
      { kind: 'rest', durationSec: 180, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 180, targetFtpPct: 1.1, cadence: 95 },
      { kind: 'rest', durationSec: 180, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 180, targetFtpPct: 1.1, cadence: 95 },
      { kind: 'rest', durationSec: 180, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 180, targetFtpPct: 1.1, cadence: 95 },
      { kind: 'rest', durationSec: 180, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 180, targetFtpPct: 1.1, cadence: 95 },
      { kind: 'cooldown', durationSec: 240, targetFtpPct: 0.45 },
    ],
  },
  {
    // A real 20-minute FTP test, not a hold at a preset %: thorough warm-up, a 5-min blow-out to clear the top end, a short recovery, then a
    // maximal, evenly paced 20-minute effort — ride it as hard as you can sustain for the full 20. Your FTP ≈ 0.95 × your average power over
    // that block; put the number in Settings afterwards. The 100% target band here is only a pacing guide (sit at or just above it); it is
    // not a cap, and if you have no FTP set yet, judge the 20-min effort by feel.
    id: 'ftp-test-20',
    title: 'FTP Test (20-min)',
    segments: [
      { kind: 'warmup', durationSec: 600, targetFtpPct: 0.55 },
      { kind: 'steady', durationSec: 180, targetFtpPct: 0.8, cadence: 95 },
      { kind: 'interval', durationSec: 300, targetFtpPct: 1.05 }, // 5-min blow-out
      { kind: 'rest', durationSec: 300, targetFtpPct: 0.5 },
      { kind: 'interval', durationSec: 1200, targetFtpPct: 1.0, cadence: 90 }, // the 20-min maximal effort
      { kind: 'cooldown', durationSec: 300, targetFtpPct: 0.45 },
    ],
  },
]
