import type { ReactNode } from 'react'

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

/**
 * The header for every secondary screen (Rides, Settings, History, a ride's detail): a bordered Back button on the left, the screen title,
 * and an optional right slot for a subtitle. The home screen is the one exception — it leads with the brand mark and the settings gear. Using
 * this everywhere else is what keeps the back affordance and the title in the same place, at the same size, on every screen. See docs/STYLE.md.
 */
export function ScreenHeader({ title, onBack, backLabel = 'HUD', right }: { title: string; onBack: () => void; backLabel?: string; right?: ReactNode }) {
  return (
    <header className="screen-head">
      <div className="screen-head-left">
        <button className="back-btn" onClick={onBack} aria-label={`Back to ${backLabel}`}>
          <ChevronLeftIcon />
          <span>{backLabel}</span>
        </button>
        <h1>{title}</h1>
      </div>
      {right ? <div className="screen-head-right muted">{right}</div> : null}
    </header>
  )
}
