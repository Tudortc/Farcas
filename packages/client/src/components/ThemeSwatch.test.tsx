import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeSwatch } from './ThemeSwatch.js'
import type { ThemeMeta } from '../theme-catalog.js'

const dracula: ThemeMeta = {
  id: 'dracula', label: 'Dracula', group: 'classic', light: false,
  swatch: ['#282a36', '#44475a', '#f8f8f2', '#bd93f9', '#50fa7b'],
}

describe('ThemeSwatch', () => {
  it('renders the label and one chip per swatch color', () => {
    const { container } = render(<ThemeSwatch theme={dracula} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('Dracula')).toBeInTheDocument()
    expect(container.querySelectorAll('.chip')).toHaveLength(5)
  })
  it('reflects selection via aria-checked', () => {
    render(<ThemeSwatch theme={dracula} selected onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: /dracula/i })).toHaveAttribute('aria-checked', 'true')
  })
  it('calls onSelect with the theme id when clicked', () => {
    const onSelect = vi.fn()
    render(<ThemeSwatch theme={dracula} selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('radio', { name: /dracula/i }))
    expect(onSelect).toHaveBeenCalledWith('dracula')
  })
})
