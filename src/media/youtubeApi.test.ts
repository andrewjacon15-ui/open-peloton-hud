import { describe, expect, it } from 'vitest'
import { channelIdFromUrl, instanceFailure, noInstanceError, normalizeInvidious, normalizePiped, pickVideos, videoIdFromUrl, viewLabel } from './youtubeApi'

describe('id extraction', () => {
  it('pulls a video id from a Piped watch url or a bare id', () => {
    expect(videoIdFromUrl('/watch?v=w2ZKUhressg')).toBe('w2ZKUhressg')
    expect(videoIdFromUrl('/watch?v=w2ZKUhressg&t=10')).toBe('w2ZKUhressg')
    expect(videoIdFromUrl('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(videoIdFromUrl('/channel/UC123')).toBeNull()
    expect(videoIdFromUrl(undefined)).toBeNull()
  })

  it('pulls a UC channel id', () => {
    expect(channelIdFromUrl('/channel/UC4R8DWoMoI7CAwX8_LjQHig')).toBe('UC4R8DWoMoI7CAwX8_LjQHig')
    expect(channelIdFromUrl('https://www.youtube.com/channel/UC4R8DWoMoI7CAwX8_LjQHig')).toBe('UC4R8DWoMoI7CAwX8_LjQHig')
    expect(channelIdFromUrl('/user/somebody')).toBeNull()
  })
})

describe('viewLabel', () => {
  it('formats counts compactly', () => {
    expect(viewLabel(1_250_000)).toBe('1.2M views')
    expect(viewLabel(12_500_000)).toBe('12M views')
    expect(viewLabel(3400)).toBe('3.4K views')
    expect(viewLabel(42)).toBe('42 views')
    expect(viewLabel(undefined)).toBeNull()
  })
})

describe('normalizePiped', () => {
  it('maps a stream item', () => {
    const v = normalizePiped({
      url: '/watch?v=w2ZKUhressg',
      type: 'stream',
      title: '25 min Indoor Cycling Workout',
      thumbnail: 'https://t/x.jpg',
      uploaderName: 'Kaleigh Cohen Cycling',
      uploaderUrl: '/channel/UC4R8DWoMoI7CAwX8_LjQHig',
      duration: 1543,
      views: 1_250_000,
      uploadedDate: '2 years ago',
    })
    expect(v).toEqual({
      id: 'w2ZKUhressg',
      title: '25 min Indoor Cycling Workout',
      author: 'Kaleigh Cohen Cycling',
      authorId: 'UC4R8DWoMoI7CAwX8_LjQHig',
      durationSec: 1543,
      thumbnail: 'https://i.ytimg.com/vi/w2ZKUhressg/hqdefault.jpg',
      viewText: '1.2M views',
      uploadedText: '2 years ago',
    })
  })

  it('drops non-stream items and ones with no id', () => {
    expect(normalizePiped({ type: 'channel', url: '/channel/UC123', title: 'A channel' })).toBeNull()
    expect(normalizePiped({ type: 'stream', title: 'no url' })).toBeNull()
  })

  it('always uses the youtube thumbnail CDN, ignoring the instance proxy url', () => {
    expect(normalizePiped({ url: '/watch?v=w2ZKUhressg', title: 'x', thumbnail: 'https://proxy/x.jpg' })?.thumbnail).toBe('https://i.ytimg.com/vi/w2ZKUhressg/hqdefault.jpg')
  })
})

describe('normalizeInvidious', () => {
  it('maps a video item and uses the youtube thumbnail CDN', () => {
    const v = normalizeInvidious({
      type: 'video',
      videoId: 'w2ZKUhressg',
      title: 'Ride',
      author: 'Coach',
      authorId: 'UC4R8DWoMoI7CAwX8_LjQHig',
      lengthSeconds: 1543,
      videoThumbnails: [
        { quality: 'high', url: 'https://t/high.jpg' },
        { quality: 'medium', url: 'https://t/med.jpg' },
      ],
      viewCountText: '1.2M views',
      publishedText: '2 years ago',
    })
    expect(v?.thumbnail).toBe('https://i.ytimg.com/vi/w2ZKUhressg/hqdefault.jpg')
    expect(v?.durationSec).toBe(1543)
    expect(v?.authorId).toBe('UC4R8DWoMoI7CAwX8_LjQHig')
  })

  it('drops non-video items', () => {
    expect(normalizeInvidious({ type: 'channel', videoId: undefined, title: 'x' })).toBeNull()
  })
})

describe('failover error naming (N2)', () => {
  it('reduces an instance base + error to host: reason', () => {
    expect(instanceFailure('https://pipedapi.ducks.party', new Error('HTTP 502'))).toBe('pipedapi.ducks.party: HTTP 502')
    expect(instanceFailure('https://yewtu.be/x', 'timeout')).toBe('yewtu.be: timeout')
  })

  it('names the hosts tried in the all-failed error', () => {
    const err = noInstanceError(['pipedapi.ducks.party: HTTP 502', 'yewtu.be: timeout'])
    expect(err.message).toContain('Tried 2:')
    expect(err.message).toContain('pipedapi.ducks.party')
    expect(err.message).toContain('yewtu.be')
  })

  it('falls back to the plain message when nothing was tried', () => {
    expect(noInstanceError([]).message).not.toContain('Tried')
  })
})

describe('pickVideos', () => {
  it('reads a Piped search envelope ({items})', () => {
    const data = { items: [{ type: 'stream', url: '/watch?v=w2ZKUhressg', title: 'a' }, { type: 'channel', url: '/channel/UC1', title: 'c' }] }
    const out = pickVideos('piped', data)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('w2ZKUhressg')
  })

  it('reads a bare array (Piped trending/feed)', () => {
    const data = [{ url: '/watch?v=w2ZKUhressg', title: 'a' }]
    expect(pickVideos('piped', data)).toHaveLength(1)
  })

  it('reads an Invidious channel envelope ({videos})', () => {
    const data = { videos: [{ type: 'video', videoId: 'w2ZKUhressg', title: 'a' }] }
    expect(pickVideos('invidious', data)).toHaveLength(1)
  })

  it('returns nothing for junk', () => {
    expect(pickVideos('piped', null)).toEqual([])
    expect(pickVideos('invidious', { nope: true })).toEqual([])
  })
})
