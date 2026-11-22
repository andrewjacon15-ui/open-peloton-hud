/**
 * The viewer's YouTube channel list, used to build the subscription feed (youtubeApi.ts). We cannot read anyone's Google account, so the
 * list is imported once from the viewer's own export and kept in localStorage. `parseSubscriptions` accepts the three things a person can
 * easily get out of YouTube:
 *   - a Google Takeout `subscriptions.csv` (header `Channel Id, Channel Url, Channel Title`),
 *   - a NewPipe / Piped subscriptions `.json` (`{ subscriptions: [{ url, name }] }`),
 *   - or channel links / ids pasted one per line.
 * Everything is reduced to `UC…` channel ids (the only thing the feed needs). See docs/YOUTUBE.md for the one manual export step.
 *
 * An optional, gitignored `defaultSubscriptions.local.ts` (exporting `DEFAULT_SUBSCRIPTIONS: Channel[]`) seeds the list on first run, so your
 * own build can ship your feed ready-made. It is never committed (it is personal), so a build without it just starts empty.
 */

export interface Channel {
  id: string
  name: string
}

const localDefaults = import.meta.glob<{ DEFAULT_SUBSCRIPTIONS: Channel[] }>('./defaultSubscriptions.local.ts', { eager: true })
const DEFAULT_SUBSCRIPTIONS: Channel[] = Object.values(localDefaults)[0]?.DEFAULT_SUBSCRIPTIONS ?? []

const KEY = 'peloton-hud:subscriptions'
const UC_ONE = /UC[0-9A-Za-z_-]{22}/

function dedupe(channels: Channel[]): Channel[] {
  const byId = new Map<string, Channel>()
  for (const c of channels) {
    if (!UC_ONE.test(c.id)) continue
    const existing = byId.get(c.id)
    // Prefer an entry that carries a name.
    if (!existing || (!existing.name && c.name)) byId.set(c.id, { id: c.id, name: c.name || '' })
  }
  return [...byId.values()]
}

interface NewPipeExport {
  subscriptions?: { url?: string; name?: string }[]
}

/** Parse a Takeout CSV, a NewPipe/Piped JSON, or pasted links/ids into a deduped channel list. Pure. */
export function parseSubscriptions(text: string): Channel[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // NewPipe / Piped JSON export.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json: unknown = JSON.parse(trimmed)
      const subs = Array.isArray(json) ? json : (json as NewPipeExport).subscriptions
      if (Array.isArray(subs)) {
        return dedupe(
          (subs as NonNullable<NewPipeExport['subscriptions']>).map((s) => ({
            id: s.url?.match(UC_ONE)?.[0] ?? '',
            name: (s.name ?? '').trim(),
          })),
        )
      }
    } catch {
      // Not JSON after all — fall through to line parsing.
    }
  }

  // CSV (Takeout) or pasted lines. One channel per line; the id is the UC token, the name is the last comma-field that isn't a url/id.
  const channels: Channel[] = []
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^channel\s*id\s*,/i.test(line)) continue // skip the Takeout header
    const id = line.match(UC_ONE)?.[0]
    if (!id) continue
    const fields = line.split(',').map((f) => f.trim())
    const name = [...fields].reverse().find((f) => f && !f.includes('http') && !UC_ONE.test(f)) ?? ''
    channels.push({ id, name })
  }
  return dedupe(channels)
}

export function loadSubscriptions(): Channel[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Channel[]
  } catch {
    // ignore
  }
  // First run: seed from your local default list, if the build has one.
  return DEFAULT_SUBSCRIPTIONS.length ? dedupe(DEFAULT_SUBSCRIPTIONS) : []
}

export function saveSubscriptions(channels: Channel[]): Channel[] {
  const list = dedupe(channels)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // ignore: the list still works this session
  }
  return list
}

/** Merge newly imported channels into the saved list. Returns the new saved list. */
export function addSubscriptions(imported: Channel[]): Channel[] {
  return saveSubscriptions([...loadSubscriptions(), ...imported])
}

export function clearSubscriptions(): Channel[] {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  return []
}
