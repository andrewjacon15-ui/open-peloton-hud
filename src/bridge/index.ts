import { androidBridge, insideShell } from './android'
import { simulatedBridge } from './simulated'
import type { Bridge } from './types'

export type { Bridge, RideState, Sample, SensorSource, ShellMessage, WebCommand } from './types'

let bridge: Bridge | null = null

/** One bridge per page: the Android shell's when running on the bike, a simulated bike anywhere else (or with ?sim). */
export function getBridge(): Bridge {
  if (!bridge) {
    const forceSim = new URLSearchParams(location.search).has('sim')
    bridge = insideShell() && !forceSim ? androidBridge() : simulatedBridge()
  }
  return bridge
}
