/** Parsing and embedding for YouTube in the center media frame. Pure; unit-tested in youtube.test.ts. */

const ID = /^[\w-]{11}$/

/** Pull an 11-char video id out of a pasted URL or raw id, or null if there isn't one. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim()
  if (ID.test(s)) return s
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = s.match(p)
    if (m) return m[1]
  }
  return null
}

/**
 * The privacy-friendly embed URL. Autoplay works because the shell sets mediaPlaybackRequiresUserGesture=false. `fs=0` and `playsinline=1`
 * keep the player from going fullscreen: on the bike the video already fills the stage under the HUD bar, and letting the embed take over
 * the whole WebView hid that bar with no way back to it. `rel=0` keeps related videos to the same channel so a tap-out can't wander off.
 */
export function youTubeEmbedUrl(id: string): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1', fs: '0' })
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
}

const WARM_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://s.ytimg.com', // the player bootstrap (base.js)
  'https://i.ytimg.com',
  'https://googlevideo.com', // the video CDN — dns-prefetch only (its real host is a dynamic subdomain)
]

/**
 * Open — or re-open — warm connections to YouTube's hosts so a video's first segments arrive without the initial stutter. The static resource
 * hints in index.html do this at app load; calling this again right before a video opens re-warms connections that have since gone idle, which
 * is what makes a scenic route (opened minutes after launch, from a cold Rides screen) start as smoothly as the YouTube tab. Idempotent:
 * it replaces its own hint links rather than piling them up.
 */
export function warmYouTube(): void {
  for (const href of WARM_HOSTS) {
    document.querySelectorAll(`link[data-warm="${CSS.escape(href)}"]`).forEach((l) => l.remove())
    const link = document.createElement('link')
    link.rel = href.endsWith('googlevideo.com') ? 'dns-prefetch' : 'preconnect'
    link.href = href
    link.crossOrigin = 'anonymous'
    link.dataset.warm = href
    document.head.appendChild(link)
  }
}
