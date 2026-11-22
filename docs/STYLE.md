# Visual style

The HUD should read like a purpose-built piece of training equipment, not a generic dark dashboard. Clean, modern, and unmistakably
Peloton — but restrained. The tokens live in `src/styles.css` (`:root`); this file is the why, so new screens stay coherent.

## Principles

1. **One accent, used with intent.** Peloton red (`--red: #e3202b`) marks exactly three things: the primary action, the active/selected
   state, and *live power* (the number that is the whole point of pedaling). It is never decoration. Everything else is ink on near-black.
2. **Hairlines, not slabs.** Surfaces are defined by 1px lines (`--line`) over a near-black ground, not by big filled grey panels. This is
   what makes it look engineered rather than "AI dark-mode template".
3. **Numbers are the interface.** Metrics are large, `font-variant-numeric: tabular-nums`, tight tracking, weight 600. Labels are small,
   quiet, and get out of the way. A rider reads this from the saddle.
4. **Squared, generous controls.** Buttons are 10px radius (not pills, except the tab/search chrome), with large touch targets (≥44px, the
   primary start control ≥52px) for a sweaty finger on a touchscreen.
5. **Calm motion.** Short, subtle transitions (~120ms) on hover/press only. Nothing animates on its own while a video plays.

## Tokens (`src/styles.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0b` | Page ground (warm near-black, with a faint red radial top-right). |
| `--surface` / `--surface-2` | `#131417` / `#191b1f` | Cards and controls, drawn with a hairline border. |
| `--line` / `--line-strong` | `rgba(255,255,255,.08)` / `.16` | Separators and borders. |
| `--text` / `--muted` / `--dim` | `#f5f6f7` / `#9ca0a8` / `#6b7078` | Primary / secondary / tertiary ink. |
| `--red` / `--red-hi` | `#e3202b` / `#ff2f3a` | The accent and its hover. |
| `--ok` | `#39d98a` | Positive/confirged states (sparingly). |
| `--r` / `--r-lg` | `10px` / `14px` | Control and card radius. |

Type: a deliberate pairing, both self-hosted (`@fontsource-variable/*`) so they work offline on the bike:
- **Oswald** (`--font-display`) for the chrome — wordmark, headings, eyebrow labels, tab and CTA text. A condensed, athletic gothic that
  reads like speedometer / broadcast type; it gives the HUD a sports-equipment identity instead of a generic app look.
- **Archivo** (`--font`) for the metrics and body — a warm grotesque with real tabular figures, so live numbers stay rock-steady while they
  change. Big numbers use heavier weight and slight negative tracking.

Avoid the default geometric sans (Inter, Space Grotesk, Poppins) — they read as "AI template".

## Button roles

- `.primary` — red fill, white text. One per view (Start ride, Search, Import).
- default — surface with a hairline. Secondary actions.
- `.ghost` — transparent with a hairline. In-context actions over media (e.g. "‹ Videos", "Pause").
- `.danger` — transparent with a red outline. Destructive/exit (End ride).
- `.link` — underlined muted text. Tertiary (Settings, Clear & re-import).

## Screens & headers

Two header shapes, and every screen uses one of them — don't hand-roll a third.

- **Home (primary).** `.home-head`: the brand mark + "Peloton HUD" wordmark on the left, and on the right a status line and the settings
  **gear** (`.head-settings`, a 44px bordered surface button). This is the only screen that leads with the brand.
- **Every other screen (secondary).** Render `ScreenHeader` (`src/ui/ScreenHeader.tsx`): a bordered **Back button** (`.back-btn`, a surface
  pill with a chevron — the gear's sibling, *not* an underlined `.link`) + the screen title, with an optional right-hand subtitle. Rides,
  Settings, History and the ride detail all use it, so Back and the title sit in the same place at the same size everywhere.
  - `backLabel` defaults to `"HUD"` (it returns to the home dashboard). Use `"Back"` only when the screen can be reached from more than one
    place (e.g. the ride detail, opened from History or from a home recent-ride row).

New full-screen view → new `view` state in `App.tsx` + a `ScreenHeader` with `onBack` wired to `setView('home')` (or the opener).

## Icons

Line icons, drawn inline as SVG (never an icon font or emoji). `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width="2.2"` (2 for denser glyphs), round caps and joins; they inherit color from the button. Chrome icons render ~18px, CTA/stat
icons ~24px. Keep them geometric and single-weight — they should look like one family (the back chevron, home, sliders and gear all do).

## The ride bar is two halves — change them together

The bar over media exists twice and **must stay pixel-identical**: the web `.obar` (`src/ui/RideView.tsx`, over YouTube / the picker /
workouts) and the native `NetflixOverlay.kt` (drawn over Netflix and Kindle, which run as their own apps). Same stats in the same order
(TIME, POWER in red, CADENCE, RESIST, OUTPUT, CAL), same controls on the right, same near-black ground + hairline, same filled-red Start /
red-ghost Stop. The native side rebuilds the web SVG icons as vector drawables (`res/drawable/ic_obar_*`). Touch one, port the change to the
other in the same commit — a rider switching from YouTube to Netflix should not see the bar change. (The native overlay has no Back — that's
the app's own job — and it can collapse to a handle for reading; those are the only sanctioned differences.)

The **power gauge** is the same deal: `PowerGauge` (web, `src/ui/PowerGauge.tsx`, floating over a video via `GuideOverlay`) and `GaugeView`
(native, drawn over Netflix/Kindle) are one design — same scale, same highlighted band, same green-in/red-out marker. The native one can't read
the web's segment math (the WebView is frozen behind the app), so it walks a flattened plan (`resolvePlan`) itself; keep that walk a thin mirror
of `src/rides/rides.ts`, and change both gauges together.

The **recovery screen** (`RecoveryScreen.kt`) is native on purpose: it must work when the web app doesn't. It uses the same near-black
ground, one filled-red primary (Retry) and ghost buttons with hairline borders. Its actions mirror the Settings → Device section (Open
Peloton app, Android settings, Choose home app); keep the two lists and their wording in step.

## Don'ts

- No all-uppercase body text (tiny eyebrow labels only, and even those sparingly).
- No second accent colour, no gradients-as-decoration beyond the single ground glow.
- No filled red panels or red text runs — red is a spotlight, not a fill.
- No emoji in chrome.
