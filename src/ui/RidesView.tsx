import { useEffect } from 'react'
import { warmYouTube } from '../media/youtube'
import { SCENIC_RIDES, WORKOUTS, workoutDurationSec, type ScenicRide, type Workout } from '../rides/rides'
import { ScreenHeader } from './ScreenHeader'
import { hms } from './stats'

/**
 * The embedded-rides screen (docs/RIDES.md). Scenic routes play through the existing YouTube player (so the stats overlay and recording come
 * for free); instructional workouts start a recorded ride with the WorkoutPlayer driving targets. Reached from the home screen's "Rides"
 * button. Both onPlayRoute and onStartWorkout switch to the media screen — the App owns that navigation.
 */
export function RidesView({
  onPlayRoute,
  onStartWorkout,
  onFreeRide,
  onBack,
}: {
  onPlayRoute: (r: ScenicRide) => void
  onStartWorkout: (w: Workout) => void
  /** Open the in-WebView YouTube player with no preset route — search for any video to ride over (add a power plan there if you want one). */
  onFreeRide: () => void
  onBack: () => void
}) {
  // Warm YouTube's connections while the rider is choosing, so a scenic route starts without the cold-open stutter.
  useEffect(() => warmYouTube(), [])

  return (
    <main className="app rides">
      <ScreenHeader title="Rides" onBack={onBack} />

      <section>
        <h2>Workouts</h2>
        <p className="muted">Structured rides with power targets. Set your FTP in Settings for watt targets.</p>
        <ul className="ride-list">
          {WORKOUTS.map((w) => (
            <li key={w.id}>
              <button className="ride-card" onClick={() => onStartWorkout(w)}>
                <span className="ride-card-title">{w.title}</span>
                <span className="ride-card-meta">{hms(workoutDurationSec(w))}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Scenic routes</h2>
        <p className="muted">Ride to the scenery. Add a power plan on the ride screen (＋ Power plan) to put a target gauge over the video.</p>
        {SCENIC_RIDES.length ? (
          <ul className="ride-list">
            {SCENIC_RIDES.map((r) => (
              <li key={r.id}>
                <button className="ride-card" onClick={() => onPlayRoute(r)}>
                  <span className="ride-card-title">{r.title}</span>
                  {r.region ? <span className="ride-card-meta">{r.region}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No scenic routes yet — add open / Creative-Commons route videos in src/rides/rides.ts.</p>
        )}
        <button className="ride-card ride-card-wide" onClick={onFreeRide}>
          <span className="ride-card-title">Ride over any YouTube video</span>
          <span className="ride-card-meta">Search and pick your own</span>
        </button>
      </section>
    </main>
  )
}
