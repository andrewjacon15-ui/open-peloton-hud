import { useCallback, useEffect, useMemo, useState } from 'react'
import { getBridge } from '../bridge'
import type { MediaKind } from './kind'
import type { MediaApp } from './apps'
import type { PlanSegment } from '../rides/rides'
import { parseYouTubeId } from './youtube'

export interface Media {
  kind: MediaKind
  videoId?: string
  title?: string
  /** For kind 'app': the launched app's package, so the ride screen knows which native app is in front. */
  pkg?: string
}

export interface RecentVideo {
  id: string
  title: string
}

/** Ride progress handed to the native overlay so Netflix/Kindle launched mid-ride keep the HUD's TIME, OUTPUT and CALORIES running. */
export interface OverlaySeed {
  elapsedSec: number
  outputKj: number
  /** Rider weight so the overlay computes calories the same way the web does; omitted → the overlay's default. */
  weightKg?: number
  /** A power plan flattened to durations + watt targets, so the native overlay can draw the guide gauge over Netflix/Kindle. Omitted when
   *  no plan is running; an empty/zero-target plan means no watt targets (no FTP), so the overlay shows no gauge. */
  plan?: PlanSegment[]
}

const RECENTS_KEY = 'peloton-hud:youtube-recents'
const MAX_RECENTS = 12

function loadRecents(): RecentVideo[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (raw) return JSON.parse(raw) as RecentVideo[]
  } catch {
    // ignore
  }
  return []
}

function saveRecents(list: RecentVideo[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

const NONE: Media = { kind: 'none' }

/** Holds what is playing in the center frame and the recent-YouTube list. Native media apps are launched via the bridge (openApp). */
export function useMedia() {
  const bridge = useMemo(() => getBridge(), [])
  const [media, setMedia] = useState<Media>(NONE)
  const [recents, setRecents] = useState<RecentVideo[]>(loadRecents)

  // When the native overlay is dismissed on the bike, the shell tells us so we can leave the "an app is in front" state.
  useEffect(() => {
    return bridge.subscribe((m) => {
      if (m.type === 'overlayClosed') setMedia(NONE)
    })
  }, [bridge])

  /** Returns the video id on success, or null if the input had no YouTube id. */
  const openYouTube = useCallback((input: string, title?: string): string | null => {
    const id = parseYouTubeId(input)
    if (!id) return null
    setMedia({ kind: 'youtube', videoId: id, title })
    setRecents((prev) => {
      const next = [{ id, title: title || input.trim() }, ...prev.filter((r) => r.id !== id)].slice(0, MAX_RECENTS)
      saveRecents(next)
      return next
    })
    return id
  }, [])

  // Launch any native media app (Netflix, YouTube, Prime, Kindle, …) full screen with the stats overlay drawn over it. `seed` carries the
  // in-progress ride's elapsed seconds and output so the overlay continues the ride's TIME/OUTPUT instead of resetting to zero (passed when
  // launched from the ride screen; omitted from the idle home screen, where there is no ride yet). The shell owns each app's launch quirks
  // (e.g. skipping Netflix's membership-gated wrapper), so we only hand it the package.
  const openApp = useCallback((app: MediaApp, seed?: OverlaySeed) => {
    setMedia({ kind: 'app', title: app.name, pkg: app.pkg })
    bridge.send({ type: 'openApp', pkg: app.pkg, ...seed })
  }, [bridge])

  const close = useCallback(() => {
    setMedia(NONE)
    bridge.send({ type: 'closeOverlay' })
  }, [bridge])

  return { media, recents, openYouTube, openApp, close }
}
