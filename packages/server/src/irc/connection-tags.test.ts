import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { IrcConnection, type IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

function fakeClient(capEnabled = false) {
  const ee = new EventEmitter() as EventEmitter & IrcClientLike
  ;(ee as any).user = { nick: 'bool' }
  ;(ee as any).network = {
    name: 'TestNet',
    cap: {
      enabled: capEnabled ? ['message-tags'] : [],
      isEnabled: (c: string) => capEnabled && c === 'message-tags',
    },
  }
  ee.connect = vi.fn()
  ee.say = vi.fn()
  ;(ee as any).tagmsg = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  ee.removeAllListeners = vi.fn((...args: any[]) => {
    EventEmitter.prototype.removeAllListeners.apply(ee, args)
    return ee as any
  })
  return ee
}

function makeConn(capEnabled: boolean) {
  const client = fakeClient(capEnabled)
  const out: ServerMessage[] = []
  const conn = new IrcConnection(
    1,
    { name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' },
    (m) => out.push(m),
    () => client,
  )
  conn.connect()
  return { conn, client, out }
}

describe('IrcConnection tag features — cap enabled', () => {
  it('sendTyping calls tagmsg with +typing tag when message-tags cap is enabled', () => {
    const { conn, client } = makeConn(true)
    conn.sendTyping('#x', 'active')
    expect((client as any).tagmsg).toHaveBeenCalledWith('#x', { '+typing': 'active' })
  })

  it('sendTyping "done" calls tagmsg with +typing:done', () => {
    const { conn, client } = makeConn(true)
    conn.sendTyping('#x', 'done')
    expect((client as any).tagmsg).toHaveBeenCalledWith('#x', { '+typing': 'done' })
  })

  it('sendReaction (add) calls tagmsg with +draft/react and +draft/reply', () => {
    const { conn, client } = makeConn(true)
    conn.sendReaction('#x', 'msgid-1', '👍', true)
    expect((client as any).tagmsg).toHaveBeenCalledWith('#x', {
      '+draft/react': '👍',
      '+draft/reply': 'msgid-1',
    })
  })

  it('sendReaction (remove) calls tagmsg with +draft/unreact and +draft/reply', () => {
    const { conn, client } = makeConn(true)
    conn.sendReaction('#x', 'msgid-2', '👎', false)
    expect((client as any).tagmsg).toHaveBeenCalledWith('#x', {
      '+draft/unreact': '👎',
      '+draft/reply': 'msgid-2',
    })
  })

  it('say() with replyTo attaches +draft/reply tag when cap is enabled', () => {
    const { conn, client } = makeConn(true)
    conn.say('#x', 'hey there', 'msgid-abc')
    expect(client.say).toHaveBeenCalledWith('#x', 'hey there', { '+draft/reply': 'msgid-abc' })
  })

  it('say() without replyTo does not pass tags', () => {
    const { conn, client } = makeConn(true)
    conn.say('#x', 'plain text')
    expect(client.say).toHaveBeenCalledWith('#x', 'plain text')
  })
})

describe('IrcConnection tag features — cap disabled (graceful degradation)', () => {
  it('sendTyping is a no-op when message-tags cap is not enabled', () => {
    const { conn, client } = makeConn(false)
    conn.sendTyping('#x', 'active')
    expect((client as any).tagmsg).not.toHaveBeenCalled()
  })

  it('sendReaction is a no-op when message-tags cap is not enabled', () => {
    const { conn, client } = makeConn(false)
    conn.sendReaction('#x', 'msgid-1', '👍', true)
    expect((client as any).tagmsg).not.toHaveBeenCalled()
  })

  it('say() with replyTo degrades to a "> " quote prefix when cap is not enabled', () => {
    const { conn, client } = makeConn(false)
    conn.say('#x', 'my reply', 'msgid-abc')
    expect(client.say).toHaveBeenCalledWith('#x', '> my reply')
  })

  it('say() without replyTo works normally when cap is not enabled', () => {
    const { conn, client } = makeConn(false)
    conn.say('#x', 'plain text')
    expect(client.say).toHaveBeenCalledWith('#x', 'plain text')
  })
})

describe('IrcConnection inbound tag events', () => {
  it('maps inbound tagmsg with +typing to sink typing:update', () => {
    const { client, out } = makeConn(true)
    client.emit('tagmsg', { nick: 'alice', target: '#x', tags: { '+typing': 'active' } })
    const msg = out.find((m) => m.type === 'typing:update') as any
    expect(msg).toBeDefined()
    expect(msg).toMatchObject({ type: 'typing:update', networkId: 1, target: '#x', nick: 'alice', state: 'active' })
  })

  it('maps inbound tagmsg with +typing:done to sink typing:update with state=done', () => {
    const { client, out } = makeConn(true)
    client.emit('tagmsg', { nick: 'alice', target: '#x', tags: { '+typing': 'done' } })
    const msg = out.find((m) => m.type === 'typing:update') as any
    expect(msg).toMatchObject({ type: 'typing:update', state: 'done', nick: 'alice' })
  })

  it('maps inbound tagmsg with +draft/react to sink react:update', () => {
    const { client, out } = makeConn(true)
    client.emit('tagmsg', {
      nick: 'bob',
      target: '#x',
      tags: { '+draft/react': '🔥', '+draft/reply': 'msg-42' },
    })
    const msg = out.find((m) => m.type === 'react:update') as any
    expect(msg).toBeDefined()
    expect(msg).toMatchObject({
      type: 'react:update',
      networkId: 1,
      target: '#x',
      msgid: 'msg-42',
      emoji: '🔥',
      nick: 'bob',
      action: 'add',
    })
  })

  it('inbound privmsg with +draft/reply tag emits chat:msg with replyTo', () => {
    const { client, out } = makeConn(true)
    client.emit('message', {
      type: 'privmsg',
      nick: 'carol',
      target: '#x',
      message: 'reply text',
      tags: { '+draft/reply': 'msgid-original' },
    })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg).toBeDefined()
    expect(msg.replyTo).toBe('msgid-original')
  })

  it('maps inbound tagmsg with +draft/unreact to sink react:update with action=remove', () => {
    const { client, out } = makeConn(true)
    client.emit('tagmsg', {
      nick: 'bob',
      target: '#x',
      tags: { '+draft/unreact': '🔥', '+draft/reply': 'msg-42' },
    })
    const msg = out.find((m) => m.type === 'react:update') as any
    expect(msg).toBeDefined()
    expect(msg).toMatchObject({
      type: 'react:update',
      networkId: 1,
      target: '#x',
      msgid: 'msg-42',
      emoji: '🔥',
      nick: 'bob',
      action: 'remove',
    })
  })

  it('inbound privmsg without +draft/reply has no replyTo field', () => {
    const { client, out } = makeConn(true)
    client.emit('message', {
      type: 'privmsg',
      nick: 'dave',
      target: '#x',
      message: 'normal msg',
      tags: {},
    })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg).toBeDefined()
    expect(msg.replyTo).toBeUndefined()
  })
})
