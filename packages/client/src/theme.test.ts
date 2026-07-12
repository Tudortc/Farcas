import { describe, it, expect, beforeEach } from 'vitest'
import { applyAppearance } from './theme.js'
import { THEME_CATALOG } from './theme-catalog.js'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-density')
})

describe('theme catalog', () => {
  it('has 14 themes with unique ids', () => {
    expect(THEME_CATALOG).toHaveLength(14)
    expect(new Set(THEME_CATALOG.map((t) => t.id)).size).toBe(14)
  })
  it('groups into bool and classic', () => {
    expect(THEME_CATALOG.some((t) => t.group === 'bool')).toBe(true)
    expect(THEME_CATALOG.some((t) => t.group === 'classic')).toBe(true)
  })
  it('every theme has a non-empty swatch', () => {
    for (const t of THEME_CATALOG) expect(t.swatch.length).toBeGreaterThanOrEqual(4)
  })
})

describe('applyAppearance', () => {
  it('clears data-theme for the default theme "a"', () => {
    document.documentElement.setAttribute('data-theme', 'dracula')
    applyAppearance('a', 'compact')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })
  it('sets data-theme for every non-default slug', () => {
    for (const t of THEME_CATALOG.filter((t) => t.id !== 'a')) {
      applyAppearance(t.id, 'comfortable')
      expect(document.documentElement.getAttribute('data-theme')).toBe(t.id)
    }
  })
})
