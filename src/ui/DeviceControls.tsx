import { useEffect, useMemo, useState } from 'react'
import { getBridge } from '../bridge'

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
)

const BrightnessIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
)

/**
 * Volume and screen-brightness sliders — the controls the Peloton bar used to give, now that the HUD runs full screen. The shell applies
 * each change to the device and echoes the real levels back (a `levels` message), which also seeds these on load and keeps them in sync when
 * the hardware volume keys are used while media plays. On a laptop the simulated bridge sends no levels, so they sit at their defaults and
 * the sends are harmless no-ops. The same component serves the home screen and the compact popout in the ride bar, so both show the one
 * real device level.
 */
export function DeviceControls({ compact = false }: { compact?: boolean } = {}) {
  const bridge = useMemo(() => getBridge(), [])
  const [volume, setVolume] = useState(0.5)
  const [brightness, setBrightness] = useState(0.5)

  useEffect(() => {
    return bridge.subscribe((m) => {
      if (m.type !== 'levels') return
      setVolume(m.volume)
      setBrightness(m.brightness)
    })
  }, [bridge])

  return (
    <section className={compact ? 'device-controls compact' : 'device-controls'} aria-label="Volume and brightness">
      <label className="ctrl">
        <span className="ctrl-ico">
          <VolumeIcon />
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={volume}
          aria-label="Volume"
          onChange={(e) => {
            const level = Number(e.target.value)
            setVolume(level)
            bridge.send({ type: 'setVolume', level })
          }}
        />
      </label>
      <label className="ctrl">
        <span className="ctrl-ico">
          <BrightnessIcon />
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={brightness}
          aria-label="Brightness"
          onChange={(e) => {
            const level = Number(e.target.value)
            setBrightness(level)
            bridge.send({ type: 'setBrightness', level })
          }}
        />
      </label>
    </section>
  )
}
