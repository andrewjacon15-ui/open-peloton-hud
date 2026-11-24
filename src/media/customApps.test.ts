import { afterEach, describe, expect, it } from 'vitest'
import { addCustomApp, removeCustomApp, loadCustomApps, customMediaApps, markForName, brandForPkg } from './customApps'

afterEach(() => localStorage.clear())

describe('custom apps store', () => {
  it('adds and loads an app', () => {
    addCustomApp({ pkg: 'com.spotify.music', name: 'Spotify', icon: 'data:image/png;base64,AAAA' })
    const list = loadCustomApps()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ pkg: 'com.spotify.music', name: 'Spotify', icon: 'data:image/png;base64,AAAA' })
  })

  it('ignores a duplicate package', () => {
    addCustomApp({ pkg: 'com.spotify.music', name: 'Spotify' })
    addCustomApp({ pkg: 'com.spotify.music', name: 'Spotify (again)' })
    expect(loadCustomApps()).toHaveLength(1)
    expect(loadCustomApps()[0].name).toBe('Spotify')
  })

  it('removes an app by package', () => {
    addCustomApp({ pkg: 'com.spotify.music', name: 'Spotify' })
    addCustomApp({ pkg: 'org.videolan.vlc', name: 'VLC' })
    removeCustomApp('com.spotify.music')
    expect(loadCustomApps().map((a) => a.pkg)).toEqual(['org.videolan.vlc'])
  })

  it('survives a corrupt stored value', () => {
    localStorage.setItem('peloton-hud:custom-apps', '{not json')
    expect(loadCustomApps()).toEqual([])
  })

  it('drops malformed entries', () => {
    localStorage.setItem('peloton-hud:custom-apps', JSON.stringify([{ pkg: 'ok', name: 'Ok' }, { pkg: 7 }, null]))
    expect(loadCustomApps()).toEqual([{ pkg: 'ok', name: 'Ok' }])
  })
})

describe('custom apps as tiles', () => {
  it('maps to MediaApp with a namespaced id and the device icon as the logo', () => {
    const tiles = customMediaApps([{ pkg: 'org.videolan.vlc', name: 'VLC media player', icon: 'data:xyz' }])
    expect(tiles[0]).toMatchObject({ id: 'custom:org.videolan.vlc', pkg: 'org.videolan.vlc', name: 'VLC media player', kind: 'video', logo: 'data:xyz' })
    // Namespaced so a custom id can never collide with a catalog id.
    expect(tiles[0].id.startsWith('custom:')).toBe(true)
  })

  it('derives a two-letter mark and a stable per-package colour for the no-icon fallback', () => {
    expect(markForName('VLC media player')).toBe('VM')
    expect(markForName('Spotify')).toBe('SP')
    expect(brandForPkg('com.spotify.music')).toBe(brandForPkg('com.spotify.music'))
    expect(brandForPkg('a')).not.toBe(brandForPkg('b'))
  })
})
