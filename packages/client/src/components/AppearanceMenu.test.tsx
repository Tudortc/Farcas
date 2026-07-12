import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAppearance } from '../theme.js'

vi.mock('../auth-client.js', () => ({
  signOut: vi.fn().mockResolvedValue({}),
}))

import * as authClient from '../auth-client.js'
import { AppearanceMenu } from './AppearanceMenu.js'

beforeEach(() => {
  useAppearance.setState({ theme: 'a', density: 'compact' })
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.setAttribute('data-density', 'compact')
})

describe('AppearanceMenu', () => {
  it('renders theme and density controls', () => {
    render(<AppearanceMenu />)
    expect(screen.getByText(/comfortable/i)).toBeInTheDocument()
    expect(screen.getByText(/compact/i)).toBeInTheDocument()
    expect(screen.getByText(/shimmer/i, { exact: false })).toBeInTheDocument()
  })

  it('clicking Comfortable sets density to comfortable and updates data-density', () => {
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/comfortable/i))
    expect(useAppearance.getState().density).toBe('comfortable')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })

  it('clicking Compact sets density to compact and updates data-density', () => {
    useAppearance.setState({ theme: 'a', density: 'comfortable' })
    document.documentElement.setAttribute('data-density', 'comfortable')
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/^compact$/i))
    expect(useAppearance.getState().density).toBe('compact')
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')
  })

  it('clicking Shimmer sets theme to shimmer and updates data-theme', () => {
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/shimmer/i))
    expect(useAppearance.getState().theme).toBe('shimmer')
    expect(document.documentElement.getAttribute('data-theme')).toBe('shimmer')
  })

  it('clicking theme A removes data-theme attribute (default theme)', () => {
    useAppearance.setState({ theme: 'shimmer', density: 'compact' })
    document.documentElement.setAttribute('data-theme', 'shimmer')
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/^A$/i))
    expect(useAppearance.getState().theme).toBe('a')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('clicking theme B sets data-theme to b', () => {
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/^B$/i))
    expect(useAppearance.getState().theme).toBe('b')
    expect(document.documentElement.getAttribute('data-theme')).toBe('b')
  })

  it('clicking theme C sets data-theme to c', () => {
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByText(/^C$/i))
    expect(useAppearance.getState().theme).toBe('c')
    expect(document.documentElement.getAttribute('data-theme')).toBe('c')
  })

  it('renders a sign-out button that calls signOut', async () => {
    const spy = vi.spyOn(authClient, 'signOut').mockResolvedValue({} as any)
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(spy).toHaveBeenCalled()
  })
})
