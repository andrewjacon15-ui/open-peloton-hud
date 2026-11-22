import { useEffect, useMemo, useState } from 'react'
import { getBridge } from './bridge'
import { useRide } from './ride/useRide'
import { useMedia } from './media/useMedia'
import { HomeView } from './ui/HomeView'
import { RideView } from './ui/RideView'
import { RidesView } from './ui/RidesView'
import { SettingsView } from './ui/SettingsView'
import { HistoryView } from './ui/HistoryView'
import { RideDetailView } from './ui/RideDetailView'
import { watchSensors } from './ui/useSensors'
import { useInstalledApps } from './media/useApps'
import { enabledApps, type MediaApp } from './media/apps'
import { SCENIC_RIDES, type Workout } from './rides/rides'
import type { StoredRide } from './ride/storage'

/**
 * The app's screens, and how they relate to a ride. A ride is independent of what is on screen: it is started and stopped on its own (from
 * the HUD or any media bar) and keeps recording no matter where you navigate. `view` is just where the rider is looking — the HUD home
 * dashboard, the media screen (a video, the picker, or a workout, all under the one ride bar), the Rides catalog, or history — with a ride
 * detail laid over whichever opened it. The native Netflix/Kindle overlay lives outside the WebView; when it hands control back it tells us
 * where to land (`overlayClosed` nav) and the ride, if any, is still going.
 */
export function App() {
  const bridge = useMemo(() => getBridge(), [])
  const ride = useRide()
  const media = useMedia()
  useEffect(() => watchSensors(), []) // catch the shell's first sensor report, which arrives before Settings ever opens
  // Which media apps to show: installed on the bike (the shell reports) and enabled in Settings. Recomputed each render, so toggling an app
  // in Settings takes effect the moment you come back. Empty until the shell answers (an older shell, or still connecting).
  const installedApps = useInstalledApps()
  const apps = enabledApps(installedApps ?? new Set())
  // Apps with a native app actually installed — the ones the ride screen can "switch to" natively. (A web-player app with no native app,
  // e.g. YouTube on a bike with no Play Services, is reached through the in-HUD player instead, so it isn't a native switch target.)
  const nativeApps = apps.filter((a) => installedApps?.has(a.pkg) ?? false)
  const [view, setView] = useState<'home' | 'media' | 'rides' | 'history' | 'settings'>('home')
  const [detail, setDetail] = useState<StoredRide | null>(null)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const recording = ride.state === 'active' || ride.state === 'paused'
  const imperial = ride.settings.units !== 'metric'

  // Record what was watched/read on the ride (the last non-none media), so the saved ride and history show it. Only while recording; the
  // last real media is kept even if it is closed before the ride ends.
  const mediaKind = media.media.kind
  const mediaTitle = media.media.title
  useEffect(() => {
    if (recording && mediaKind !== 'none') ride.setMedia({ kind: mediaKind, title: mediaTitle })
  }, [recording, mediaKind, mediaTitle, ride])

  // A workout is a ride mode; it ends when the ride does. Clearing it when the ride is no longer recording keeps a finished workout from
  // reappearing on the media screen. (Starting a workout sets the ride active in the same tick, so this never wipes the one just started.)
  useEffect(() => {
    if (ride.state !== 'active' && ride.state !== 'paused') setWorkout(null)
  }, [ride.state])

  // The native entertainment overlay handed control back: go where its button said — the media picker (Back) or the HUD (Home / any other
  // return to front). useMedia already resets media to none on overlayClosed.
  useEffect(() => {
    return bridge.subscribe((m) => {
      if (m.type === 'overlayClosed') setView(m.nav === 'select' ? 'media' : 'home')
    })
  }, [bridge])

  const goHome = () => {
    media.close()
    setView('home')
  }

  // A power plan (guide) is a layer over whatever media is on screen. Starting one begins the ride if it isn't already going; it keeps running
  // across media switches and ends with the ride. Dropping it leaves the ride recording.
  const startGuide = (w: Workout) => {
    if (ride.state !== 'active' && ride.state !== 'paused') ride.start()
    setWorkout(w)
  }
  const stopGuide = () => setWorkout(null)

  // Launch a native media app from the HUD — seed the native overlay with the current ride (continues TIME/OUTPUT/CAL) and the rider weight.
  const seed = () => ({ elapsedSec: ride.metrics.elapsedSec, outputKj: ride.metrics.outputKj, weightKg: ride.settings.weightKg })
  const openApp = (app: MediaApp) => {
    setWorkout(null)
    // A web-player app with no native app installed (YouTube on this bike) opens the in-HUD player — the media stays 'none', so the ride
    // screen shows the YouTube browser. Otherwise launch the native app full screen with the overlay.
    if (app.webPlayer && !installedApps?.has(app.pkg)) {
      setView('media')
    } else {
      media.openApp(app, seed())
      setView('media')
    }
  }

  if (detail) {
    return <RideDetailView ride={detail} imperial={imperial} onBack={() => setDetail(null)} />
  }
  if (view === 'media') {
    return <RideView ride={ride} media={media} apps={nativeApps} workout={workout} onHome={goHome} onStartGuide={startGuide} onStopGuide={stopGuide} />
  }
  if (view === 'history') {
    return <HistoryView rides={ride.rides} imperial={imperial} onSelect={setDetail} onBack={() => setView('home')} />
  }
  if (view === 'settings') {
    return <SettingsView ride={ride} onBack={() => setView('home')} />
  }
  if (view === 'rides') {
    return (
      <RidesView
        onPlayRoute={(r) => {
          setWorkout(null)
          media.openYouTube(r.videoId, r.title)
          setView('media')
        }}
        onStartWorkout={(w) => {
          ride.start()
          setWorkout(w)
          // Auto-deploy a scenic route behind the plan so a workout rides over a view (the compact corner gauge) instead of a bare stage.
          // The first route, so it's predictable; you can change the view or drop the plan from the ride screen. Skipped if there are none.
          const scenic = SCENIC_RIDES[0]
          if (scenic) media.openYouTube(scenic.videoId, scenic.title)
          setView('media')
        }}
        onFreeRide={() => {
          // Open the in-WebView YouTube player with no plan — pick any video to ride over, and add a power plan on the ride screen if you want one.
          setWorkout(null)
          setView('media')
        }}
        onBack={() => setView('home')}
      />
    )
  }
  return (
    <HomeView
      ride={ride}
      apps={apps}
      onApp={openApp}
      onRides={() => setView('rides')}
      onHistory={() => setView('history')}
      onSelectRide={setDetail}
      onSettings={() => setView('settings')}
    />
  )
}
