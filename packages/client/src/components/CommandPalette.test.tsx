import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react'
import { useChat, targetKey } from '../store/chat-store.js'
import { useAppearance } from '../theme.js'
import { CommandPalette, usePaletteShortcut } from './CommandPalette.js'

// Seed store helper
function seedStore() {
  useChat.setState({
    networks: {
      1: { id: 1, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'dmf', connected: true },
      2: { id: 2, name: 'OFTC', host: 'irc.oftc.net', nick: 'dmf', connected: true },
    },
    targets: {
      [targetKey(1, '#python')]: {
        networkId: 1,
        target: '#python',
        kind: 'channel',
        unread: 0,
      },
      [targetKey(1, '#archlinux')]: {
        networkId: 1,
        target: '#archlinux',
        kind: 'channel',
        unread: 3,
      },
      [targetKey(2, 'alice')]: {
        networkId: 2,
        target: 'alice',
        kind: 'pm',
        unread: 0,
      },
    },
    selected: null,
    connection: 'open',
    messages: {},
    readMarkers: {},
    searchResults: null,
  })
}

beforeEach(() => {
  useChat.setState((useChat as any).getInitialState?.() ?? {}, true)
  useAppearance.setState({ theme: 'a', density: 'compact' })
})

describe('CommandPalette', () => {
  it('renders channel items from seeded store when open', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByText('#python')).toBeInTheDocument()
    expect(screen.getByText('#archlinux')).toBeInTheDocument()
  })

  it('renders DM items from seeded store when open', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('shows network tags on channel items', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    // Network tags should appear (may be multiple Libera.Chat tags)
    const tags = screen.getAllByText('Libera.Chat')
    expect(tags.length).toBeGreaterThanOrEqual(1)
  })

  it('shows action items when open', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByText('Search messages…')).toBeInTheDocument()
    expect(screen.getByText(/Toggle density/i)).toBeInTheDocument()
  })

  it('filters channels via typed search — exact match "archlinux" filters to that channel', async () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/Jump to a channel/i)
    // Use a very specific term that only matches #archlinux and not #python
    fireEvent.change(input, { target: { value: 'archlinux' } })
    // #archlinux should score highly; verify it appears in a cmdk item
    await waitFor(() => {
      expect(screen.queryByText('#archlinux')).toBeInTheDocument()
    })
    // "alice" (the pm) should score 0 for "archlinux" — verify it's gone from cmdk items
    const allCmdkItems = document.querySelectorAll('[cmdk-item=""]')
    const aliceInItems = Array.from(allCmdkItems).some((el) =>
      el.textContent?.includes('alice') && !el.textContent?.includes('archlinux'),
    )
    expect(aliceInItems).toBe(false)
  })

  it('clicking a channel item calls select() and triggers onClose', () => {
    seedStore()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)
    const pythonItem = screen.getByText('#python')
    fireEvent.click(pythonItem)
    expect(useChat.getState().selected).toBe(targetKey(1, '#python'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking a DM item calls select() and triggers onClose', () => {
    seedStore()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)
    const dmItem = screen.getByText('alice')
    fireEvent.click(dmItem)
    expect(useChat.getState().selected).toBe(targetKey(2, 'alice'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render any items when closed', () => {
    seedStore()
    render(<CommandPalette open={false} onClose={() => {}} />)
    expect(screen.queryByText('#python')).not.toBeInTheDocument()
    expect(screen.queryByText('#archlinux')).not.toBeInTheDocument()
  })

  it('calls onClose when ESC is pressed', () => {
    seedStore()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)
    const input = screen.getByPlaceholderText(/Jump to a channel/i)
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('toggle density action changes density in store', () => {
    seedStore()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)
    const densityItem = screen.getByText(/Toggle density/i)
    fireEvent.click(densityItem)
    expect(useAppearance.getState().density).toBe('comfortable')
  })

  it('dispatches bool:open-search event when Search messages is clicked', () => {
    seedStore()
    const handler = vi.fn()
    document.addEventListener('bool:open-search', handler)
    render(<CommandPalette open onClose={() => {}} />)
    const searchItem = screen.getByText('Search messages…')
    fireEvent.click(searchItem)
    expect(handler).toHaveBeenCalled()
    document.removeEventListener('bool:open-search', handler)
  })
})

describe('usePaletteShortcut', () => {
  function pressWithMeta(key: string) {
    const event = new KeyboardEvent('keydown', { key, metaKey: true, cancelable: true })
    const prevented = vi.spyOn(event, 'preventDefault')
    act(() => {
      window.dispatchEvent(event)
    })
    return prevented
  }

  it('opens on Cmd+K and prevents default', () => {
    const { result } = renderHook(() => usePaletteShortcut())
    expect(result.current[0]).toBe(false)
    const prevented = pressWithMeta('k')
    expect(result.current[0]).toBe(true)
    expect(prevented).toHaveBeenCalled()
  })

  it('opens on Cmd+P and prevents the browser print dialog', () => {
    const { result } = renderHook(() => usePaletteShortcut())
    expect(result.current[0]).toBe(false)
    const prevented = pressWithMeta('p')
    expect(result.current[0]).toBe(true)
    expect(prevented).toHaveBeenCalled()
  })

  it('ignores plain keypresses without a modifier', () => {
    const { result } = renderHook(() => usePaletteShortcut())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))
    })
    expect(result.current[0]).toBe(false)
  })
})
