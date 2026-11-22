import { describe, expect, it } from 'vitest'
import { parseShellMessage } from './types'

describe('parseShellMessage', () => {
  it('accepts well-formed messages, as objects or JSON', () => {
    const sample = { type: 'sample', t: 1, power: 150, cadence: 80, resistance: 40 }
    expect(parseShellMessage(sample)).toEqual(sample)
    expect(parseShellMessage(JSON.stringify(sample))).toEqual(sample)
    expect(parseShellMessage({ type: 'hello', shellVersion: '0.1.0', device: 'PLTN-RB1VQ', sensor: 'affernet' })).not.toBeNull()
  })

  it('accepts a sensors report and rejects a malformed device', () => {
    const report = { type: 'sensors', current: 'internal', currentName: 'Bike', scanning: false, devices: [{ id: 'AA', name: 'P', kind: 'power' }] }
    expect(parseShellMessage(report)).toEqual(report)
    expect(parseShellMessage({ ...report, error: 'Bluetooth is off' })).not.toBeNull()
    expect(parseShellMessage({ ...report, devices: [{ id: 'AA', name: 'P', kind: 'heart' }] })).toBeNull()
    expect(parseShellMessage({ ...report, scanning: 'yes' })).toBeNull()
    expect(parseShellMessage({ type: 'hello', shellVersion: '1', device: 'd', sensor: 'ble' })).not.toBeNull()
  })

  it('accepts an apps report and rejects a non-string entry', () => {
    expect(parseShellMessage({ type: 'apps', installed: ['com.netflix.mediaclient', 'com.amazon.kindle'] })).not.toBeNull()
    expect(parseShellMessage({ type: 'apps', installed: [] })).not.toBeNull()
    expect(parseShellMessage({ type: 'apps', installed: ['ok', 7] })).toBeNull()
    expect(parseShellMessage({ type: 'apps', installed: 'com.netflix.mediaclient' })).toBeNull()
  })

  it('drops anything malformed', () => {
    expect(parseShellMessage('not json')).toBeNull()
    expect(parseShellMessage({ type: 'sample', t: 1, power: 'lots', cadence: 80, resistance: 40 })).toBeNull()
    expect(parseShellMessage({ type: 'sample', t: 1, power: Number.NaN, cadence: 80, resistance: 40 })).toBeNull()
    expect(parseShellMessage({ type: 'ride', rideId: 'x', state: 'flying' })).toBeNull()
    expect(parseShellMessage({ type: 'unknown' })).toBeNull()
    expect(parseShellMessage(null)).toBeNull()
  })
})
