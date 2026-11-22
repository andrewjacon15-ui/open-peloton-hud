import type { RideMetrics } from '../domain/metrics'

export const ZONE_COLORS = ['#6b7280', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a21caf']

export function hms(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const miles = (km: number) => km * 0.621371

const LB_PER_KG = 2.2046226218
export const lbFromKg = (kg: number) => kg * LB_PER_KG
export const kgFromLb = (lb: number) => lb / LB_PER_KG

export function Stat({ label, value, unit, size = 'md' }: { label: string; value: string | number; unit?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`stat stat-${size}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit ? <span className="stat-unit"> {unit}</span> : null}
      </span>
    </div>
  )
}

/** The full dashboard grid of a ride's metrics (used on the home dashboard and the ride-complete summary). */
export function RideStats({ m, imperial }: { m: RideMetrics; imperial: boolean }) {
  const dist = imperial ? miles(m.distanceKm).toFixed(2) : m.distanceKm.toFixed(2)
  const speed = imperial ? miles(m.avgSpeedKmh).toFixed(1) : m.avgSpeedKmh.toFixed(1)
  return (
    <div className="grid">
      <Stat label="Time" value={hms(m.elapsedSec)} />
      <Stat label="Total output" value={m.outputKj} unit="kJ" />
      <Stat label="Calories" value={m.calories} unit="kcal" />
      <Stat label="Distance" value={dist} unit={imperial ? 'mi' : 'km'} />
      <Stat label="Avg power" value={m.avgPower} unit="W" />
      <Stat label="Max power" value={m.maxPower} unit="W" />
      <Stat label="Normalized power" value={m.normalizedPower} unit="W" />
      <Stat label="Avg cadence" value={m.avgCadence} unit="rpm" />
      <Stat label="Max cadence" value={m.maxCadence} unit="rpm" />
      <Stat label="Avg resistance" value={m.avgResistance} unit="%" />
      <Stat label="Avg speed" value={speed} unit={imperial ? 'mph' : 'km/h'} />
      <Stat label="Moving time" value={hms(m.movingSec)} />
      {m.avgHr !== null && <Stat label="Avg HR" value={m.avgHr} unit="bpm" />}
      {m.zone !== null && <Stat label="Zone" value={`Z${m.zone}`} />}
      {m.intensityFactor !== null && <Stat label="Intensity" value={m.intensityFactor.toFixed(2)} />}
      {m.tss !== null && <Stat label="TSS" value={m.tss} />}
    </div>
  )
}

export function Zones({ m }: { m: RideMetrics }) {
  const total = m.timeInZonesSec.reduce((a, b) => a + b, 0)
  if (!total) return null
  return (
    <div className="zones">
      {m.timeInZonesSec.map((sec, i) => (
        <div key={i} className="zone-bar" title={`Zone ${i + 1}: ${hms(sec)}`}>
          <div className="zone-fill" style={{ height: `${(sec / total) * 100}%`, background: ZONE_COLORS[i] }} />
          <span className="zone-tag">Z{i + 1}</span>
        </div>
      ))}
    </div>
  )
}
