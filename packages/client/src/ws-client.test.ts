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
    const { sock } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    client.send({ type: 'ping', t: 9 })
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', t: 9 }))
  })
})
