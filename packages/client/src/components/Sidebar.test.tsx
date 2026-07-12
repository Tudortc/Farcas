import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useChat, targetKey } from '../store/chat-store.js'
import type { WebSocketLike } from '../ws-client.js'
import { Sidebar } from './Sidebar.js'

// Seed store helper — merges state without replacing actions
function seed() {
  useChat.setState({
    networks: {
      1: { id: 1, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'dmf', connected: true },
    },
    targets: {
      [targetKey(1, '#python')]: {
        networkId: 1,
        target: '#python',
        kind: 'channel',
        unread: 0,
        topic: 'Python 3.13',
      },
      [targetKey(1, '#archlinux')]: {
        networkId: 1,
        target: '#archlinux',
        kind: 'channel',
        unread: 5,
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
  useChat.setState(useChat.getInitialState?.() ?? {}, true)
})

describe('Sidebar', () => {
  it('renders both channels from seeded store', () => {
    seed()
    render(<Sidebar />)
    // Channel rows use title="#channel-name" on the button
    expect(screen.getByTitle('#python')).toBeInTheDocument()
    expect(screen.getByTitle('#archlinux')).toBeInTheDocument()
  })

  it('shows an unread badge for the channel with unread messages', () => {
    seed()
    render(<Sidebar />)
    // #archlinux has 5 unread — channel badge shows the count inside .b span
    // There may also be a rail badge — use getAllByText and assert at least one exists
    const badges = screen.getAllByText('5')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    // At least one badge is inside a .b element (channel unread badge)
    const channelBadge = badges.find((el) => el.classList.contains('b'))
    expect(channelBadge).toBeInTheDocument()
  })

  it('clicking a channel calls select() and updates selected in the store', () => {
    seed()
    render(<Sidebar />)
    const pythonBtn = screen.getByTitle('#python')
    fireEvent.click(pythonBtn)
    expect(useChat.getState().selected).toBe(targetKey(1, '#python'))
  })

  it('marks the active row when a channel is selected', () => {
    seed()
    useChat.setState({ selected: targetKey(1, '#python') })
    render(<Sidebar />)
    const pythonBtn = screen.getByTitle('#python')
    expect(pythonBtn).toHaveClass('active')
  })
})

// --- Task 8: channel-join affordance + Server (status) group ---

function fakeSocket() {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {}
  const sock: WebSocketLike = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (t, cb) => ((listeners[t] ??= []).push(cb as any)),
  }
  const open = () => (listeners['open'] ?? []).forEach((cb) => cb({}))
  return { sock, open }
}

function seedWithSocket() {
  const { sock, open } = fakeSocket()
  useChat.getState().init(() => sock)
  open()
  useChat.setState({
    networks: {
      1: { id: 1, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'dmf', connected: true },
    },
    targets: {
      [targetKey(1, '#python')]: {
        networkId: 1,
        target: '#python',
        kind: 'channel',
        unread: 0,
        topic: 'Python 3.13',
      },
    },
    selected: targetKey(1, '#python'),
    connection: 'open',
  })
  return sock
}

function renderSidebar() {
  render(<Sidebar />)
}

describe('Sidebar — join affordance + server group', () => {
  it('joins a channel from the sidebar + affordance', () => {
    const sockSend = seedWithSocket().send as ReturnType<typeof vi.fn>
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: /join a channel/i }))
    const input = screen.getByRole('textbox', { name: /channel to join/i })
    fireEvent.change(input, { target: { value: 'newchan' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(sockSend).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:join', networkId: 1, channel: '#newchan' }))
  })

  it('renders a Server group for the * status target', () => {
    seedWithSocket()
    useChat.setState({
      targets: {
        ...useChat.getState().targets,
        [targetKey(1, '*')]: {
          networkId: 1,
          target: '*',
          kind: 'status',
          unread: 0,
        },
      },
    })
    renderSidebar()
    expect(screen.getByText(/server/i)).toBeInTheDocument()
  })
})
