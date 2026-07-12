import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react'
import { useChat, targetKey } from '../store/chat-store.js'
import { useAppearance } from '../theme.js'
import { THEME_CATALOG } from '../theme-catalog.js'
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
    const input = screen.getByPlaceholderText(/Jump to or join/i)
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
    const input = screen.getByPlaceholderText(/Jump to or join/i)
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

  it('offers an inline Join action for a channel that is not open, and joins it', async () => {
    seedStore()
    const joinSpy = vi.spyOn(useChat.getState(), 'join').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} />)

    const input = screen.getByPlaceholderText(/jump to or join/i)
    fireEvent.change(input, { target: { value: '#newchan' } })

    const joinItem = await screen.findByText('Join #newchan')
    expect(joinItem).toBeInTheDocument()

    fireEvent.click(joinItem)
    // Active network is the first seeded network (Libera.Chat, id 1) when nothing is selected.
    expect(joinSpy).toHaveBeenCalledWith(1, '#newchan')
    expect(onClose).toHaveBeenCalled()
    joinSpy.mockRestore()
  })

  it('does not offer an inline Join for a channel that is already open', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/jump to or join/i)
    fireEvent.change(input, { target: { value: '#python' } })
    expect(screen.queryByText('Join #python')).not.toBeInTheDocument()
  })

  it('shows a Sign out action', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    expect(screen.getByText(/sign out/i)).toBeInTheDocument()
  })

  it('exposes a Switch theme action for every entry in THEME_CATALOG (drift guard)', () => {
    seedStore()
    render(<CommandPalette open onClose={() => {}} />)
    // Each theme produces an item whose name contains "Switch theme" and the theme's exact label.
    // Use getAllByText to avoid errors when multiple items share a substring (e.g. "Terminal" / "Terminal Light").
    for (const t of THEME_CATALOG) {
      const matches = screen.getAllByText(new RegExp(`Switch theme.*·.*${t.label}`))
      // At least one item must contain this theme's label in a "Switch theme" entry.
      const exact = matches.filter((el) => el.textContent?.includes(`· ${t.label}`))
      expect(exact.length).toBeGreaterThanOrEqual(1)
    }
    // Also verify total count matches catalog length so adding a theme without updating fails loudly.
    const switchItems = screen.getAllByText(/Switch theme/)
    expect(switchItems).toHaveLength(THEME_CATALOG.length)
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
