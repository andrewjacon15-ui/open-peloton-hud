/**
 * The open-source YouTube catalog: search and trending, with no Google account and no API key. This is what lets the HUD browse YouTube
 * from inside our own page (so the stats stay on screen for guided rides) instead of pasting a link every time.
 *
 * It talks to public **Piped** and **Invidious** instances — both are open-source YouTube front-ends with keyless JSON APIs. We normalize
 * the two shapes into one `Video` and fail over across a list of instances, because any single public instance is often slow or down.
 * Playback itself still uses the YouTube IFrame embed (`youtube.ts`): it is the most reliable path in the bike's WebView, so these APIs
 * only supply the metadata, never the video stream.
 *
 * Public instances rot — `PROVIDERS` is a plain list to keep current (see docs/YOUTUBE.md). The app is served from the APK (no hosting, no
 * Content-Security-Policy header), so adding a host here is all that's needed; CORS is still the real gate (below). The pure parsing
 * (`normalizePiped`, `normalizeInvidious`, `pickVideos`) is unit-tested in `youtubeApi.test.ts`; the network code is thin on top.
 */

export interface Video {
  id: string
  title: string
  author: string
  authorId: string | null
  durationSec: number
  thumbnail: string
  viewText: string | null
  uploadedText: string | null
}

type Kind = 'piped' | 'invidious'
interface Provider {
  base: string
  kind: Kind
}

/**
 * Failover order. The first live instance that returns results is remembered and tried first next time (persisted, see `preferred`).
 * **CORS-capable 2026-11-04 (browser-probed): only `pipedapi.ducks.party` and `api.piped.private.coffee`** — every other public instance
 * either is down or sends no `Access-Control-Allow-Origin`, so the browser blocks it no matter what the CSP allows. Those two lead; the rest
 * stay as fallbacks because instances come and go (a dead one recovers; one that didn't send CORS may start) — re-probe from a browser (the
 * probe in docs/YOUTUBE.md) when YouTube stops loading, since a Node probe can't see CORS. The two that work also rate-limit, which is why
 * the feed keeps concurrency low and retries a 429 (see below). Served from the APK there's no CSP to allowlist against — CORS is the only gate.
 */
export const PROVIDERS: Provider[] = [
  { base: 'https://pipedapi.ducks.party', kind: 'piped' }, // live 2026-11-04
  { base: 'https://api.piped.private.coffee', kind: 'piped' }, // live 2026-11-04
  { base: 'https://pipedapi.kavin.rocks', kind: 'piped' },
  { base: 'https://pipedapi.reallyaweso.me', kind: 'piped' },
  { base: 'https://pipedapi.leptons.xyz', kind: 'piped' },
  { base: 'https://yewtu.be', kind: 'invidious' },
  { base: 'https://invidious.nerdvpn.de', kind: 'invidious' },
  { base: 'https://inv.nadeko.net', kind: 'invidious' },
  { base: 'https://iv.ggtyler.dev', kind: 'invidious' },
]

const TIMEOUT_MS = 9000
const CHANNEL_ID = /(?:channel\/)?(UC[0-9A-Za-z_-]{22})/

/** Pull an 11-char video id out of a Piped `/watch?v=ID` url (or a bare id). */
export function videoIdFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]{11})/) ?? url.match(/^([\w-]{11})$/)
  return m ? m[1] : null
}

/** Pull a `UC…` channel id out of a Piped `/channel/UC…` url. */
export function channelIdFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const m = url.match(CHANNEL_ID)
  return m ? m[1] : null
}

/** A compact "1.2M views" style label from a raw count. */
export function viewLabel(views: number | undefined): string | null {
  if (typeof views !== 'number' || views < 0) return null
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [size, suffix] of units) {
    if (views >= size) {
      const n = views / size
      // Truncate rather than round, the way YouTube shows counts (1.29M → "1.2M").
      const label = n >= 10 ? String(Math.floor(n)) : String(Math.floor(n * 10) / 10)
      return `${label}${suffix} views`
    }
  }
  return `${views} views`
}

interface PipedStream {
  url?: string
  type?: string
  title?: string
  thumbnail?: string
  uploaderName?: string
  uploaderUrl?: string
  duration?: number
  views?: number
  uploadedDate?: string | null
}

/** One Piped stream item → a `Video`, or null if it isn't a playable video. */
export function normalizePiped(item: PipedStream): Video | null {
  if (item.type && item.type !== 'stream') return null
  const id = videoIdFromUrl(item.url)
  if (!id || !item.title) return null
  return {
    id,
    title: item.title,
    author: item.uploaderName ?? '',
    authorId: channelIdFromUrl(item.uploaderUrl),
    durationSec: Math.max(0, Math.round(item.duration ?? 0)),
    // Always YouTube's own thumbnail CDN, never the instance's proxy: it keeps `img-src` in the CSP down to one host and does not rot.
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    viewText: viewLabel(item.views),
    uploadedText: item.uploadedDate ?? null,
  }
}

interface InvidiousVideo {
  type?: string
  videoId?: string
  title?: string
  author?: string
  authorId?: string
  lengthSeconds?: number
  videoThumbnails?: { quality?: string; url?: string }[]
  viewCountText?: string
  publishedText?: string
}

/** One Invidious video item → a `Video`, or null if it isn't a playable video. */
export function normalizeInvidious(item: InvidiousVideo): Video | null {
  if (item.type && item.type !== 'video') return null
  const id = item.videoId
  if (!id || !item.title) return null
  return {
    id,
    title: item.title,
    author: item.author ?? '',
    authorId: item.authorId ?? null,
    durationSec: Math.max(0, Math.round(item.lengthSeconds ?? 0)),
    // Always YouTube's own thumbnail CDN, never the instance's proxy: it keeps `img-src` in the CSP down to one host and does not rot.
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    viewText: item.viewCountText ?? null,
    uploadedText: item.publishedText ?? null,
  }
}

/** Normalize a raw API response (array, `{items}` from Piped search, or `{videos}` from an Invidious channel) into videos. */
export function pickVideos(kind: Kind, data: unknown): Video[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? (data as { items: unknown[] }).items
      : Array.isArray((data as { videos?: unknown[] })?.videos)
        ? (data as { videos: unknown[] }).videos
        : Array.isArray((data as { relatedStreams?: unknown[] })?.relatedStreams)
          ? (data as { relatedStreams: unknown[] }).relatedStreams
          : []
  const out: Video[] = []
  for (const it of arr) {
    const v = kind === 'piped' ? normalizePiped(it as PipedStream) : normalizeInvidious(it as InvidiousVideo)
    if (v) out.push(v)
  }
  return out
}

// --- network ---

let preferred: Provider | null = null

const INSTANCE_KEY = 'peloton-hud:yt-instance'

// Restore the last known-good instance so a cold page start talks to a live host first instead of failing over through dead ones.
try {
  const base = localStorage.getItem(INSTANCE_KEY)
  if (base) preferred = PROVIDERS.find((p) => p.base === base) ?? null
} catch {
  // ignore
}

function setPreferred(p: Provider): void {
  preferred = p
  try {
    localStorage.setItem(INSTANCE_KEY, p.base)
  } catch {
    // ignore
  }
}

function order(): Provider[] {
  if (!preferred) return PROVIDERS
  return [preferred, ...PROVIDERS.filter((p) => p !== preferred)]
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')) }, { once: true })
  })

async function fetchJsonOnce(provider: Provider, path: string, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(provider.base + path, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// The CORS-capable instances rate-limit; a 429/503 is transient, so back off once with jitter before giving up on this instance. Other
// errors (and the second 429) propagate so the caller fails over to the next instance or skips the channel.
async function getJson(provider: Provider, path: string, signal?: AbortSignal): Promise<unknown> {
  try {
    return await fetchJsonOnce(provider, path, signal)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (signal?.aborted || !(msg === 'HTTP 429' || msg === 'HTTP 503')) throw e
    await sleep(600 + Math.floor(Math.random() * 500), signal)
    return fetchJsonOnce(provider, path, signal)
  }
}

const NO_INSTANCE = 'No open-source YouTube instance is reachable. Check the bike’s Wi‑Fi, or update the instance list (docs/YOUTUBE.md).'

/** The host of an instance base url, for logs and error messages (`https://pipedapi.ducks.party` → `pipedapi.ducks.party`). */
function hostOf(base: string): string {
  try {
    return new URL(base).hostname
  } catch {
    return base
  }
}

/** A short failure reason for one instance, for the "what was tried" list. */
export function instanceFailure(base: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error)
  return `${hostOf(base)}: ${reason}`
}

/**
 * The error thrown when every instance failed. It names what was tried so the failure is diagnosable instead of a blanket "none reachable"
 * (plan N2): the full per-instance reasons go to the console (logcat on the bike), and the hosts tried are named in the message. Pure and
 * unit-tested so the "names what was tried" behaviour is covered without mocking the network.
 */
export function noInstanceError(tried: string[]): Error {
  if (tried.length) console.warn('[youtube] all instances failed —', tried.join(' · '))
  const hosts = tried.map((t) => t.split(':')[0]).filter(Boolean)
  return new Error(hosts.length ? `${NO_INSTANCE} Tried ${hosts.length}: ${hosts.join(', ')}.` : NO_INSTANCE)
}

/** Run `paths[kind]` against instances in turn until one returns videos; remembers the winner. `allowEmpty` keeps a valid empty result. */
async function run(
  paths: Record<Kind, string>,
  signal: AbortSignal | undefined,
  allowEmpty = false,
): Promise<Video[]> {
  const tried: string[] = []
  for (const p of order()) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    try {
      const data = await getJson(p, paths[p.kind], signal)
      const videos = pickVideos(p.kind, data)
      if (videos.length || allowEmpty) {
        setPreferred(p)
        return videos
      }
      tried.push(`${hostOf(p.base)}: no results`)
    } catch (e) {
      if (signal?.aborted) throw e
      tried.push(instanceFailure(p.base, e))
    }
  }
  throw noInstanceError(tried)
}

export function searchVideos(query: string, signal?: AbortSignal): Promise<Video[]> {
  const q = encodeURIComponent(query)
  return run({ piped: `/search?q=${q}&filter=videos`, invidious: `/api/v1/search?q=${q}&type=video` }, signal)
}

export function trendingVideos(region = 'US', signal?: AbortSignal): Promise<Video[]> {
  return run({ piped: `/trending?region=${region}`, invidious: `/api/v1/trending?region=${region}` }, signal)
}
