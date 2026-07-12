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
  it('renders bool and Classic group headings', () => {
    render(<AppearanceMenu />)
    expect(screen.getByText(/^bool$/i)).toBeInTheDocument()
    expect(screen.getByText(/^classic$/i)).toBeInTheDocument()
  })

  it('renders a card for each catalog theme', () => {
    render(<AppearanceMenu />)
    expect(screen.getByRole('radio', { name: /dracula/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /solarized light/i })).toBeInTheDocument()
  })

  it('clicking a theme card sets the theme and data-theme', () => {
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByRole('radio', { name: /gruvbox dark/i }))
    expect(useAppearance.getState().theme).toBe('gruvbox-dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('gruvbox-dark')
  })

  it('clicking the default "Terminal" theme clears data-theme', () => {
    useAppearance.setState({ theme: 'dracula', density: 'compact' })
    document.documentElement.setAttribute('data-theme', 'dracula')
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByRole('radio', { name: /^terminal$/i }))
    expect(useAppearance.getState().theme).toBe('a')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
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

  it('renders a sign-out button that calls signOut', async () => {
    const spy = vi.spyOn(authClient, 'signOut').mockResolvedValue({} as any)
    render(<AppearanceMenu />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(spy).toHaveBeenCalled()
  })
})
