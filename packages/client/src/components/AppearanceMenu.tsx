import { useAppearance } from '../theme.js'
import type { Density } from '../theme.js'
import { THEME_CATALOG, type ThemeGroup } from '../theme-catalog.js'
import { ThemeSwatch } from './ThemeSwatch.js'
import { NotificationsToggle } from './NotificationsToggle.js'
import { signOut } from '../auth-client.js'

const DENSITIES: { id: Density; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
]

const GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: 'bool', label: 'bool' },
  { id: 'classic', label: 'Classic' },
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
        {GROUPS.map((g) => (
          <div key={g.id} className="theme-group">
            <div className="theme-group-label">{g.label}</div>
            <div className="theme-grid" role="radiogroup" aria-label={`${g.label} themes`}>
              {THEME_CATALOG.filter((t) => t.group === g.id).map((t) => (
                <ThemeSwatch key={t.id} theme={t} selected={theme === t.id} onSelect={setTheme} />
              ))}
            </div>
          </div>
        ))}
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

      <button
        type="button"
        className="appearance-signout"
        onClick={() => void signOut()}
        style={{ marginTop: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--ink-1)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, padding: '6px 8px' }}
      >
        Sign out
      </button>
    </div>
  )
}
