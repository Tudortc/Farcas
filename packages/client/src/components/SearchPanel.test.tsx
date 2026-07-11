import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useChat, targetKey } from '../store/chat-store.js'
import { SearchPanel } from './SearchPanel.js'
import type { StoredMsg } from '@bool/shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(
  id: number,
  networkId: number,
  target: string,
  sender: string,
  body: string,
  ts: number,
): StoredMsg {
  return { id, networkId, target, sender, kind: 'privmsg', body, ts }
}

function seedResults() {
  useChat.setState({
    searchResults: {
      query: 'hello world',
      results: [
        makeMsg(1, 1, '#python', 'nirik', 'hello world from nirik', Date.now() - 5000),
        makeMsg(2, 2, '#general', 'alice', 'hello world from alice', Date.now() - 10000),
      ],
    },
    networks: {
      1: { id: 1, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'me', connected: true },
      2: { id: 2, name: 'OFTC', host: 'irc.oftc.net', nick: 'me', connected: true },
    },
    targets: {},
    messages: {},
    readMarkers: {},
    selected: null,
    connection: 'open',
  })
}

// ---------------------------------------------------------------------------
// Reset store before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useChat.setState((useChat as any).getInitialState?.() ?? {}, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchPanel', () => {
  it('renders the search input when open', () => {
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByPlaceholderText(/in:#channel from:user/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<SearchPanel open={false} onClose={() => {}} />)
    expect(screen.queryByPlaceholderText(/in:#channel from:user/i)).not.toBeInTheDocument()
  })

  it('calls search() on the store when Enter is pressed with a non-empty query', async () => {
    const searchSpy = vi.spyOn(useChat.getState(), 'search')
    render(<SearchPanel open onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/in:#channel from:user/i)
    fireEvent.change(input, { target: { value: 'hello world' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(searchSpy).toHaveBeenCalledWith('hello world')
  })

  it('does NOT call search() when query is whitespace-only', () => {
    const searchSpy = vi.spyOn(useChat.getState(), 'search')
    render(<SearchPanel open onClose={() => {}} />)
    const input = screen.getByPlaceholderText(/in:#channel from:user/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(searchSpy).not.toHaveBeenCalled()
  })

  it('renders result rows with sender and target from searchResults', () => {
    seedResults()
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByText('nirik')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('#python')).toBeInTheDocument()
    expect(screen.getByText('#general')).toBeInTheDocument()
  })

  it('renders network name in result rows', () => {
    seedResults()
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByText(/Libera\.Chat/)).toBeInTheDocument()
    expect(screen.getByText(/OFTC/)).toBeInTheDocument()
  })

  it('renders message body snippet in result rows', () => {
    seedResults()
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByText(/hello world from nirik/i)).toBeInTheDocument()
    expect(screen.getByText(/hello world from alice/i)).toBeInTheDocument()
  })

  it('clicking a result calls select() with the correct targetKey', () => {
    seedResults()
    const selectSpy = vi.spyOn(useChat.getState(), 'select')
    render(<SearchPanel open onClose={() => {}} />)
    // Click the first result row (nirik in #python on networkId=1)
    const hit = screen.getByText('#python').closest('[data-testid="search-hit"]')!
    fireEvent.click(hit)
    expect(selectSpy).toHaveBeenCalledWith(targetKey(1, '#python'))
  })

  it('clicking a result calls loadHistory() with the correct key', () => {
    seedResults()
    const loadSpy = vi.spyOn(useChat.getState(), 'loadHistory')
    render(<SearchPanel open onClose={() => {}} />)
    const hit = screen.getByText('#python').closest('[data-testid="search-hit"]')!
    fireEvent.click(hit)
    expect(loadSpy).toHaveBeenCalledWith(targetKey(1, '#python'))
  })

  it('clicking a result closes the panel', () => {
    seedResults()
    const onClose = vi.fn()
    render(<SearchPanel open onClose={onClose} />)
    const hit = screen.getByText('#python').closest('[data-testid="search-hit"]')!
    fireEvent.click(hit)
    expect(onClose).toHaveBeenCalled()
  })

  it('pressing Escape closes the panel', () => {
    const onClose = vi.fn()
    render(<SearchPanel open onClose={onClose} />)
    const input = screen.getByPlaceholderText(/in:#channel from:user/i)
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty hint section when no results', () => {
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByText(/in:/i)).toBeInTheDocument()
    expect(screen.getByText(/from:/i)).toBeInTheDocument()
  })

  it('shows result count when results are present', () => {
    seedResults()
    render(<SearchPanel open onClose={() => {}} />)
    expect(screen.getByText(/2/)).toBeInTheDocument()
  })
})
