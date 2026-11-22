import type { useRide } from '../ride/useRide'
import { KIND_LABEL, segmentAt, targetWatts, workoutDurationSec, type Workout } from '../rides/rides'
import { PowerGauge } from './PowerGauge'
import { hms } from './stats'

/**
 * The instructional-workout stage (docs/RIDES.md): it drives through a `Workout`'s timed segments off the ride's elapsed *active* seconds
 * (so resting pauses the plan too) and shows the current target against live power — a vertical power meter (PowerGauge) with the allowable
 * band highlighted, green when you're in it and red when you're out, plus the numbers beside it. With no FTP set there is no watt target, so
 * it shows the target as a % of FTP plus any cadence cue instead. The ride stats stay on the bar above; recording is unchanged. Segment math
 * is pure in rides.ts (unit-tested); this is the thin view.
 */
export function WorkoutPlayer({ workout, ride }: { workout: Workout; ride: ReturnType<typeof useRide> }) {
  const into = ride.metrics.elapsedSec
  const total = workoutDurationSec(workout)
  const pos = segmentAt(workout, into)
  const ftp = ride.settings.ftpWatts
  const power = ride.live.power

  if (pos.done || !pos.segment) {
    return (
      <div className="workout workout-done">
        <h2>Workout complete</h2>
        <p className="muted">
          {workout.title} · {hms(total)}
        </p>
        <p className="muted">Press End on the bar above to save the ride.</p>
      </div>
    )
  }

  const seg = pos.segment
  const target = targetWatts(seg, ftp)
  let state: 'under' | 'in' | 'over' | 'cue' = 'cue'
  if (target != null) {
    const tol = Math.max(10, Math.round(target * 0.05))
    state = Math.abs(power - target) <= tol ? 'in' : power < target ? 'under' : 'over'
  }
  const nextTarget = pos.next ? targetWatts(pos.next, ftp) : null
  const segProgress = Math.min(100, Math.round((pos.intoSegmentSec / Math.max(1, seg.durationSec)) * 100))
  const overallProgress = Math.min(100, Math.round((into / Math.max(1, total)) * 100))

  return (
    <div className="workout">
      <div className="wk-head">
        <span className={`wk-kind wk-${seg.kind}`}>{KIND_LABEL[seg.kind]}</span>
        <span className="wk-total">
          {workout.title} · {hms(into)} / {hms(total)}
        </span>
      </div>

      <div className="wk-target" data-state={state}>
        {target != null ? <PowerGauge power={power} target={target} tol={Math.max(10, Math.round(target * 0.05))} /> : null}
        <div className="wk-target-text">
          <div className="wk-target-main">
            <span className="wk-target-val">{target != null ? target : Math.round(seg.targetFtpPct * 100)}</span>
            <span className="wk-target-unit">{target != null ? 'W target' : '% FTP'}</span>
          </div>
          <div className="wk-live">
            {/* Live power is the big number inside the gauge; here we show how far off target you are, and any cadence cue. */}
            {target != null ? (
              <span className="wk-delta">{power === target ? 'on target' : `${power > target ? '+' : ''}${power - target} W`}</span>
            ) : null}
            {seg.cadence ? <span className="wk-cue">target cadence {seg.cadence} rpm</span> : null}
          </div>
        </div>
      </div>

      <div className="wk-seg">
        <div className="wk-seg-meta">
          <span>{hms(pos.segmentRemainingSec)} left</span>
          {pos.next ? (
            <span className="muted">
              Next: {KIND_LABEL[pos.next.kind]}
              {nextTarget != null ? ` ${nextTarget} W` : ` ${Math.round(pos.next.targetFtpPct * 100)}%`}
            </span>
          ) : (
            <span className="muted">Last segment</span>
          )}
        </div>
        <div className="wk-bar">
          <div className="wk-bar-fill" style={{ width: `${segProgress}%` }} />
        </div>
        <div className="wk-bar wk-bar-overall">
          <div className="wk-bar-fill" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>

      {ftp == null ? <p className="wk-ftp-hint muted">Set your FTP in Settings to see watt targets instead of % of FTP.</p> : null}
    </div>
  )
}
