import type { Bridge, RideState, ShellMessage, WebCommand } from './types'

type Every = (fn: () => void, ms: number) => () => void

const realEvery: Every = (fn, ms) => {
  const id = setInterval(fn, ms)
  return () => clearInterval(id)
}

/**
 * A pretend bike for a laptop browser and for tests: the same messages the Android shell sends, from an interval-style ride
 * (steady, then a hard minute every five). `now` and `every` are injectable so tests can drive it without real time.
 */
export function simulatedBridge(opts: { now?: () => number; every?: Every } = {}): Bridge {
  const now = opts.now ?? Date.now
  const every = opts.every ?? realEvery
  const listeners = new Set<(m: ShellMessage) => void>()
  const emit = (m: ShellMessage) => listeners.forEach((l) => l(m))
  let state: RideState = 'idle'
  let rideId = ''
  let elapsed = 0
  let stop: (() => void) | null = null

  const tick = () => {
    const pedaling = state === 'active'
    if (pedaling) elapsed++
    const hard = pedaling && elapsed % 300 >= 240
    const resistance = hard ? 55 : 38
    const cadence = pedaling ? (hard ? 95 : 82) + Math.round(Math.sin(elapsed / 7) * 3) : 0
    const power = pedaling ? Math.round(cadence * resistance * 0.052) : 0
    emit({ type: 'sample', t: now(), power, cadence, resistance, hr: pedaling ? (hard ? 155 : 135) : 72 })
  }
  // Settings → Sensor in the browser: a pretend Bluetooth scan that finds one power meter after a moment.
  let sensor = { id: 'internal', name: 'Simulated bike' }
  let found: { id: string; name: string; kind: 'power' | 'cadence' }[] = []
  const emitSensors = (scanning = false) =>
    emit({ type: 'sensors', current: sensor.id, currentName: sensor.name, scanning, devices: found })

  const setState = (next: RideState) => {
    const startedAt = next === 'active' && state === 'idle' ? now() : undefined
    state = next
    emit({ type: 'ride', rideId, state, ...(startedAt === undefined ? {} : { startedAt }) })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!stop) {
        stop = every(tick, 1000)
        queueMicrotask(() => {
          emit({ type: 'hello', shellVersion: 'simulated', device: 'browser', sensor: 'simulated', android: '11', abi: 'arm64-v8a' })
          emitSensors()
        })
      }
      return () => {
        listeners.delete(listener)
        if (!listeners.size && stop) {
          stop()
          stop = null
        }
      }
    },
    send(command: WebCommand) {
      if (command.type === 'startRide' && (state === 'idle' || state === 'done')) {
        state = 'idle'
        rideId = `sim-${now()}`
        elapsed = 0
        setState('active')
      } else if (command.type === 'pauseRide' && state === 'active') setState('paused')
      else if (command.type === 'resumeRide' && state === 'paused') setState('active')
      else if (command.type === 'endRide' && (state === 'active' || state === 'paused')) setState('done')
      else if (command.type === 'scanSensors') {
        found = []
        emitSensors(true)
        setTimeout(() => {
          found = [{ id: 'SI:MU:LA:TE:D0:01', name: 'Simulated power meter', kind: 'power' }]
          emitSensors(false)
        }, 1500)
      } else if (command.type === 'useSensor') {
        sensor = command.id === 'internal' ? { id: 'internal', name: 'Simulated bike' } : { id: command.id, name: command.name || command.id }
        emitSensors()
      } else if (command.type === 'queryApps') {
        // Pretend every catalog app is installed, so the home screen's app buttons are testable in the browser.
        emit({ type: 'apps', installed: command.pkgs })
      }
    },
  }
}
