import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChat, targetKey } from './chat-store.js'
import type { WebSocketLike } from '../ws-client.js'

function fakeSocket() {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {}
  const sock: WebSocketLike = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (t, cb) => ((listeners[t] ??= []).push(cb as any)),
  }
  const emitServer = (msg: unknown) => (listeners['message'] ?? []).forEach((cb) => cb({ data: JSON.stringify(msg) }))
  const open = () => (listeners['open'] ?? []).forEach((cb) => cb({}))
  return { sock, emitServer, open }
}

beforeEach(() => useChat.setState(useChat.getInitialState?.() ?? {}, true) as any)

describe('chat store', () => {
  it('records networks from net:list and a live message', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'net:list', networks: [{ id: 1, name: 'Libera', host: 'h', port: 6697, tls: true, nick: 'me', connected: true }] })
    emitServer({ type: 'chat:msg', networkId: 1, target: '#x', from: 'bob', kind: 'privmsg', text: 'hi', self: false, time: 5 })
    const key = targetKey(1, '#x')
    expect(useChat.getState().networks[1]!.name).toBe('Libera')
    expect(useChat.getState().messages[key]!.map((m) => m.body)).toEqual(['hi'])
  })

  it('send() posts a chat:send for the selected target', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().select(targetKey(2, '#dev'))
    useChat.getState().send('hello there')
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat:send', networkId: 2, target: '#dev', text: 'hello there' }))
  })

  it('bumps unread for a non-selected target and clears on markRead', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'chat:msg', networkId: 1, target: '#y', from: 'z', kind: 'privmsg', text: 'yo', self: false, time: 9 })
    const key = targetKey(1, '#y')
    expect(useChat.getState().targets[key]!.unread).toBe(1)
    useChat.getState().markRead(key, 9)
    expect(useChat.getState().targets[key]!.unread).toBe(0)
  })
})
