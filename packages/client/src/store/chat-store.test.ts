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
  const close = () => (listeners['close'] ?? []).forEach((cb) => cb({}))
  return { sock, emitServer, open, close }
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

  it('sets connection to "open" when socket opens and "closed" when it closes', () => {
    const { sock, open, close } = fakeSocket()
    useChat.getState().init(() => sock)
    expect(useChat.getState().connection).toBe('connecting')
    open()
    expect(useChat.getState().connection).toBe('open')
    close()
    expect(useChat.getState().connection).toBe('closed')
  })

  it('sets lastError on net:error', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'net:error', networkId: 3, message: 'Connection refused' })
    expect(useChat.getState().lastError).toEqual({ networkId: 3, message: 'Connection refused' })
  })

  it('caps messages to 500 per target — 501st message drops the oldest', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    const key = targetKey(1, '#cap')
    // Send 501 messages
    for (let i = 0; i < 501; i++) {
      emitServer({ type: 'chat:msg', networkId: 1, target: '#cap', from: 'bot', kind: 'privmsg', text: `msg${i}`, self: false, time: i })
    }
    const msgs = useChat.getState().messages[key]!
    expect(msgs.length).toBe(500)
    // Oldest (time=0) should have been dropped; newest (time=500) should be last
    expect(msgs[0]!.ts).toBe(1)
    expect(msgs[499]!.ts).toBe(500)
  })

  // --- typing:update ---
  it('typing:update active adds the nick under the target key', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    const key = targetKey(1, '#chat')
    emitServer({ type: 'typing:update', networkId: 1, target: '#chat', nick: 'alice', state: 'active' })
    const typing = useChat.getState().typing
    expect(typing[key]).toBeDefined()
    expect(typeof typing[key]!['alice']).toBe('number')
  })

  it('typing:update done removes the nick from the target key', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    const key = targetKey(1, '#chat')
    emitServer({ type: 'typing:update', networkId: 1, target: '#chat', nick: 'alice', state: 'active' })
    emitServer({ type: 'typing:update', networkId: 1, target: '#chat', nick: 'alice', state: 'done' })
    const typing = useChat.getState().typing
    expect(typing[key]?.['alice']).toBeUndefined()
  })

  // --- react:update ---
  it('react:update add then remove leaves the emoji bucket removed', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'react:update', networkId: 1, target: '#chat', msgid: 'm42', emoji: '👍', nick: 'bob', action: 'add' })
    expect(useChat.getState().reactions['m42']?.['👍']).toEqual(['bob'])
    emitServer({ type: 'react:update', networkId: 1, target: '#chat', msgid: 'm42', emoji: '👍', nick: 'bob', action: 'remove' })
    expect(useChat.getState().reactions['m42']?.['👍']).toBeUndefined()
  })

  it('react:update add deduplicates nicks', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'react:update', networkId: 1, target: '#chat', msgid: 'm10', emoji: '❤️', nick: 'alice', action: 'add' })
    emitServer({ type: 'react:update', networkId: 1, target: '#chat', msgid: 'm10', emoji: '❤️', nick: 'alice', action: 'add' })
    expect(useChat.getState().reactions['m10']?.['❤️']).toEqual(['alice'])
  })

  // --- react() action ---
  it('react(msgid, emoji, true) sends react:add with the correct networkId/target', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    // Seed a message so the store knows its target
    emitServer({ type: 'chat:msg', networkId: 2, target: '#dev', from: 'alice', kind: 'privmsg', text: 'hey', self: false, time: 1, msgid: 'msg-abc' })
    useChat.getState().react('msg-abc', '👍', true)
    expect(sock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'react:add', networkId: 2, target: '#dev', msgid: 'msg-abc', emoji: '👍' })
    )
  })

  it('react(msgid, emoji, false) sends react:remove', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'chat:msg', networkId: 2, target: '#dev', from: 'alice', kind: 'privmsg', text: 'hey', self: false, time: 1, msgid: 'msg-xyz' })
    useChat.getState().react('msg-xyz', '👍', false)
    expect(sock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'react:remove', networkId: 2, target: '#dev', msgid: 'msg-xyz', emoji: '👍' })
    )
  })

  // --- sendReply() action ---
  it('sendReply sends chat:send with replyTo', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().select(targetKey(3, '#general'))
    useChat.getState().sendReply('hi there', 'm1')
    expect(sock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'chat:send', networkId: 3, target: '#general', text: 'hi there', replyTo: 'm1' })
    )
  })

  // --- setTyping() action ---
  it('setTyping sends typing:set to the server', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().setTyping(targetKey(1, '#chat'), 'active')
    expect(sock.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'typing:set', networkId: 1, target: '#chat', state: 'active' })
    )
  })
})
