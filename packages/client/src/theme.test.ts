import { describe, it, expect, beforeEach } from 'vitest'
import { applyAppearance, useAppearance } from './theme.js'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-density')
  localStorage.clear()
  useAppearance.setState({ theme: 'a', density: 'compact' })
})

describe('appearance', () => {
  it('applies theme + density to <html>', () => {
    applyAppearance('c', 'comfortable')
    expect(document.documentElement.getAttribute('data-theme')).toBe('c')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })
  it('setTheme updates the store and the DOM and persists', () => {
    useAppearance.getState().setTheme('shimmer')
    expect(useAppearance.getState().theme).toBe('shimmer')
    expect(document.documentElement.getAttribute('data-theme')).toBe('shimmer')
    expect(localStorage.getItem('bool.theme')).toBe('shimmer')
  })
  it('default theme "a" applies no data-theme attribute (it is :root)', () => {
    applyAppearance('a', 'compact')
    expect(document.documentElement.getAttribute('data-theme')).toBe(null)
  })
})
