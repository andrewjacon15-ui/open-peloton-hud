import { afterEach, describe, expect, it } from 'vitest'
import {
  activeProfile,
  activeProfileId,
  addProfile,
  deleteProfile,
  DEFAULT_PROFILE_ID,
  loadProfiles,
  renameProfile,
  ridesKey,
  setActiveProfile,
  settingsKey,
} from './profiles'

afterEach(() => localStorage.clear())

describe('rider profiles', () => {
  it('creates a default profile on first use', () => {
    expect(loadProfiles()).toEqual([{ id: DEFAULT_PROFILE_ID, name: 'Rider' }])
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID)
  })

  it('migrates legacy single-rider settings and rides into the default profile', () => {
    localStorage.setItem('peloton-hud:settings', JSON.stringify({ weightKg: 102, ftpWatts: 170 }))
    localStorage.setItem('peloton-hud:rides', JSON.stringify([{ rideId: 'a' }, { rideId: 'b' }]))
    // First access triggers the migration.
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID)
    expect(JSON.parse(localStorage.getItem(settingsKey(DEFAULT_PROFILE_ID))!)).toEqual({ weightKg: 102, ftpWatts: 170 })
    expect(JSON.parse(localStorage.getItem(ridesKey(DEFAULT_PROFILE_ID))!)).toHaveLength(2)
    // The legacy keys are left intact (copied, not moved) as a backup.
    expect(localStorage.getItem('peloton-hud:rides')).not.toBeNull()
  })

  it('switches the active profile and reads it back (not just the first one)', () => {
    const guest = addProfile('Guest') // addProfile also makes it active
    expect(activeProfileId()).toBe(guest.id)
    expect(activeProfile().name).toBe('Guest')
    setActiveProfile(DEFAULT_PROFILE_ID)
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID)
    // The regression guard: a non-first profile must round-trip, not fall back to profiles[0].
    setActiveProfile(guest.id)
    expect(activeProfileId()).toBe(guest.id)
  })

  it('keeps each profile’s stored data separate', () => {
    localStorage.setItem(settingsKey(DEFAULT_PROFILE_ID), JSON.stringify({ weightKg: 100 }))
    localStorage.setItem(ridesKey(DEFAULT_PROFILE_ID), JSON.stringify([{ rideId: 'x' }]))
    const guest = addProfile('Guest')
    // A fresh profile has no settings/rides of its own.
    expect(localStorage.getItem(settingsKey(guest.id))).toBeNull()
    expect(localStorage.getItem(ridesKey(guest.id))).toBeNull()
    // The default profile's data is untouched.
    expect(JSON.parse(localStorage.getItem(ridesKey(DEFAULT_PROFILE_ID))!)).toHaveLength(1)
  })

  it('deletes exactly the named profile and its data, never a bystander', () => {
    const guest = addProfile('Guest')
    localStorage.setItem(ridesKey(DEFAULT_PROFILE_ID), JSON.stringify([{ rideId: 'keep' }]))
    localStorage.setItem(ridesKey(guest.id), JSON.stringify([{ rideId: 'gone' }]))
    deleteProfile(guest.id)
    expect(loadProfiles().map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID])
    expect(localStorage.getItem(ridesKey(guest.id))).toBeNull() // the deleted profile's rides are removed
    expect(JSON.parse(localStorage.getItem(ridesKey(DEFAULT_PROFILE_ID))!)).toHaveLength(1) // the kept profile's rides survive
    expect(activeProfileId()).toBe(DEFAULT_PROFILE_ID) // deleting the active profile switches to a remaining one
    expect(JSON.parse(localStorage.getItem('peloton-hud:active-profile')!)).toBe(DEFAULT_PROFILE_ID) // and the stored id is updated, not left stale
  })

  it('never deletes the last profile', () => {
    deleteProfile(DEFAULT_PROFILE_ID)
    expect(loadProfiles()).toHaveLength(1)
  })

  it('renames a profile in place', () => {
    renameProfile(DEFAULT_PROFILE_ID, 'Alex')
    expect(loadProfiles()[0].name).toBe('Alex')
    expect(activeProfile().name).toBe('Alex')
  })
})
