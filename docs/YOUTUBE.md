# YouTube in the HUD (open-source, no Google)

The HUD browses and plays YouTube from inside its own page, so your ride stats stay on the top bar the whole time. There is no Google
account, no Play Services (the bike has none) and no API key.

## How it works

- **Browsing** (search, trending, your subscription feed) goes through public **Piped** and **Invidious** instances — open-source YouTube
  front-ends with keyless JSON APIs. The client (`src/media/youtubeApi.ts`) normalizes both into one `Video` shape and fails over down a
  list of instances, because any single public instance is often slow or down.
- **Playback** uses the YouTube IFrame embed (`youtube-nocookie.com`, `src/media/youtube.ts`). This is the most reliable path in the bike's
  WebView (confirmed on the bike), so the instances only ever supply metadata, never the video stream. Autoplay works because the shell sets
  `mediaPlaybackRequiresUserGesture = false`.

### Keeping instances fresh

Public instances rot. The list is `PROVIDERS` in `src/media/youtubeApi.ts` — plain objects `{ base, kind }`. If search/trending stop
working on the bike (its home Wi‑Fi usually reaches more hosts than a locked-down network), add current instances from:

- Piped: <https://piped-instances.kavin.rocks/> (use the **API** URL, e.g. `https://pipedapi.…`).
- Invidious: <https://api.invidious.io/> (the instance base, e.g. `https://yewtu.be`).

The instance must allow cross-origin requests (CORS) from the app's origin, or the fetch fails like a dead host. The first instance that returns results is remembered (persisted to `localStorage`), so a restart starts from a
known-good host. When every instance fails, the thrown error names the hosts tried and the full per-host reasons go to the console
(`npm run bike -- logs`).

Probe results 2026-11-04 (from a laptop, not the bike — the bike's Wi‑Fi may reach more): **live** `https://pipedapi.ducks.party`,
`https://api.piped.private.coffee` (both Piped). The other `PROVIDERS` entries were down or rate-limiting then but are kept as fallbacks
(they recover, and the bike's network differs). A quick way to re-probe: fetch each base's `/trending?region=US` (Piped) or
`/api/v1/trending?region=US` (Invidious) and keep the ones returning a JSON array.

## Porting your subscriptions over

We can't read your Google account, so bring your channel list across once. After that the **Subscriptions** tab shows a combined feed of
your channels' latest videos — still no login. (We build it by fetching each channel's recent uploads and merging them newest-first, not
via Piped's `/feed/unauthenticated` endpoint: that one only returns the last day or so and only for channels the instance has already
cached, so for a real list it came back nearly empty — 4–17 items for 238 channels. See `subscriptionFeed` in `youtubeApi.ts`.)

1. Go to **Google Takeout** → <https://takeout.google.com/> → deselect all → select **YouTube and YouTube Music** → "All YouTube data
   included" → keep only **subscriptions** → export. (Or in NewPipe/Piped: export your subscriptions `.json`.)
2. Open the download; you want `subscriptions.csv` (columns `Channel Id, Channel Url, Channel Title`).
3. In the HUD: home screen → **Settings** → **YouTube subscriptions** → **Manage** → paste the CSV, or "Choose a file…". It's parsed to
   channel ids and saved on that device. The ride browser only *views* the feed (the **Subscriptions** tab, shown by default); it has no
   management controls.

The importer (`src/media/subscriptions.ts`) also accepts a NewPipe/Piped `.json` export or channel links/ids pasted one per line.

### Baking your feed into your own build (optional)

localStorage is per-device, so importing on a laptop does **not** carry to the bike. If you build the APK yourself, you can have the feed
ready on first run with nothing to import on the bike: create `src/media/defaultSubscriptions.local.ts` (gitignored, never committed):

```ts
import type { Channel } from './subscriptions'
export const DEFAULT_SUBSCRIPTIONS: Channel[] = [{ id: 'UC…', name: '…' }]
```

Fill it from the same Takeout `subscriptions.csv` (the `Channel Id` and `Channel Title` columns), then rebuild. The prebuilt release APK
ships with an empty list.

> To the owner: send me your `subscriptions.csv` (or your list of channels) and I'll bake it into `defaultSubscriptions.ts` so the bike
> boots with your feed. That's the one step I can't do for you — it's gated behind your Google login.
