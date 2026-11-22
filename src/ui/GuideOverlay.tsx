import type { useRide } from '../ride/useRide'
import { KIND_LABEL, segmentAt, targetWatts, type Workout } from '../rides/rides'
import { PowerGauge } from './PowerGauge'
import { hms } from './stats'

/**
 * The power plan as a compact panel floating over a video, so a scenic route (or any YouTube video) becomes a guided ride: the same vertical
 * power meter as the full workout stage, plus the current target, segment and time left. Driven by the same segment math (segmentAt +
 * targetWatts) against the ride's elapsed seconds. The ✕ drops the plan but leaves the ride recording. This is the web twin of the gauge the
 * native overlay draws over Netflix/Kindle.
 */
export function GuideOverlay({ workout, ride, onStop }: { workout: Workout; ride: ReturnType<typeof useRide>; onStop: () => void }) {
  const into = ride.metrics.elapsedSec
  const pos = segmentAt(workout, into)
  const ftp = ride.settings.ftpWatts
  const power = ride.live.power
  const target = pos.segment ? targetWatts(pos.segment, ftp) : null

  return (
    <aside className="guide-ov">
      <div className="guide-ov-head">
        <span className="guide-ov-title">{workout.title}</span>
        <button className="guide-ov-close" onClick={onStop} aria-label="Drop the power plan">
          ✕
        </button>
      </div>
      {pos.done || !pos.segment ? (
        <p className="guide-ov-note">Plan complete — keep spinning or drop it.</p>
      ) : target != null ? (
        <>
          <PowerGauge power={power} target={target} tol={Math.max(10, Math.round(target * 0.05))} compact />
          <div className="guide-ov-meta">
            <span className={`wk-kind wk-${pos.segment.kind}`}>{KIND_LABEL[pos.segment.kind]}</span>
            <span className="guide-ov-time">{hms(pos.segmentRemainingSec)} left</span>
          </div>
        </>
      ) : (
        <p className="guide-ov-note">Set your FTP in Settings to see watt targets.</p>
      )}
    </aside>
  )
}
