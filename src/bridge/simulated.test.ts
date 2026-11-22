import { describe, expect, it } from 'vitest'
import { simulatedBridge } from './simulated'
import type { ShellMessage } from './types'

function harness() {
  let tick = () => {}
  let t = 0
  const bridge = simulatedBridge({
    now: () => t,
    every: (fn) => {
      tick = fn
      return () => {}
    },
  })
  const seen: ShellMessage[] = []
  bridge.subscribe((m) => seen.push(m))
  const advance = (seconds: number) => {
    for (let i = 0; i < seconds; i++) {
      t += 1000
      tick()
    }
  }
  return { bridge, seen, advance }
}

describe('simulatedBridge', () => {
  it('reports zero power until a ride starts, then pedals', () => {
    const { bridge, seen, advance } = harness()
    advance(2)
    expect(seen.every((m) => m.type !== 'sample' || m.power === 0)).toBe(true)
    bridge.send({ type: 'startRide' })
    advance(5)
    const last = seen.at(-1)
    expect(last?.type === 'sample' && last.power > 0 && last.cadence > 0).toBe(true)
  })

  it('follows start, pause, resume, end', () => {
    const { bridge, seen } = harness()
    for (const type of ['startRide', 'pauseRide', 'resumeRide', 'endRide'] as const) bridge.send({ type })
    const states = seen.flatMap((m) => (m.type === 'ride' ? [m.state] : []))
    expect(states).toEqual(['active', 'paused', 'active', 'done'])
    const first = seen.find((m) => m.type === 'ride')
    expect(first?.type === 'ride' && typeof first.startedAt).toBe('number')
  })
})
