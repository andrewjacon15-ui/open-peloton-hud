import { useCallback, useEffect, useRef, useState } from 'react'
import { hms } from '../ui/stats'
import type { useMedia } from './useMedia'
import { loadSubscriptions, type Channel } from './subscriptions'
import { cachedFeed, searchVideos, subscriptionFeed, trendingVideos, type Video } from './youtubeApi'

type Tab = 'subscriptions' | 'trending' | 'search'

function VideoCard({ video, onPlay }: { video: Video; onPlay: () => void }) {
  return (
    <button className="vcard" onClick={onPlay} title={video.title}>
      <span className="vthumb">
        <img src={video.thumbnail} alt="" loading="lazy" />
        {video.durationSec > 0 && <span className="vdur">{hms(video.durationSec)}</span>}
      </span>
      <span className="vmeta">
        <span className="vtitle">{video.title}</span>
        <span className="vsub">{video.author}</span>
        {(video.viewText || video.uploadedText) && (
          <span className="vsub dim">{[video.viewText, video.uploadedText].filter(Boolean).join(' · ')}</span>
        )}
      </span>
    </button>
  )
}

/**
 * Browse the open-source YouTube: your subscription feed (the default), trending, or search. Clicking a video plays it in the center.
 * Subscriptions are *managed* in Settings on the home screen, not here — this only views the feed.
 */
export function YouTubeBrowser({ media }: { media: ReturnType<typeof useMedia> }) {
  // Subscriptions is the default view; fall back to trending if there are none. Snapshot once for the component's life.
  const [subs] = useState<Channel[]>(loadSubscriptions)
  const [tab, setTab] = useState<Tab>(subs.length ? 'subscriptions' : 'trending')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchFor = useCallback(
    (which: Tab, q: string) => {
      abortRef.current?.abort()
      if (which === 'search' && !q) {
        setVideos([])
        setError(null)
        setLoading(false)
        return
      }
      if (which === 'subscriptions' && !subs.length) {
        setVideos([])
        setError(null)
        setLoading(false)
        return
      }
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setError(null)
      // Subscriptions: paint the cached feed instantly, then revalidate in the background with no spinner. Everything else shows a spinner.
      const cached = which === 'subscriptions' ? cachedFeed(subs.map((c) => c.id)) : null
      const hadCache = !!cached?.length
      if (hadCache) {
        setVideos(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      const req =
        which === 'search'
          ? searchVideos(q, ctrl.signal)
          : which === 'subscriptions'
            ? subscriptionFeed(subs.map((c) => c.id), ctrl.signal)
            : trendingVideos('US', ctrl.signal)
      req
        .then((v) => {
          if (ctrl.signal.aborted) return
          if (v.length) setVideos(v)
          else if (!hadCache) setError(which === 'subscriptions' ? 'No recent videos from your channels.' : 'Nothing came back — try again.')
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || hadCache) return // keep the cached feed on screen if revalidation fails
          setVideos([])
          setError(e instanceof Error ? e.message : 'Could not reach the video service.')
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    },
    [subs],
  )

  useEffect(() => {
    // Syncing with an external system (the video API) is exactly what an effect is for; the synchronous loading flag is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    fetchFor(tab, submitted)
    return () => abortRef.current?.abort()
  }, [tab, submitted, fetchFor])

  const runSearch = () => {
    const q = query.trim()
    setTab('search')
    setSubmitted(q)
  }

  return (
    <div className="browser">
      <div className="browser-bar">
        <div className="tabs">
          <button className={tab === 'subscriptions' ? 'tab on' : 'tab'} onClick={() => setTab('subscriptions')}>
            Subscriptions
          </button>
          <button className={tab === 'trending' ? 'tab on' : 'tab'} onClick={() => setTab('trending')}>
            Trending
          </button>
        </div>
        <div className="search">
          <input
            type="search"
            inputMode="search"
            placeholder="Search YouTube"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button className="primary" onClick={runSearch} disabled={!query.trim()}>
            Search
          </button>
        </div>
      </div>

      {tab === 'subscriptions' && !subs.length ? (
        <div className="browser-note">No subscriptions yet. Add them in Settings on the home screen.</div>
      ) : (
        <>
          {loading && <div className="browser-note">Loading…</div>}
          {error && !loading && (
            <div className="browser-note verror">
              {error} <button className="link" onClick={() => fetchFor(tab, submitted)}>Retry</button>
            </div>
          )}
          {!loading && !error && (
            <div className="vgrid">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} onPlay={() => media.openYouTube(v.id, v.title)} />
              ))}
            </div>
          )}
        </>
      )}

      <PasteLink onPlay={(raw) => media.openYouTube(raw)} />
    </div>
  )
}

/** A small escape hatch: paste any YouTube link to play it directly. */
function PasteLink({ onPlay }: { onPlay: (raw: string) => string | null }) {
  const [url, setUrl] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <div className="paste">
      <input
        type="url"
        inputMode="url"
        placeholder="…or paste a YouTube link"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          setBad(false)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (onPlay(url) === null) setBad(true)
          else setUrl('')
        }}
      />
      {bad && <span className="verror">Not a YouTube link</span>}
    </div>
  )
}
