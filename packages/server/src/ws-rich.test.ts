import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { ircManager } from './irc/singleton.js'
import type { IrcClientLike } from './irc/connection.js'

let app: FastifyInstance
let base: string
let lastClient: any

beforeAll(async () => {
  // Inject a fake IRC client factory that has message-tags cap enabled and a tagmsg spy.
  ;(ircManager as any).factory = (): IrcClientLike => {
    const ee = new EventEmitter() as any
    ee.user = { nick: 'bool' }
    ee.network = {
      name: 'TestNet',
      cap: {
        enabled: ['message-tags'],
        isEnabled: (c: string) => c === 'message-tags',
      },
    }
    ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
    ee.say = vi.fn()
    ee.tagmsg = vi.fn()
    ee.join = vi.fn()
    ee.part = vi.fn()
    ee.quit = vi.fn()
    ee.changeNick = vi.fn()
    ee.raw = vi.fn()
    ee.removeAllListeners = vi.fn((...args: any[]) => {
      EventEmitter.prototype.removeAllListeners.apply(ee, args)
      return ee
    })
    lastClient = ee
    return ee
  }
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`
})

afterAll(async () => {
  const conns = (ircManager as any).conns as Map<string, any>
  for (const conn of conns.values()) {
    try { conn.disconnect() } catch { /* ignore */ }
  }
  conns.clear()
  await app.close()
})

async function signUpCookie(): Promise<string> {
  const name = 'rich' + randomUUID().slice(0, 8)
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  return Array.isArray(c) ? c.join('; ') : String(c)
}

function openSocket(cookie: string): { ws: WebSocket; msgs: any[]; ready: Promise<void> } {
  const msgs: any[] = []
  const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
  const ready = new Promise<void>((resolve) => ws.on('open', () => resolve()))
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())))
  return { ws, msgs, ready }
}

async function untilMsg(msgs: any[], pred: (m: any) => boolean, timeoutMs = 5000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (msgs.some(pred)) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('timeout waiting for message: ' + pred.toString())
}

describe('ws rich features — typing and reactions', () => {
  it('typing:set routes to ircManager.setTyping → client.tagmsg', async () => {
    const cookie = await signUpCookie()
    const s = openSocket(cookie)
    await s.ready

    // Add and connect a network
    s.ws.send(JSON.stringify({ type: 'net:add', name: 'T', host: 'h', port: 6697, tls: true, nick: 'bool' }))
    await untilMsg(s.msgs, (m) => m.type === 'net:list' && m.networks.length >= 1)
    const list = s.msgs.filter((m) => m.type === 'net:list').find((m) => m.networks.length >= 1)
    const netId = list!.networks[0].id

    s.ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
    await untilMsg(s.msgs, (m) => m.type === 'net:state' && m.state === 'registered')

    // Reset tagmsg spy
    lastClient.tagmsg.mockClear()

    // Send typing:set
    s.ws.send(JSON.stringify({ type: 'typing:set', networkId: netId, target: '#x', state: 'active' }))

    // Wait a bit for the call to propagate
    await new Promise((r) => setTimeout(r, 100))

    expect(lastClient.tagmsg).toHaveBeenCalledWith('#x', { '+typing': 'active' })

    s.ws.close()
  }, 10000)

  it('react:add routes to ircManager.react → client.tagmsg AND publishes react:update to socket', async () => {
    const cookie = await signUpCookie()
    const s = openSocket(cookie)
    await s.ready

    // Add and connect a network
    s.ws.send(JSON.stringify({ type: 'net:add', name: 'R', host: 'h', port: 6697, tls: true, nick: 'bool' }))
    await untilMsg(s.msgs, (m) => m.type === 'net:list' && m.networks.length >= 1)
    const list = s.msgs.filter((m) => m.type === 'net:list').find((m) => m.networks.length >= 1)
    const netId = list!.networks[0].id

    s.ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
    await untilMsg(s.msgs, (m) => m.type === 'net:state' && m.state === 'registered')

    lastClient.tagmsg.mockClear()

    // Send react:add
    s.ws.send(JSON.stringify({ type: 'react:add', networkId: netId, target: '#x', msgid: 'msg-1', emoji: '👍' }))

    // Should get react:update pushed to our socket immediately
    await untilMsg(s.msgs, (m) => m.type === 'react:update' && m.emoji === '👍')

    const reactMsg = s.msgs.find((m) => m.type === 'react:update' && m.emoji === '👍')
    expect(reactMsg).toMatchObject({
      type: 'react:update',
      networkId: netId,
      target: '#x',
      msgid: 'msg-1',
      emoji: '👍',
      nick: 'bool',
      action: 'add',
    })

    // Also check the IRC client got the tagmsg
    expect(lastClient.tagmsg).toHaveBeenCalledWith('#x', {
      '+draft/react': '👍',
      '+draft/reply': 'msg-1',
    })

    s.ws.close()
  }, 10000)

  it('react:remove routes to ircManager.react → client.tagmsg AND publishes react:update(remove) to socket', async () => {
    const cookie = await signUpCookie()
    const s = openSocket(cookie)
    await s.ready

    s.ws.send(JSON.stringify({ type: 'net:add', name: 'Rm', host: 'h', port: 6697, tls: true, nick: 'bool' }))
    await untilMsg(s.msgs, (m) => m.type === 'net:list' && m.networks.length >= 1)
    const list = s.msgs.filter((m) => m.type === 'net:list').find((m) => m.networks.length >= 1)
    const netId = list!.networks[0].id

    s.ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
    await untilMsg(s.msgs, (m) => m.type === 'net:state' && m.state === 'registered')

    lastClient.tagmsg.mockClear()

    s.ws.send(JSON.stringify({ type: 'react:remove', networkId: netId, target: '#x', msgid: 'msg-2', emoji: '👎' }))

    await untilMsg(s.msgs, (m) => m.type === 'react:update' && m.action === 'remove')

    const reactMsg = s.msgs.find((m) => m.type === 'react:update' && m.action === 'remove')
    expect(reactMsg).toMatchObject({
      type: 'react:update',
      action: 'remove',
      emoji: '👎',
      msgid: 'msg-2',
      nick: 'bool',
    })

    // Check the IRC client got +draft/unreact (not +draft/react) for a remove
    expect(lastClient.tagmsg).toHaveBeenCalledWith('#x', {
      '+draft/unreact': '👎',
      '+draft/reply': 'msg-2',
    })

    s.ws.close()
  }, 10000)
})
