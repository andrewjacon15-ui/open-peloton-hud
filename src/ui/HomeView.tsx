import { useState } from 'react'
import { speedMsFromPower } from '../domain/metrics'
import type { useRide } from '../ride/useRide'
import type { StoredRide } from '../ride/storage'
import type { MediaApp } from '../media/apps'
import { DeviceControls } from './DeviceControls'
import { RideStats, Stat, Zones, hms, miles } from './stats'

const RideIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const RouteIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
  </svg>
)

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** An app tile's icon: the app's own logo, falling back to its short mark if the logo image is missing (e.g. a fresh clone without the
 *  gitignored logo assets, or a load error). */
function AppTileIcon({ app }: { app: MediaApp }) {
  // Show the short mark first, then swap in the real logo once it has actually decoded — so a rider without the (gitignored) logo files, or a
  // slow/failed load, always sees the clean coloured mark and never a broken-image box. The <img> still renders (hidden) so it can load.
  const [ok, setOk] = useState(false)
  const [failed, setFailed] = useState(false)
  const useLogo = Boolean(app.logo) && !failed
  return (
    <>
      {(!useLogo || !ok) && <span className="app-mark">{app.mark}</span>}
      {useLogo && (
        <img
          className="app-logo"
          src={app.logo}
          alt=""
          aria-hidden="true"
          style={ok ? undefined : { display: 'none' }}
          onLoad={() => setOk(true)}
          onError={() => setFailed(true)}
        />
      )}
    </>
  )
}

function RecentRides({ rides, imperial, onSelect, onHistory }: { rides: StoredRide[]; imperial: boolean; onSelect: (r: StoredRide) => void; onHistory: () => void }) {
  if (!rides.length) return null
  return (
    <div className="recent">
      <div className="recent-head">
        <h2>Recent rides</h2>
        {rides.length > 8 ? (
          <button className="link" onClick={onHistory}>
            See all
          </button>
        ) : null}
      </div>
      <ul>
        {rides.slice(0, 8).map((r) => {
          const d = new Date(r.startedAt)
          const dist = imperial ? `${miles(r.metrics.distanceKm).toFixed(1)} mi` : `${r.metrics.distanceKm.toFixed(1)} km`
          return (
            <li key={r.rideId}>
              <button className="recent-row" onClick={() => onSelect(r)}>
                <span>
                  {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>{hms(r.metrics.elapsedSec)}</span>
                <span>{r.metrics.outputKj} kJ</span>
                <span>{r.metrics.calories} kcal</span>
                <span>{dist}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** What the header says about the live-data source (from the shell's hello). */
const SENSOR_LABEL: Record<string, string> = {
  unknown: 'Connecting to the bike…',
  sensordata: 'Bike sensor',
  affernet: 'Bike sensor',
  ble: 'Bluetooth sensor',
  simulated: 'Simulated bike',
  none: 'No sensor',
}

export function HomeView({
  ride,
  apps,
  onApp,
  onRides,
  onHistory,
  onSelectRide,
  onSettings,
}: {
  ride: ReturnType<typeof useRide>
  /** The media apps installed on the bike and enabled in Settings — one launch button each. */
  apps: MediaApp[]
  onApp: (app: MediaApp) => void
  onRides: () => void
  onHistory: () => void
  onSelectRide: (r: StoredRide) => void
  onSettings: () => void
}) {
  const imperial = ride.settings.units !== 'metric'
  const recording = ride.state === 'active' || ride.state === 'paused'
  const live = ride.live
  const liveSpeed = speedMsFromPower(live.power, (ride.settings.weightKg ?? 75) + 9) * 3.6 * (imperial ? 0.621371 : 1)
  const summary = ride.state === 'done' ? ride.lastSummary : null

  return (
    <main className="app">
      <header className="home-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>Peloton HUD</h1>
        </div>
        <div className="home-head-right">
          <p className="muted">
            {SENSOR_LABEL[ride.sensor] ?? `${ride.sensor} sensor`}
            {` · ${__APP_VERSION__}`}
          </p>
          <button className="head-settings" onClick={onSettings} aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </header>

      {/* The home screen's own live stats. During a ride over media the same figures live in the ride overlay instead — the two never show at
          once because the media view replaces the home screen. */}
      <section className="live">
        <Stat label="Power" value={live.power} unit="W" size="lg" />
        <Stat label="Cadence" value={live.cadence} unit="rpm" size="lg" />
        <Stat label="Resistance" value={live.resistance} unit="%" size="lg" />
        <Stat label="Speed" value={liveSpeed.toFixed(1)} unit={imperial ? 'mph' : 'km/h'} size="lg" />
      </section>

      <section className="cta-primary">
        {recording ? (
          <button className="cta cta-ride cta-stop" onClick={ride.end}>
            <span className="cta-ico">
              <StopIcon />
            </span>
            <span className="cta-text">Stop ride</span>
          </button>
        ) : (
          <button className="cta cta-ride" onClick={ride.start}>
            <span className="cta-ico">
              <RideIcon />
            </span>
            <span className="cta-text">{ride.state === 'done' ? 'New ride' : 'Start ride'}</span>
          </button>
        )}
      </section>

      {/* The two primary actions sit together, same full width and height: start a free ride, or pick a structured ride. */}
      <button className="cta-wide cta-rides" onClick={onRides}>
        <span className="cta-ico">
          <RouteIcon />
        </span>
        <span className="cta-text">Rides — scenic routes &amp; workouts</span>
      </button>

      {/* One tile per installed + enabled media app (Settings → Apps), in an even grid. Each wears its service's brand colour so they read
          as distinct launchers; updates automatically as apps are added or toggled. */}
      {apps.length > 0 && (
        <section className="app-grid">
          {apps.map((app) => (
            <button key={app.id} className="app-tile" style={{ ['--brand' as string]: app.brand }} onClick={() => onApp(app)}>
              <AppTileIcon app={app} />
              <span className="app-name">{app.name}</span>
            </button>
          ))}
        </section>
      )}

      <DeviceControls />

      {ride.error && <p role="alert">{ride.error}</p>}

      {summary && (
        <section className="ride-panel">
          <h2>Last ride</h2>
          <RideStats m={summary.metrics} imperial={imperial} />
          <Zones m={summary.metrics} />
        </section>
      )}

      <RecentRides rides={ride.rides} imperial={imperial} onSelect={onSelectRide} onHistory={onHistory} />
    </main>
  )
}
