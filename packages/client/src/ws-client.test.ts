import { describe, it, expect, vi } from 'vitest'
import { createWsClient, type WebSocketLike } from './ws-client.js'

function fakeSocket() {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {}
  const sock: WebSocketLike = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (type, cb) => {
      ;(listeners[type] ??= []).push(cb as (ev: unknown) => void)
    },
  }
  const emit = (type: string, ev: unknown) => (listeners[type] ?? []).forEach((cb) => cb(ev))
  return { sock, emit }
}

describe('ws-client', () => {
  it('parses server messages and forwards them to onMessage', () => {
    const { sock, emit } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    const received: unknown[] = []
    client.onMessage((m) => received.push(m))

    emit('message', { data: JSON.stringify({ type: 'pong', t: 7 }) })

    expect(received).toEqual([{ type: 'pong', t: 7 }])
  })

  it('serializes outgoing client messages', () => {
    const { sock, emit } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    emit('open', {})
    client.send({ type: 'ping', t: 9 })
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', t: 9 }))
  })

  it('buffers sends before open and flushes on open', () => {
    const { sock, emit } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })

    client.send({ type: 'ping', t: 1 })
    expect(sock.send).not.toHaveBeenCalled()

    emit('open', {})
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', t: 1 }))

    client.send({ type: 'ping', t: 2 })
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', t: 2 }))
  })

  it('drops unparseable inbound messages without throwing or invoking handler', () => {
    const { sock, emit } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    const handler = vi.fn()
    client.onMessage(handler)

    expect(() => emit('message', { data: 'not-json' })).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})
