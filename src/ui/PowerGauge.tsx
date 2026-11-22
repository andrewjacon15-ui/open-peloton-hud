import { useEffect, useState } from 'react'

/**
 * A live power trace. Power is the vertical axis (0 → ~2× target); time scrolls left to right with "now" at the leading edge. The allowable
 * band (target ± tol) is a green zone you try to keep the line inside; a dashed line marks the exact target. The trace and the leading dot
 * turn green when you're in the band, red when you're out — so at a glance you see both where you are and how steadily you've been holding it.
 * Used full-size on the workout stage and `compact` as a floating guide over a scenic video (the corner gauge).
 */
const SAMPLES = 60 // ~1 minute of 1 Hz history in the trace

export function PowerGauge({ power, target, tol, compact = false }: { power: number; target: number; tol: number; compact?: boolean }) {
  // One point per live-power update (~1 Hz); keep the most recent SAMPLES. Guarded so an unchanged render doesn't duplicate points.
  const [hist, setHist] = useState<number[]>(() => [power])
  useEffect(() => {
    setHist((h) => [...h, power].slice(-SAMPLES))
  }, [power])

  const maxW = Math.max(Math.ceil((target * 2) / 50) * 50, 100) // tidy ceiling so the band sits mid-scale and holds still
  const pct = (w: number) => Math.max(0, Math.min(100, (w / maxW) * 100)) // 0 at the bottom, 100 at the top
  const yTop = (w: number) => 100 - pct(w) // SVG/ CSS top-origin
  const inZone = Math.abs(power - target) <= tol

  // Newest point pinned to the right edge (x=100); older points trail left, so the line grows in from the left then scrolls.
  const xAt = (i: number) => (hist.length <= 1 ? 100 : 100 - ((hist.length - 1 - i) / (SAMPLES - 1)) * 100)
  const points = hist.map((w, i) => `${xAt(i).toFixed(2)},${yTop(w).toFixed(2)}`).join(' ')
  const bandTop = yTop(target + tol)
  const bandBottom = yTop(target - tol)

  return (
    <div className={compact ? 'wk-gauge compact' : 'wk-gauge'} data-in={inZone}>
      <div className="wk-gauge-plot">
        <svg className="wk-gauge-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect className="wk-gauge-band" x="0" y={bandTop} width="100" height={Math.max(0, bandBottom - bandTop)} />
          <line className="wk-gauge-targetline" x1="0" x2="100" y1={yTop(target)} y2={yTop(target)} />
          <polyline className="wk-gauge-trace" points={points} vectorEffect="non-scaling-stroke" />
        </svg>
        {/* The leading "now" dot rides the right edge up and down with live power; kept circular by sitting outside the stretched SVG. */}
        <div className="wk-gauge-dot" style={{ top: `${yTop(power)}%` }} />
        <div className="wk-gauge-readout">
          <span className="wk-gauge-now">{power}</span>
          <span className="wk-gauge-unit">W</span>
        </div>
        <span className="wk-gauge-target-label" style={{ top: `${yTop(target)}%` }}>
          {target}
        </span>
      </div>
    </div>
  )
}
