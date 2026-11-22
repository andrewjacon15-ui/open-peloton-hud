import { describe, expect, it } from 'vitest'
import { parseYouTubeId, youTubeEmbedUrl } from './youtube'

describe('parseYouTubeId', () => {
  it('accepts a bare id', () => {
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('pulls the id from the common url shapes', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('returns null for something that is not a video', () => {
    expect(parseYouTubeId('https://www.youtube.com')).toBeNull()
    expect(parseYouTubeId('hello world')).toBeNull()
    expect(parseYouTubeId('')).toBeNull()
  })
})

describe('youTubeEmbedUrl', () => {
  it('builds a nocookie autoplay embed', () => {
    const url = youTubeEmbedUrl('dQw4w9WgXcQ')
    expect(url).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(url).toContain('autoplay=1')
  })
})
