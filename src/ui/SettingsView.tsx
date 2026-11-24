import { useEffect, useReducer, useState, type FocusEvent } from 'react'
import { getBridge } from '../bridge'
import type { useRide } from '../ride/useRide'
import { useSensors } from './useSensors'
import { useInstalledApps, useDeviceInfo, useAllInstalledApps, type InstalledApp } from '../media/useApps'
import { MEDIA_APPS, loadDisabledApps, setAppEnabled } from '../media/apps'
import { useCustomApps, addCustomApp, removeCustomApp, markForName } from '../media/customApps'
import { ScreenHeader } from './ScreenHeader'
import { kgFromLb, lbFromKg } from './stats'
import { activeProfileId, addProfile, deleteProfile, loadProfiles, renameProfile, setActiveProfile, subscribeProfiles } from '../ride/profiles'

// Keep a focused field above the on-screen keypad: the HUD runs full screen, so the IME would otherwise cover it. The delay lets the
// keyboard finish animating in (and the shell finish shrinking the WebView) before we scroll.
const keepInView = (e: FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget
  setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
}

/**
 * The settings screen — rider profiles, weight, FTP, units, which apps show on the home screen, the sensor source, and the way out of the
 * HUD — reached from the gear button in the home header, with a Back that returns to the HUD. Its own screen (not an inline panel) so the
 * home dashboard stays about the ride. Shares the `.settings` styles.
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
        <ProfilesSettings recording={ride.state === 'active' || ride.state === 'paused'} />
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
        <SensorSettings recording={ride.state === 'active' || ride.state === 'paused'} />
        <DeviceSettings recording={ride.state === 'active' || ride.state === 'paused'} />
      </div>
    </main>
  )
}

/**
 * Rider profiles: keep separate bike stats (weight, FTP) and separate ride history on one bike. A profile is just a name; the rest of this
 * screen (weight, FTP, units) and the saved rides belong to whichever profile is active. Switching is blocked mid-ride (it would swap the
 * numbers out from under a running recorder). Media apps and their sign-ins are not affected — those live in the apps' own accounts.
 */
function ProfilesSettings({ recording }: { recording: boolean }) {
  // Derive profiles + active id straight from storage on every render, and re-render whenever they change (here or from useRide). Keeping no
  // separate copy avoids the state drifting out of sync with the real active profile — a drift that could point Delete at the wrong one.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeProfiles(bump), [])
  const profiles = loadProfiles()
  const active = activeProfileId()
  const activeProfile = profiles.find((p) => p.id === active)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [editName, setEditName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const confirmDelete = pendingDelete !== null && pendingDelete === active

  const switchTo = (id: string) => {
    if (recording || id === active) return
    setActiveProfile(id) // notifies: this component and useRide both reload the now-active profile
  }
  const add = () => {
    const name = newName.trim()
    if (!name) return
    addProfile(name) // becomes active (starts with its own empty stats + history)
    setNewName('')
    setAdding(false)
  }

  return (
    <div className="settings-section">
      <span className="settings-heading">Profile</span>
      <p className="settings-note">Keep separate weight, FTP and ride history per rider. Switching changes only your bike stats — not the apps or their sign-ins.</p>
      <div className="profile-row">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={p.id === active ? 'profile-chip active' : 'profile-chip'}
            disabled={recording && p.id !== active}
            aria-pressed={p.id === active}
            onClick={() => switchTo(p.id)}
          >
            {p.name}
          </button>
        ))}
        {!adding && (
          <button type="button" className="profile-chip add" disabled={recording} onClick={() => setAdding(true)}>
            + New rider
          </button>
        )}
      </div>
      {adding && (
        <div className="profile-edit">
          <input
            type="text"
            value={newName}
            placeholder="Name"
            autoFocus
            maxLength={24}
            onFocus={keepInView}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" className="ghost" onClick={add}>
            Add
          </button>
          <button type="button" className="link" onClick={() => { setAdding(false); setNewName('') }}>
            Cancel
          </button>
        </div>
      )}
      {renaming && activeProfile ? (
        <div className="profile-edit">
          <input
            type="text"
            value={editName}
            placeholder="Name"
            autoFocus
            maxLength={24}
            onFocus={keepInView}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (renameProfile(active, editName), setRenaming(false))}
          />
          <button type="button" className="ghost" onClick={() => { renameProfile(active, editName); setRenaming(false) }}>
            Save
          </button>
          <button type="button" className="link" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        !adding &&
        activeProfile && (
          <>
            <div className="settings-actions">
              <button type="button" className="link" onClick={() => { setEditName(activeProfile.name); setRenaming(true) }}>
                Rename “{activeProfile.name}”
              </button>
              {profiles.length > 1 && !confirmDelete && (
                <button type="button" className="link" disabled={recording} onClick={() => setPendingDelete(active)}>
                  Delete
                </button>
              )}
            </div>
            {confirmDelete && (
              <p className="settings-note vwarn profile-confirm">
                Delete “{activeProfile.name}” and its saved rides? This can’t be undone.
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    if (pendingDelete) deleteProfile(pendingDelete) // the exact profile shown; switches away + useRide reloads
                    setPendingDelete(null)
                  }}
                >
                  Delete
                </button>
                <button type="button" className="link" onClick={() => setPendingDelete(null)}>
                  Cancel
                </button>
              </p>
            )}
          </>
        )
      )}
    </div>
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
  const custom = useCustomApps()
  const [adding, setAdding] = useState(false)
  // Packages already on the home screen (catalog + added), so the picker only offers apps that aren't there yet.
  const onScreen = new Set<string>([...MEDIA_APPS.map((a) => a.pkg), ...custom.map((a) => a.pkg)])
  return (
    <div className="settings-section">
      <span className="settings-heading">Apps</span>
      <p className="settings-note">
        {installed === null
          ? 'Checking which apps are installed…'
          : 'The media apps that get a button on the home screen. Sideload an app and it appears here to turn on. Only Netflix comes on the bike — add any other app below.'}
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
        {/* Apps the rider added themselves — any sideloaded APK, not just the catalog. Removing takes the tile off the home screen (the app
            stays installed). */}
        {custom.map((a) => (
          <li key={a.pkg} className="apps-row">
            <label>
              <input type="checkbox" checked readOnly />
              <span>{a.name}</span>
            </label>
            <button type="button" className="link" onClick={() => removeCustomApp(a.pkg)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="link add-app-toggle" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
        {adding ? 'Done' : '+ Add an app'}
      </button>
      {adding && <AppPicker onScreen={onScreen} onAdd={(a) => addCustomApp({ pkg: a.pkg, name: a.label, icon: a.icon })} />}
    </div>
  )
}

/**
 * The "Add an app" picker: every launchable app on the device (from the shell) that isn't already on the home screen, so a rider can put any
 * sideloaded app on the HUD — the launcher isn't limited to the built-in catalog. Each row shows the app's real icon (or a derived mark) and
 * its name. Mounted only while open, so the heavier queryInstalledApps (which rasterizes every icon) runs only when the rider asks to add one.
 */
function AppPicker({ onScreen, onAdd }: { onScreen: Set<string>; onAdd: (a: InstalledApp) => void }) {
  const all = useAllInstalledApps()
  const [added, setAdded] = useState<Set<string>>(new Set())
  if (all === null) return <p className="settings-note dim">Reading installed apps…</p>
  const candidates = all.filter((a) => !onScreen.has(a.pkg))
  if (!candidates.length) return <p className="settings-note dim">Every installed app is already on the home screen.</p>
  return (
    <ul className="apps-list picker">
      {candidates.map((a) => (
        <li key={a.pkg} className="apps-row">
          <span className="picker-app">
            {a.icon ? <img className="picker-icon" src={a.icon} alt="" aria-hidden="true" /> : <span className="picker-mark">{markForName(a.label)}</span>}
            <span>{a.label}</span>
          </span>
          {added.has(a.pkg) ? (
            <span className="dim">Added</span>
          ) : (
            <button
              type="button"
              className="link"
              onClick={() => {
                onAdd(a)
                setAdded((s) => new Set(s).add(a.pkg))
              }}
            >
              Add
            </button>
          )}
        </li>
      ))}
    </ul>
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
