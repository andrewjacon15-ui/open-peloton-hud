import { useState, type FocusEvent } from 'react'
import { getBridge } from '../bridge'
import type { useRide } from '../ride/useRide'
import { useSensors } from './useSensors'
import { useInstalledApps, useDeviceInfo } from '../media/useApps'
import { MEDIA_APPS, loadDisabledApps, setAppEnabled } from '../media/apps'
import { SubscriptionsSettings } from '../media/SubscriptionsSettings'
import { ScreenHeader } from './ScreenHeader'
import { kgFromLb, lbFromKg } from './stats'

// Keep a focused field above the on-screen keypad: the HUD runs full screen, so the IME would otherwise cover it. The delay lets the
// keyboard finish animating in (and the shell finish shrinking the WebView) before we scroll.
const keepInView = (e: FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}

/**
 * The settings screen — weight, FTP, units and YouTube subscriptions — reached from the gear button in the home header, with a Back that
 * returns to the HUD. Its own screen (not an inline panel) so the home dashboard stays about the ride. Shares the `.settings` styles.
 */
export function SettingsView({ ride, onBack }: { ride: ReturnType<typeof useRide>; onBack: () => void }) {
  const s = ride.settings
  // Weight is stored in kg (the metric math's unit) but shown/entered in the chosen unit, lbs by default.
  const weightUnit = s.weightUnit ?? 'lb'
  const weightShown = s.weightKg == null ? '' : String(Math.round(weightUnit === 'lb' ? lbFromKg(s.weightKg) : s.weightKg))
  return (
    <main className="app settings">
      <ScreenHeader title="Settings" onBack={onBack} />

      <div className="settings-body">
        <label>
          Weight
          <div className="weight-row">
            <input
              type="number"
              inputMode="decimal"
              value={weightShown}
              onFocus={keepInView}
              onChange={(e) => {
                const v = Number(e.target.value)
                ride.updateSettings({ weightKg: v > 0 ? (weightUnit === 'lb' ? kgFromLb(v) : v) : undefined })
              }}
            />
            <select value={weightUnit} onChange={(e) => ride.updateSettings({ weightUnit: e.target.value as 'lb' | 'kg' })}>
              <option value="lb">lbs</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </label>
        <label>
          FTP (W, optional — enables zones)
          <input type="number" inputMode="numeric" value={s.ftpWatts ?? ''} onFocus={keepInView} onChange={(e) => ride.updateSettings({ ftpWatts: Number(e.target.value) || undefined })} />
        </label>
        <label>
          Units
          <select value={s.units ?? 'imperial'} onChange={(e) => ride.updateSettings({ units: e.target.value as 'imperial' | 'metric' })}>
            <option value="imperial">Miles</option>
            <option value="metric">Kilometers</option>
          </select>
        </label>
        <AppsSettings />
        <div className="settings-section">
          <span className="settings-heading">YouTube subscriptions</span>
          <p className="settings-note">For the in-HUD YouTube player (what the YouTube button opens here, and what guided rides ride over).</p>
          <SubscriptionsSettings />
        </div>
        <SensorSettings recording={ride.state === 'active' || ride.state === 'paused'} />
        <DeviceSettings recording={ride.state === 'active' || ride.state === 'paused'} />
      </div>
    </main>
  )
}

/**
 * Which media apps show a launch button on the home screen. Every known app is listed; only ones the shell reports as installed can be
 * turned on (the rest are greyed with "Not installed" until the owner sideloads them). The home screen and ride screen read the same
 * enabled set, so toggling here updates their buttons. The disabled set is stored in localStorage (src/media/apps.ts).
 */
function AppsSettings() {
  const installed = useInstalledApps()
  const device = useDeviceInfo()
  const [disabled, setDisabled] = useState(loadDisabledApps)
  const toggle = (id: string, enabled: boolean) => setDisabled(new Set(setAppEnabled(id, enabled)))
  return (
    <div className="settings-section">
      <span className="settings-heading">Apps</span>
      <p className="settings-note">
        {installed === null
          ? 'Checking which apps are installed…'
          : 'The media apps that get a button on the home screen. Sideload an app and it appears here to turn on. Only Netflix comes on the bike.'}
      </p>
      {device && (device.abi || device.android) && (
        <p className="settings-note dim">
          This tablet: {device.device}
          {device.android ? ` · Android ${device.android}` : ''}
          {device.abi ? ` · ${device.abi}` : ''} — when sideloading, pick the {device.abi || 'matching'} (or universal) APK for Android {device.android || '11'}+.
        </p>
      )}
      <ul className="apps-list">
        {MEDIA_APPS.map((app) => {
          const nativelyInstalled = installed?.has(app.pkg) ?? false
          const available = app.webPlayer === true || nativelyInstalled
          const enabled = available && !disabled.has(app.id)
          return (
            <li key={app.id} className="apps-row">
              <label>
                <input type="checkbox" checked={enabled} disabled={!available} onChange={(e) => toggle(app.id, e.target.checked)} />
                <span>{app.name}</span>
              </label>
              {!available && installed !== null && <span className="dim">Not installed</span>}
              {app.webPlayer && !nativelyInstalled && <span className="dim">In-app player</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Where live power and cadence come from: the bike's own sensor, or a standard Bluetooth LE power meter / cadence sensor (for a bike whose
 * built-in sensor can't be read, or more accurate power). The shell scans, connects and remembers the choice; a Bluetooth sensor gives
 * power and/or cadence but no resistance. Switching mid-ride would mix two sources in one ride, so it waits until the ride ends.
 */
function SensorSettings({ recording }: { recording: boolean }) {
  const s = useSensors()
  const bridge = getBridge()
  if (!s) return null // an older shell that doesn't report sensors
  const onBluetooth = s.current !== 'internal'
  return (
    <div className="settings-section">
      <span className="settings-heading">Sensor</span>
      <div className="subs-row">
        <span>
          Using: <strong>{s.currentName}</strong>
        </span>
        {onBluetooth && (
          <button type="button" className="link" disabled={recording} onClick={() => bridge.send({ type: 'useSensor', id: 'internal' })}>
            Use the bike's sensor
          </button>
        )}
      </div>
      <div className="settings-actions sensor-actions">
        <button type="button" className="ghost" disabled={recording || s.scanning} onClick={() => bridge.send({ type: 'scanSensors' })}>
          {s.scanning ? 'Scanning…' : 'Find a Bluetooth sensor'}
        </button>
        {s.devices
          .filter((d) => d.id !== s.current)
          .map((d) => (
            <button
              key={d.id}
              type="button"
              className="ghost"
              disabled={recording}
              onClick={() => bridge.send({ type: 'useSensor', id: d.id, name: d.name })}
            >
              Use {d.name} <span className="dim">({d.kind === 'power' ? 'power' : 'cadence only'})</span>
            </button>
          ))}
      </div>
      {s.error && <p className="settings-note verror">{s.error}</p>}
      {!s.error && !s.scanning && s.devices.length === 0 && (
        <p className="settings-note">
          {recording ? 'End your ride first.' : 'Wake the sensor (turn the cranks) before scanning. Resistance shows 0 with a Bluetooth sensor.'}
        </p>
      )}
    </div>
  )
}

/**
 * The way out of the HUD: Peloton's own app, Android Settings (Wi-Fi, apps), and the default-home picker (to switch the bike back to
 * Peloton's launcher without a computer). Leaving mid-ride would freeze the recorder, so these wait until the ride is ended. The same three
 * live on the shell's native recovery screen (hold the top-left corner for 3 seconds), which works even if this page doesn't load.
 */
function DeviceSettings({ recording }: { recording: boolean }) {
  const bridge = getBridge()
  return (
    <div className="settings-section">
      <span className="settings-heading">Device</span>
      <div className="settings-actions">
        <button type="button" className="ghost" disabled={recording} onClick={() => bridge.send({ type: 'openPeloton' })}>
          Open Peloton app
        </button>
        <button type="button" className="ghost" disabled={recording} onClick={() => bridge.send({ type: 'openAndroidSettings' })}>
          Android settings
        </button>
        <button type="button" className="ghost" disabled={recording} onClick={() => bridge.send({ type: 'chooseHomeApp' })}>
          Choose home app
        </button>
      </div>
      <p className="settings-note">
        {recording
          ? 'End your ride first.'
          : 'Press the Home button to come back to the HUD. If this screen ever fails to load, hold the top-left corner for 3 seconds.'}
      </p>
    </div>
  )
}
