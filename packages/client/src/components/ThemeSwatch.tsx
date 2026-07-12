import type { ThemeMeta } from '../theme-catalog.js'

export interface ThemeSwatchProps {
  theme: ThemeMeta
  selected: boolean
  onSelect: (id: ThemeMeta['id']) => void
}

export function ThemeSwatch({ theme, selected, onSelect }: ThemeSwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`theme-swatch${selected ? ' on' : ''}`}
      onClick={() => onSelect(theme.id)}
      title={theme.label}
    >
      <span className="chips" aria-hidden="true">
        {theme.swatch.map((c, i) => (
          <span key={i} className="chip" style={{ background: c }} />
        ))}
      </span>
      <span className="theme-swatch-label">{theme.label}</span>
    </button>
  )
}
