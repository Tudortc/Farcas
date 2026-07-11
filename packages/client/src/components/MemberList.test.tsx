import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useChat, targetKey } from '../store/chat-store.js'
import { MemberList } from './MemberList.js'

const KEY = targetKey(1, '#python')

function seedWithNames() {
  useChat.setState({
    networks: {
      1: { id: 1, name: 'Libera.Chat', host: 'irc.libera.chat', nick: 'dmf', connected: true },
    },
    targets: {
      [KEY]: {
        networkId: 1,
        target: '#python',
        kind: 'channel',
        unread: 0,
        names: [
          { nick: 'ChanServ', modes: ['o', '@'] },
          { nick: 'phillmac', modes: [] },
          { nick: 'alice_v', modes: ['v', '+'] },
        ],
      },
    },
    selected: KEY,
    connection: 'open',
    messages: {},
    readMarkers: {},
    searchResults: null,
  })
}

beforeEach(() => {
  useChat.setState((useChat as any).getInitialState?.() ?? {}, true)
})

describe('MemberList', () => {
  it('renders all members from the selected target', () => {
    seedWithNames()
    render(<MemberList />)
    expect(screen.getByText('ChanServ')).toBeInTheDocument()
    expect(screen.getByText('phillmac')).toBeInTheDocument()
    expect(screen.getByText('alice_v')).toBeInTheDocument()
  })

  it('renders ops group heading', () => {
    seedWithNames()
    render(<MemberList />)
    expect(screen.getByText(/ops/i)).toBeInTheDocument()
  })

  it('op nick appears in the ops section (before regular nicks)', () => {
    seedWithNames()
    const { container } = render(<MemberList />)
    const allNicks = container.querySelectorAll('.mem .nm')
    const nickTexts = Array.from(allNicks).map((el) => el.textContent)
    // ChanServ is op — should appear first
    expect(nickTexts[0]).toBe('ChanServ')
  })

  it('renders voiced group when voiced members exist', () => {
    seedWithNames()
    render(<MemberList />)
    expect(screen.getByText(/voiced/i)).toBeInTheDocument()
  })

  it('renders regular (online) group', () => {
    seedWithNames()
    render(<MemberList />)
    expect(screen.getByText(/online/i)).toBeInTheDocument()
    expect(screen.getByText('phillmac')).toBeInTheDocument()
  })

  it('renders empty state when no target is selected', () => {
    render(<MemberList />)
    // Should not crash and shows nothing or empty text
    expect(screen.queryByText('ChanServ')).not.toBeInTheDocument()
  })

  it('shows member count in header', () => {
    seedWithNames()
    render(<MemberList />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
