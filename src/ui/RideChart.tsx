import type { RideSeries } from '../ride/series'

/** One auto-scaled sparkline (area + line) over a value series. Pure SVG, no chart library — `vector-effect` keeps the stroke crisp as the
 *  viewBox stretches to fit. */
function Line({ values, color, label, unit }: { values: number[]; color: string; label: string; unit: string }) {
  const w = 800
  const h = 120
  const pad = 8
  const max = Math.max(1, ...values)
  const n = values.length
  const x = (i: number) => (n <= 1 ? pad : pad + (i / (n - 1)) * (w - 2 * pad))
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)} ${h - pad} L${x(0).toFixed(1)} ${h - pad} Z`
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-label">{label}</span>
        <span className="muted">
          max {max}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg" role="img" aria-label={`${label} over the ride`}>
        <path d={area} className="chart-area" style={{ fill: color }} />
        <path d={line} className="chart-line" style={{ stroke: color }} />
      </svg>
    </div>
  )
}

/** Power and cadence over the ride, stacked (each on its own scale so the shape of both is readable). */
export function RideChart({ series }: { series: RideSeries }) {
  if (series.power.length < 2) return null
  return (
    <div className="ride-charts">
      <Line values={series.power} color="#e3202b" label="Power" unit=" W" />
      <Line values={series.cadence} color="#6ea8fe" label="Cadence" unit=" rpm" />
    </div>
  )
}
