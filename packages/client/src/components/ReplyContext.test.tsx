import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useChat } from '../store/chat-store.js'
import { ReplyContext } from './ReplyContext.js'

const SELECTED = '1:#general'

beforeEach(() => {
  useChat.setState(useChat.getInitialState(), true)
  // Seed a message with msgid 'm1' by 'alice' with body 'hello world'
  useChat.setState({
    selected: SELECTED,
    messages: {
      [SELECTED]: [
        {
          id: 1,
          networkId: 1,
          target: '#general',
          sender: 'alice',
          kind: 'privmsg',
          body: 'hello world',
          ts: 1000,
          msgid: 'm1',
        },
      ],
    },
  })
})

describe('ReplyContext', () => {
  it('renders quoted sender and snippet when replyTo message is found', () => {
    render(<ReplyContext replyTo="m1" />)
    expect(screen.getByText(/alice/)).toBeInTheDocument()
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
  })

  it('includes the reply arrow indicator', () => {
    render(<ReplyContext replyTo="m1" />)
    expect(screen.getByText(/↳/)).toBeInTheDocument()
  })

  it('renders muted fallback when replyTo message is not found (dangling)', () => {
    render(<ReplyContext replyTo="zzz" />)
    expect(screen.getByText(/↳/)).toBeInTheDocument()
    expect(screen.getByText(/\(message\)/)).toBeInTheDocument()
  })

  it('does not render the found message sender for dangling replyTo', () => {
    render(<ReplyContext replyTo="zzz" />)
    expect(screen.queryByText(/alice/)).not.toBeInTheDocument()
  })

  it('truncates long body snippets to ~80 chars', () => {
    const longBody = 'a'.repeat(100)
    useChat.setState({
      messages: {
        [SELECTED]: [
          {
            id: 2,
            networkId: 1,
            target: '#general',
            sender: 'bob',
            kind: 'privmsg',
            body: longBody,
            ts: 2000,
            msgid: 'm2',
          },
        ],
      },
    })
    render(<ReplyContext replyTo="m2" />)
    // Should not render full 100 chars
    const fullText = 'a'.repeat(100)
    expect(screen.queryByText(fullText)).not.toBeInTheDocument()
    // Should still render some text
    expect(screen.getByText(/bob/)).toBeInTheDocument()
  })
})
