import type { StoredRide } from '../ride/storage'
import { RideChart } from './RideChart'
import { ScreenHeader } from './ScreenHeader'
import { RideStats, Zones } from './stats'

export function mediaLabel(media: { kind: string; title?: string }): string {
  switch (media.kind) {
    case 'youtube':
      return media.title ? `YouTube · ${media.title}` : 'YouTube'
    case 'app':
      return media.title ?? 'App'
    // Rides saved by older builds that launched these natively.
    case 'netflix':
      return 'Netflix'
    case 'kindle':
      return 'Kindle'
    default:
      return 'Just riding'
  }
}

/** One finished ride in full: its totals, power zones, and the power/cadence charts (from the stored series — works offline). */
export function RideDetailView({ ride, imperial, onBack }: { ride: StoredRide; imperial: boolean; onBack: () => void }) {
  const d = new Date(ride.startedAt)
  return (
    <main className="app">
      <ScreenHeader
        title="Ride"
        onBack={onBack}
        backLabel="Back"
        right={`${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${mediaLabel(ride.media)}`}
      />

      <section className="ride-panel">
        <RideStats m={ride.metrics} imperial={imperial} />
        <Zones m={ride.metrics} />
      </section>

      {ride.series && ride.series.power.length > 1 ? (
        <RideChart series={ride.series} />
      ) : (
        <p className="muted">No per-second chart was saved for this ride.</p>
      )}
    </main>
  )
}
