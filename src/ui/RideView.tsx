import { useState } from 'react'
import type { useRide } from '../ride/useRide'
import type { useMedia, OverlaySeed } from '../media/useMedia'
import type { MediaApp } from '../media/apps'
import { youTubeEmbedUrl } from '../media/youtube'
import { YouTubeBrowser } from '../media/YouTubeBrowser'
import { resolvePlan, SCENIC_RIDES, WORKOUTS, type ScenicRide, type Workout } from '../rides/rides'
import { WorkoutPlayer } from './WorkoutPlayer'
import { GuideOverlay } from './GuideOverlay'
import { DeviceControls } from './DeviceControls'
import { hms } from './stats'

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v9h12v-9" />
  </svg>
)

const SlidersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" />
  </svg>
)

/** One label-over-value column for the ride bar — the same shape as the native entertainment overlay (NetflixOverlay.kt). `avg` renders a
 *  small muted figure inline after the value (used on Power, to sit the ride average next to the live number). */
function OverlayStat({ label, value, unit, power, avg }: { label: string; value: string | number; unit?: string; power?: boolean; avg?: number }) {
  return (
    <div className="obar-stat">
      <span className="obar-label">{label}</span>
      <span className={power ? 'obar-value power' : 'obar-value'}>
        {value}
        {unit ? <span className="obar-unit">{unit}</span> : null}
        {avg != null ? <span className="obar-avg">avg {avg}</span> : null}
      </span>
    </div>
  )
}

/**
 * The one ride bar, shown over every media (a YouTube video, the picker, a workout). It is the same design the native strip draws over
 * Netflix/Kindle (NetflixOverlay.kt) so the top UI is identical no matter what is on: the ride stats on the left — TIME, POWER (red),
 * CADENCE, RESIST, OUTPUT, CAL — and three carry-through controls on the right: Back (up one level, to the media picker), Home (to the HUD),
 * and Start/Stop (begins a ride, or stops and saves the one running). A ride is independent of what is on screen: Back and Home never end it,
 * only Stop does. The sliders button pops out the same volume/brightness controls the home screen has, kept in sync with the real device.
 */
function RideBar({ ride, onBack, onHome }: { ride: ReturnType<typeof useRide>; onBack: () => void; onHome: () => void }) {
  const [showLevels, setShowLevels] = useState(false)
  const live = ride.live
  const m = ride.metrics
  const recording = ride.state === 'active' || ride.state === 'paused'
  return (
    <header className="obar">
      <div className="obar-stats">
        <OverlayStat label="Time" value={hms(m.elapsedSec)} />
        <OverlayStat label="Power" value={live.power} unit="W" power avg={m.avgPower} />
        <OverlayStat label="Cadence" value={live.cadence} unit="rpm" />
        <OverlayStat label="Resist" value={live.resistance} unit="%" />
        <OverlayStat label="Output" value={m.outputKj} unit="kJ" />
        <OverlayStat label="Cal" value={m.calories} unit="kcal" />
      </div>
      <div className="obar-controls">
        <button className="obar-btn obar-icon" onClick={onBack} aria-label="Back to the media picker">
          <BackIcon />
        </button>
        <button className="obar-btn obar-icon" onClick={onHome} aria-label="Home — the HUD">
          <HomeIcon />
        </button>
        <button className={recording ? 'obar-btn stop' : 'obar-btn start'} onClick={recording ? ride.end : ride.start}>
          {recording ? 'Stop ride' : 'Start ride'}
        </button>
        <button className="obar-btn obar-icon" onClick={() => setShowLevels((v) => !v)} aria-label="Volume and brightness" aria-expanded={showLevels}>
          <SlidersIcon />
        </button>
      </div>
      {showLevels && (
        <div className="obar-levels">
          <DeviceControls compact />
        </div>
      )}
    </header>
  )
}

/** The "＋ Power plan" control shown over an unguided video: pick a workout and the guide starts riding over the video. */
function AddPlan({ onPick }: { onPick: (w: Workout) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="guide-add">
      <button className="guide-add-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        + Power plan
      </button>
      {open ? (
        <ul className="guide-add-menu">
          {WORKOUTS.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => {
                  onPick(w)
                  setOpen(false)
                }}
              >
                {w.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** When a power plan is running on the blank stage, offer a view to ride it over: a scenic route, or any video app (the plan carries through
 *  — the native overlay draws the same gauge over the app). */
function RideWithAView({ apps, onRoute, onApp }: { apps: MediaApp[]; onRoute: (r: ScenicRide) => void; onApp: (app: MediaApp) => void }) {
  return (
    <div className="guide-views">
      <span className="guide-views-label">Ride with a view</span>
      <div className="guide-views-row">
        {SCENIC_RIDES.map((r) => (
          <button key={r.id} className="chip" onClick={() => onRoute(r)}>
            {r.title}
          </button>
        ))}
        {apps.map((app) => (
          <button key={app.id} className="chip" onClick={() => onApp(app)}>
            {app.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The riding screen. The one ride bar carries the stats and controls; the rest is the media — a maximized video, the picker, or a workout.
 * A *power plan* (guide) is a layer, independent of the media: when one is running it shows the full workout stage on a blank screen, and a
 * compact gauge floating over any video. You can add a plan to a video (＋ Power plan) or add a view to a plan (Ride with a view), so a scenic
 * route and the power meter combine. Recording keeps running underneath whatever is shown; leaving a video or going Home never ends the ride.
 */
export function RideView({
  ride,
  media,
  apps,
  workout,
  onHome,
  onStartGuide,
  onStopGuide,
}: {
  ride: ReturnType<typeof useRide>
  media: ReturnType<typeof useMedia>
  /** Installed + enabled media apps you can switch to without leaving the ride. */
  apps: MediaApp[]
  workout?: Workout | null
  /** Go to the HUD home screen (the ride, if any, keeps recording). */
  onHome: () => void
  /** Start a power plan (guide) over whatever is on screen. */
  onStartGuide: (w: Workout) => void
  /** Drop the power plan (the ride keeps going). */
  onStopGuide: () => void
}) {
  const m = ride.metrics
  const playing = media.media.kind === 'youtube' && media.media.videoId
  const videoApps = apps.filter((a) => a.kind === 'video')

  // The seed handed to the native Netflix/Kindle overlay: ride progress, rider weight, and — when a plan is running — the flattened plan so
  // the overlay can draw the same power gauge and advance its target while the web is frozen behind the app.
  const overlaySeed = (): OverlaySeed => ({
    elapsedSec: m.elapsedSec,
    outputKj: m.outputKj,
    weightKg: ride.settings.weightKg,
    plan: workout ? resolvePlan(workout, ride.settings.ftpWatts) : undefined,
  })

  // Back is "up one level": out of a playing video to the picker, and from the picker itself up to the HUD.
  const onBack = () => {
    if (media.media.kind !== 'none') media.close()
    else onHome()
  }

  // When a native app is in front, the native overlay is the top bar — don't also render the web ride bar in the (hidden) WebView, or the
  // two can flash as a double bar during the launch/return transition.
  const nativeApp = media.media.kind === 'app'

  return (
    <div className="ride">
      {!nativeApp && <RideBar ride={ride} onBack={onBack} onHome={onHome} />}

      <main className="stage">
        {playing ? (
          <div className="player">
            <iframe
              src={youTubeEmbedUrl(media.media.videoId as string)}
              title={media.media.title ?? 'YouTube'}
              allow="autoplay; encrypted-media"
            />
            {workout ? <GuideOverlay workout={workout} ride={ride} onStop={onStopGuide} /> : <AddPlan onPick={onStartGuide} />}
          </div>
        ) : media.media.kind === 'app' ? (
          <div className="stage-note">
            <p>{media.media.title ?? 'An app'} is open on the bike.</p>
          </div>
        ) : workout ? (
          <div className="guided-stage">
            <WorkoutPlayer workout={workout} ride={ride} />
            <RideWithAView apps={videoApps} onRoute={(r) => media.openYouTube(r.videoId, r.title)} onApp={(app) => media.openApp(app, overlaySeed())} />
          </div>
        ) : (
          <div className="stage-browse">
            {/* Switch to any installed app without leaving the ride — recording keeps running behind its overlay (seeded so TIME/OUTPUT/CAL
                continue). The in-WebView YouTube browser is below, for riding over any video. */}
            {apps.length > 0 && (
              <div className="stage-launch">
                <span className="stage-launch-label">Switch to</span>
                {apps.map((app) => (
                  <button key={app.id} className="chip" onClick={() => media.openApp(app, overlaySeed())}>
                    {app.name}
                  </button>
                ))}
              </div>
            )}
            <YouTubeBrowser media={media} />
          </div>
        )}
      </main>
    </div>
  )
}
