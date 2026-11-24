import { useCallback, useEffect, useRef, useState } from 'react'
import { hms } from '../ui/stats'
import type { useMedia } from './useMedia'
import { searchVideos, trendingVideos, type Video } from './youtubeApi'

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
 * Browse the open-source YouTube to pick a video to ride over: trending by default, or a search. Clicking a video plays it in the center.
 * This is only for the in-HUD player (guided/free rides) — for personalized YouTube, use the native SmartTube app from the home screen.
 */
export function YouTubeBrowser({ media }: { media: ReturnType<typeof useMedia> }) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('') // the active search; empty means show trending
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchFor = useCallback((q: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    setLoading(true)
    const req = q ? searchVideos(q, ctrl.signal) : trendingVideos('US', ctrl.signal)
    req
      .then((v) => {
        if (ctrl.signal.aborted) return
        if (v.length) setVideos(v)
        else setError('Nothing came back — try again.')
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        setVideos([])
        setError(e instanceof Error ? e.message : 'Could not reach the video service.')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
  }, [])

  useEffect(() => {
    // Syncing with an external system (the video API) is exactly what an effect is for; the synchronous loading flag is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    fetchFor(submitted)
    return () => abortRef.current?.abort()
  }, [submitted, fetchFor])

  const runSearch = () => setSubmitted(query.trim())

  return (
    <div className="browser">
      <div className="browser-bar">
        <span className="browser-label">{submitted ? `Results for “${submitted}”` : 'Trending'}</span>
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
          {submitted && (
            <button className="ghost" onClick={() => { setQuery(''); setSubmitted('') }}>
              Trending
            </button>
          )}
        </div>
      </div>

      {loading && <div className="browser-note">Loading…</div>}
      {error && !loading && (
        <div className="browser-note verror">
          {error} <button className="link" onClick={() => fetchFor(submitted)}>Retry</button>
        </div>
      )}
      {!loading && !error && (
        <div className="vgrid">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} onPlay={() => media.openYouTube(v.id, v.title)} />
          ))}
        </div>
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
