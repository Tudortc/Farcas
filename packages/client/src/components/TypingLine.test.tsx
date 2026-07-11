import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useChat } from '../store/chat-store.js'
import { TypingLine } from './TypingLine.js'

beforeEach(() => {
  useChat.setState(useChat.getInitialState(), true)
})

describe('TypingLine', () => {
  const NOW = 1_000_000
  const SELECTED = '1:#general'

  function seed(typers: Record<string, number>) {
    useChat.setState({
      selected: SELECTED,
      networks: { 1: { id: 1, name: 'Freenode', host: 'irc.freenode.net', nick: 'me', connected: true } },
      typing: { [SELECTED]: typers },
    })
  }

  it('renders nothing when no one is typing', () => {
    seed({})
    const { container } = render(<TypingLine now={NOW} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "alice is typing…" for a single fresh typer', () => {
    seed({ alice: NOW - 1000 })
    render(<TypingLine now={NOW} />)
    expect(screen.getByText(/alice is typing/i)).toBeInTheDocument()
  })

  it('renders "alice and bob are typing…" for two fresh typers', () => {
    seed({ alice: NOW - 1000, bob: NOW - 2000 })
    render(<TypingLine now={NOW} />)
    expect(screen.getByText(/alice and bob are typing/i)).toBeInTheDocument()
  })

  it('renders "several people are typing…" for three or more typers', () => {
    seed({ alice: NOW - 500, bob: NOW - 1000, carol: NOW - 2000 })
    render(<TypingLine now={NOW} />)
    expect(screen.getByText(/several people are typing/i)).toBeInTheDocument()
  })

  it('excludes stale typers (older than 6s)', () => {
    seed({ alice: NOW - 1000, stale: NOW - 7000 })
    render(<TypingLine now={NOW} />)
    expect(screen.getByText(/alice is typing/i)).toBeInTheDocument()
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
  })

  it('excludes the current user\'s own nick', () => {
    // "me" is the current nick (set in networks[1].nick)
    seed({ me: NOW - 500, alice: NOW - 1000 })
    render(<TypingLine now={NOW} />)
    expect(screen.getByText(/alice is typing/i)).toBeInTheDocument()
    expect(screen.queryByText(/me is typing/i)).not.toBeInTheDocument()
  })

  it('renders nothing when selected is null', () => {
    useChat.setState({ selected: null })
    const { container } = render(<TypingLine now={NOW} />)
    expect(container.firstChild).toBeNull()
  })
})
