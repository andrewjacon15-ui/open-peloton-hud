import { useState } from 'react'
import { addSubscriptions, clearSubscriptions, loadSubscriptions, parseSubscriptions } from './subscriptions'

/**
 * Subscription management, shown in Settings on the home screen (not in the ride browser — that only *views* the feed). Import your
 * channels from a Takeout `subscriptions.csv`, a NewPipe/Piped `.json`, or pasted links; see the current count; or clear and re-import.
 * A build with a local `defaultSubscriptions.local.ts` seeds a list on first run; this is for refreshing or changing it per device.
 */
export function SubscriptionsSettings() {
  const [count, setCount] = useState(() => loadSubscriptions().length)
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const doImport = (raw: string) => {
    const parsed = parseSubscriptions(raw)
    if (!parsed.length) {
      setNote('No channels found. Expecting a Takeout subscriptions.csv, a NewPipe/Piped .json, or channel links.')
      return
    }
    const saved = addSubscriptions(parsed)
    setCount(saved.length)
    setNote(`Imported ${parsed.length} — ${saved.length} channels total.`)
    setText('')
  }

  return (
    <div className="subs-settings">
      <div className="subs-row">
        <span className="dim">{count} subscribed channels</span>
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Manage'}
        </button>
      </div>
      {open && (
        <div className="subs-manage">
          <p className="dim">
            Replace or add to the feed. Export from <strong>Google Takeout → YouTube → subscriptions.csv</strong>, then paste it or choose
            the file.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste subscriptions.csv, a NewPipe/Piped .json, or one channel link per line…"
            rows={5}
          />
          <div className="subs-actions">
            <button className="primary" onClick={() => doImport(text)} disabled={!text.trim()}>
              Import
            </button>
            <label className="filebtn">
              Choose a file…
              <input
                type="file"
                accept=".csv,.json,.txt,text/csv,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => doImport(String(reader.result ?? ''))
                  reader.readAsText(file)
                }}
              />
            </label>
            <button
              className="link"
              onClick={() => {
                clearSubscriptions()
                setCount(0)
                setNote('Cleared.')
              }}
            >
              Clear all
            </button>
          </div>
          {note && <p className="dim">{note}</p>}
        </div>
      )}
    </div>
  )
}
