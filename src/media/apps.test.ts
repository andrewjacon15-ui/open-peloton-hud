import { afterEach, describe, expect, it } from 'vitest'
import { MEDIA_APPS, appByPkg, enabledApps, isAppAvailable, loadDisabledApps, setAppEnabled } from './apps'

afterEach(() => localStorage.clear())

describe('media app catalog', () => {
  it('has unique ids and packages', () => {
    expect(new Set(MEDIA_APPS.map((a) => a.id)).size).toBe(MEDIA_APPS.length)
    expect(new Set(MEDIA_APPS.map((a) => a.pkg)).size).toBe(MEDIA_APPS.length)
  })

  it('looks an app up by package', () => {
    expect(appByPkg('com.netflix.mediaclient')?.name).toBe('Netflix')
    expect(appByPkg('com.nope')).toBeUndefined()
  })
})

describe('enable/disable store', () => {
  it('defaults every installed app to enabled (opt-out)', () => {
    const installed = new Set(MEDIA_APPS.map((a) => a.pkg))
    expect(enabledApps(installed).map((a) => a.id)).toEqual(MEDIA_APPS.map((a) => a.id))
  })

  it('only shows native apps that are installed, plus web-player apps (YouTube) always', () => {
    const installed = new Set(['com.netflix.mediaclient'])
    // YouTube is a web-player app, so it shows even without a native app installed; Prime/Disney/etc. do not.
    expect(enabledApps(installed).map((a) => a.id)).toEqual(['youtube', 'netflix'])
  })

  it('treats a web-player app as available even with nothing installed', () => {
    const youtube = MEDIA_APPS.find((a) => a.id === 'youtube')!
    const netflix = MEDIA_APPS.find((a) => a.id === 'netflix')!
    expect(isAppAvailable(youtube, new Set())).toBe(true)
    expect(isAppAvailable(netflix, new Set())).toBe(false)
    expect(isAppAvailable(netflix, new Set(['com.netflix.mediaclient']))).toBe(true)
  })

  it('persists a disabled app and drops it from the enabled list', () => {
    const installed = new Set(MEDIA_APPS.map((a) => a.pkg))
    setAppEnabled('netflix', false)
    expect(loadDisabledApps().has('netflix')).toBe(true)
    expect(enabledApps(installed).find((a) => a.id === 'netflix')).toBeUndefined()
    // Re-enabling clears it.
    setAppEnabled('netflix', true)
    expect(loadDisabledApps().has('netflix')).toBe(false)
    expect(enabledApps(installed).find((a) => a.id === 'netflix')).toBeDefined()
  })

  it('keeps catalog order', () => {
    const installed = new Set(MEDIA_APPS.map((a) => a.pkg))
    const ids = enabledApps(installed).map((a) => a.id)
    expect(ids).toEqual([...ids].sort((a, b) => MEDIA_APPS.findIndex((x) => x.id === a) - MEDIA_APPS.findIndex((x) => x.id === b)))
  })
})
