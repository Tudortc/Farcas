import { useAppearance } from '../theme.js'
import type { ThemeId, Density } from '../theme.js'
import { NotificationsToggle } from './NotificationsToggle.js'

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'shimmer', label: 'Shimmer' },
]

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
]

export function AppearanceMenu() {
  const theme = useAppearance((s) => s.theme)
  const density = useAppearance((s) => s.density)
  const setTheme = useAppearance((s) => s.setTheme)
  const setDensity = useAppearance((s) => s.setDensity)

  return (
    <div className="appearance-menu" aria-label="Appearance settings">
      <div className="appearance-section">
        <div className="appearance-label">Theme</div>
        <div className="appearance-row" role="group" aria-label="Select theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`appearance-btn${theme === t.id ? ' on' : ''}`}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              title={`Theme ${t.label}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-section">
        <div className="appearance-label">Density</div>
        <div className="density" role="group" aria-label="Select density">
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={density === d.id ? 'on' : undefined}
              onClick={() => setDensity(d.id)}
              aria-pressed={density === d.id}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-section">
        <div className="appearance-label">Notifications</div>
        <NotificationsToggle />
      </div>
    </div>
  )
}
