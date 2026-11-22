# Embedded rides: scenic and instructional

A rides mode inside the HUD — pick a **scenic** route to ride along to, or an **instructional / structured** workout that drives you
through targets — all open-source, no subscription, no extra app. Live stats stay on top the whole time and the ride records as normal.

## Two kinds, two mechanisms

### Scenic rides — reuse the YouTube player
A scenic ride is just a route POV video played on the existing stage with the stats overlay. No new player: a scenic ride is a
`{ title, videoId }` and tapping it calls `media.openYouTube(videoId, title)`, so it flows through the same embed, overlay and recording we
already have. The catalog is a plain curated list (`src/rides/rides.ts`) of open / Creative-Commons route videos (and the owner can add their
own). This is why scenic needs almost no new code — it is a themed shortcut into YouTube.

### Instructional rides — a native-to-the-HUD workout player
A structured workout is a sequence of timed segments, each with a target (as a % of FTP, or a cadence/resistance cue). The player shows the
current target vs your live power, time left in the segment, and what's next, over the same stats bar. It is fully embedded — no external app,
works offline.

- **Open format:** the workout file is Zwift's `.zwo` XML (an open, ubiquitous format). `parseZwo(xml)` turns it into a `Workout` of
  `WorkoutSegment`s. Pure and unit-testable (belongs beside the other pure code; see CLAUDE.md), so the player stays thin.
- **Targets → watts:** a segment's `targetFtpPct` × the rider's `ftpWatts` (from settings) gives the target watts; the player compares to
  live power and colours in/under/over. With no FTP set, it shows cadence/resistance cues only.
- **Recording:** unchanged — the recorder already runs off the sample stream; a workout just adds an on-screen target layer.

## Scaffolding in this change

- `src/rides/rides.ts`: `ScenicRide`, `Workout`, `WorkoutSegment` types; a `parseZwo` pure parser; a small starter catalog
  (`SCENIC_RIDES`, `WORKOUTS`).
- `src/ui/RidesView.tsx`: a stub screen that lists scenic rides (→ `openYouTube`) and workouts (→ a workout player, itself a stub for now).

Not yet wired into the app shell or the home screen — that is the next step (a **Rides** button on the home screen, a `rides` branch in
`App.tsx`, and the workout player built out). Kept separate so the Kindle build lands first.

## Build order (after Kindle)

1. Flesh out `parseZwo` + tests against a couple of real `.zwo` files; a `WorkoutPlayer` that ticks segments off the ride clock and renders
   target-vs-actual over the stats bar.
2. Wire `RidesView` into `App.tsx` and add a **Rides** button to the home screen (next to YouTube / Netflix / Kindle).
3. Fill the catalog: a handful of scenic route videos and 3–4 starter workouts (recovery, endurance, intervals, FTP test).
4. Later: import a `.zwo` the rider supplies (same spirit as the YouTube subscription import); a simple scenic-route recorder.

## Alternatives considered

- **qdomyos-zwift / external trainer apps** (mentioned in SOFTWARE-PLAN Phase 2): they read the Peloton bike and rebroadcast it as a
  Bluetooth trainer for Zwift etc. Powerful, but it is a separate app and a different use case (ride *other* apps), not something embedded in
  this HUD. Keep it as a Phase-2 option, not part of this embedded rides mode.
