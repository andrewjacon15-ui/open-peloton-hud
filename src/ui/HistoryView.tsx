import type { StoredRide } from '../ride/storage'
import { mediaLabel } from './RideDetailView'
import { ScreenHeader } from './ScreenHeader'
import { hms, miles } from './stats'

/** The full list of saved rides (localStorage, on this device only). Tap one
 *  for its detail + charts. */
export function HistoryView({ rides, imperial, onSelect, onBack }: { rides: StoredRide[]; imperial: boolean; onSelect: (r: StoredRide) => void; onBack: () => void }) {
  return (
    <main className="app">
      <ScreenHeader title="History" onBack={onBack} />

      {rides.length ? (
        <ul className="history-list">
          {rides.map((r) => {
            const d = new Date(r.startedAt)
            const dist = imperial ? `${miles(r.metrics.distanceKm).toFixed(1)} mi` : `${r.metrics.distanceKm.toFixed(1)} km`
            return (
              <li key={r.rideId}>
                <button className="history-row" onClick={() => onSelect(r)}>
                  <span className="history-date">
                    {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="history-meta">{hms(r.metrics.elapsedSec)}</span>
                  <span className="history-meta">{r.metrics.outputKj} kJ</span>
                  <span className="history-meta">{r.metrics.calories} kcal</span>
                  <span className="history-meta">{dist}</span>
                  <span className="history-media muted">{mediaLabel(r.media)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">No rides yet. Start one from the home screen.</p>
      )}
    </main>
  )
}
