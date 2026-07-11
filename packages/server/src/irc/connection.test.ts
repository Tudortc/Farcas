import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { IrcConnection, type IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

function fakeClient() {
  const ee = new EventEmitter() as EventEmitter & IrcClientLike
  ;(ee as any).user = { nick: 'bool' }
  ;(ee as any).network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn()
  ee.say = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  return ee
}

function makeConn() {
  const client = fakeClient()
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

describe('IrcConnection', () => {
  it('emits net:state connecting then registered', () => {
    const { client, out } = makeConn()
    client.emit('registered', { nick: 'bool' })
    expect(out[0]).toMatchObject({ type: 'net:state', state: 'connecting' })
    expect(out.some((m) => m.type === 'net:state' && (m as any).state === 'registered')).toBe(true)
  })

  it('maps a channel privmsg to chat:msg (self=false)', () => {
    const { client, out } = makeConn()
    client.emit('message', { type: 'privmsg', nick: 'bob', target: '#x', message: 'hi', tags: { msgid: 'm1' }, time: 99 })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg).toMatchObject({ type: 'chat:msg', target: '#x', from: 'bob', kind: 'privmsg', text: 'hi', self: false, msgid: 'm1', time: 99 })
  })

  it('marks self=true when the sender is our own nick (echo-message)', () => {
    const { client, out } = makeConn()
    client.emit('message', { type: 'privmsg', nick: 'bool', target: '#x', message: 'me', tags: {} })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg.self).toBe(true)
  })

  it('maps join/part/quit/nick/topic/userlist', () => {
    const { client, out } = makeConn()
    client.emit('join', { nick: 'bob', channel: '#x' })
    client.emit('userlist', { channel: '#x', users: [{ nick: 'bob', modes: ['o'] }] })
    client.emit('part', { nick: 'bob', channel: '#x', message: 'bye' })
    client.emit('quit', { nick: 'bob', message: 'zzz' })
    client.emit('nick', { nick: 'bob', new_nick: 'bobby' })
    client.emit('topic', { channel: '#x', topic: 'hello' })
    const types = out.map((m) => m.type)
    expect(types).toEqual(expect.arrayContaining(['chan:join', 'chan:names', 'chan:part', 'presence:quit', 'presence:nick', 'chan:topic']))
  })

  it('say() delegates to the client', () => {
    const { conn, client } = makeConn()
    conn.say('#x', 'hello')
    expect(client.say).toHaveBeenCalledWith('#x', 'hello')
  })
})
