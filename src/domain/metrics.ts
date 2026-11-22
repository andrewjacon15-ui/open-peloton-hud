/**
 * Pure cycling math. Input is one reading per second of riding (power W, cadence rpm, resistance %); output is the ride metrics a
 * cycling app shows. No React, no storage — unit-tested in metrics.test.ts. See docs/SOFTWARE-PLAN.md step 3.
 */

export interface MetricSample {
  power: number
  cadence: number
  resistance: number
  hr?: number
}

export interface RideOptions {
  /** Rider weight in kg, for distance (mass affects speed). Defaults to 75. */
  weightKg?: number
  /** Functional threshold power in watts, for zones, intensity factor and TSS. Zones need it. */
  ftpWatts?: number
  /** Bike weight added to the rider for the speed model. Defaults to 9 kg. */
  bikeKg?: number
}

export interface RideMetrics {
  elapsedSec: number
  movingSec: number
  outputKj: number
  calories: number
  distanceKm: number
  avgPower: number
  maxPower: number
  avgCadence: number
  maxCadence: number
  avgResistance: number
  maxResistance: number
  speedKmh: number
  avgSpeedKmh: number
  normalizedPower: number
  intensityFactor: number | null
  tss: number | null
  avgHr: number | null
  maxHr: number | null
  /** Current power zone 1–7, or null without an FTP. */
  zone: number | null
  /** Seconds spent in each of the 7 power zones; all zeros without an FTP. */
  timeInZonesSec: number[]
}

// Mechanical work to calories: metabolic energy = work / efficiency, then kJ → kcal. ~24% gross efficiency is the cycling norm, and
// it makes the *active* kcal ≈ output kJ (what Peloton's calorie number roughly does).
const GROSS_EFFICIENCY = 0.24
const KJ_PER_KCAL = 4.184
// Resting metabolic burn layered on top of the active calories, so calories scale with the rider's weight (as Peloton's do). ~1 kcal per
// kg of body mass per hour is the textbook resting metabolic rate; over the elapsed ride it adds the baseline a heavier rider burns.
const RMR_KCAL_PER_KG_HOUR = 1.0

/** Total ride calories: active (from mechanical work) + a weight-scaled resting burn over the elapsed time. */
export function rideCalories(outputKj: number, elapsedSec: number, weightKg: number): number {
  const active = outputKj / GROSS_EFFICIENCY / KJ_PER_KCAL
  const resting = RMR_KCAL_PER_KG_HOUR * weightKg * (elapsedSec / 3600)
  return Math.round(active + resting)
}

// Coggan power-zone upper bounds as a fraction of FTP (zone 7 is anything above zone 6).
const ZONE_BOUNDS = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5]

/** Power zone 1–7 for a wattage given an FTP. */
export function zoneOf(power: number, ftpWatts: number): number {
  const frac = power / ftpWatts
  for (let i = 0; i < ZONE_BOUNDS.length; i++) if (frac <= ZONE_BOUNDS[i]) return i + 1
  return 7
}

/**
 * Road speed (m/s) a given power would produce on the flat, from the standard cycling power equation
 * P = ½·ρ·CdA·v³ + Crr·m·g·v, solved for v by bisection. Indoor bikes have no real speed, so this is an estimate (like Peloton's),
 * tuned to give ~24 km/h at 100 W for a typical rider.
 */
export function speedMsFromPower(watts: number, massKg: number): number {
  if (watts <= 0) return 0
  const rho = 1.225
  const cda = 0.4
  const crr = 0.005
  const g = 9.81
  const drag = 0.5 * rho * cda
  const roll = crr * massKg * g
  const power = (v: number) => drag * v * v * v + roll * v
  let lo = 0
  let hi = 30
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (power(mid) < watts) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function normalizedPower(powers: number[]): number {
  if (!powers.length) return 0
  const window = 30
  const rolling: number[] = []
  const queue: number[] = []
  let sum = 0
  for (const p of powers) {
    queue.push(p)
    sum += p
    if (queue.length > window) sum -= queue.shift() as number
    rolling.push(sum / queue.length)
  }
  const mean4 = rolling.reduce((acc, p) => acc + p ** 4, 0) / rolling.length
  return Math.round(mean4 ** 0.25)
}

const round = (n: number, dp = 0) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * Compute every metric from the seconds recorded so far. `samples` is one reading per recorded second (coasting seconds included,
 * so averages are over elapsed time). `movingSec` is seconds actually pedaling.
 */
export function summarize(samples: MetricSample[], opts: RideOptions = {}): RideMetrics {
  const weightKg = opts.weightKg ?? 75
  const mass = weightKg + (opts.bikeKg ?? 9)
  const ftp = opts.ftpWatts
  const n = samples.length

  const empty: RideMetrics = {
    elapsedSec: 0, movingSec: 0, outputKj: 0, calories: 0, distanceKm: 0,
    avgPower: 0, maxPower: 0, avgCadence: 0, maxCadence: 0, avgResistance: 0, maxResistance: 0,
    speedKmh: 0, avgSpeedKmh: 0, normalizedPower: 0, intensityFactor: null, tss: null,
    avgHr: null, maxHr: null, zone: null, timeInZonesSec: [0, 0, 0, 0, 0, 0, 0],
  }
  if (!n) return empty

  let sumPower = 0
  let maxPower = 0
  let sumCadence = 0
  let maxCadence = 0
  let sumResistance = 0
  let maxResistance = 0
  let movingSec = 0
  let distanceM = 0
  let sumHr = 0
  let hrCount = 0
  let maxHr = 0
  const timeInZonesSec = [0, 0, 0, 0, 0, 0, 0]
  const powers: number[] = []

  for (const s of samples) {
    sumPower += s.power
    if (s.power > maxPower) maxPower = s.power
    sumCadence += s.cadence
    if (s.cadence > maxCadence) maxCadence = s.cadence
    sumResistance += s.resistance
    if (s.resistance > maxResistance) maxResistance = s.resistance
    if (s.cadence > 0) movingSec++
    distanceM += speedMsFromPower(s.power, mass) // 1 second per sample
    powers.push(s.power)
    if (s.hr !== undefined) {
      sumHr += s.hr
      hrCount++
      if (s.hr > maxHr) maxHr = s.hr
    }
    if (ftp) timeInZonesSec[zoneOf(s.power, ftp) - 1]++
  }

  const outputKj = round(sumPower / 1000, 1)
  const np = normalizedPower(powers)
  const last = samples[n - 1]

  return {
    elapsedSec: n,
    movingSec,
    outputKj,
    calories: rideCalories(outputKj, n, weightKg),
    distanceKm: round(distanceM / 1000, 2),
    avgPower: round(sumPower / n),
    maxPower,
    avgCadence: round(sumCadence / n),
    maxCadence,
    avgResistance: round(sumResistance / n),
    maxResistance,
    speedKmh: round(speedMsFromPower(last.power, mass) * 3.6, 1),
    avgSpeedKmh: round((distanceM / n) * 3.6, 1),
    normalizedPower: np,
    intensityFactor: ftp ? round(np / ftp, 2) : null,
    tss: ftp ? round((n * np * (np / ftp)) / (ftp * 3600) * 100) : null,
    avgHr: hrCount ? round(sumHr / hrCount) : null,
    maxHr: hrCount ? maxHr : null,
    zone: ftp ? zoneOf(last.power, ftp) : null,
    timeInZonesSec,
  }
}
