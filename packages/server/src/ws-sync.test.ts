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
  ;(ircManager as any).factory = (): IrcClientLike => {
    const ee = new EventEmitter() as any
    ee.user = { nick: 'bool' }
    ee.network = { name: 'N', cap: { enabled: [], isEnabled: () => false } }
    ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
    ee.say = vi.fn(); ee.join = vi.fn(); ee.part = vi.fn(); ee.quit = vi.fn(); ee.changeNick = vi.fn(); ee.raw = vi.fn(); ee.removeAllListeners = vi.fn()
    lastClient = ee
    return ee
  }
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`
})
afterAll(async () => { await app.close() })

async function signUpCookie(): Promise<string> {
  const name = 'sy' + randomUUID().slice(0, 8)
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${name}@example.test`, password: 'password1234', name, username: name } })
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('ws multi-device sync', () => {
  it('fans a relayed message to both of a user\'s sockets and syncs read markers', async () => {
    const cookie = await signUpCookie()
    const s1 = openSocket(cookie); await s1.ready
    const s2 = openSocket(cookie); await s2.ready

    // add + connect a network from socket 1
    // The server sends an initial net:list on connect (may be empty), so find
    // the one that arrives after net:add (networks.length >= 1).
    s1.ws.send(JSON.stringify({ type: 'net:add', name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' }))
    await wait(200)
    const list = s1.msgs.filter((m) => m.type === 'net:list').find((m) => m.networks.length >= 1)
    const netId = list!.networks[0].id
    s1.ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
    await wait(100)

    // an inbound IRC message must reach BOTH sockets via the hub
    lastClient.emit('message', { type: 'privmsg', nick: 'zoe', target: '#x', message: 'hi all', tags: {}, time: 7 })
    await wait(100)
    expect(s1.msgs.some((m) => m.type === 'chat:msg' && m.text === 'hi all')).toBe(true)
    expect(s2.msgs.some((m) => m.type === 'chat:msg' && m.text === 'hi all')).toBe(true)

    // read:set on socket 1 fans read:update to socket 2
    s1.ws.send(JSON.stringify({ type: 'read:set', networkId: netId, target: '#x', ts: 7 }))
    await wait(100)
    expect(s2.msgs.some((m) => m.type === 'read:update' && m.target === '#x' && m.ts === 7)).toBe(true)

    s1.ws.close(); s2.ws.close()
  })

  it('does not leak to another user\'s socket', async () => {
    const cookieA = await signUpCookie()
    const cookieB = await signUpCookie()
    const a = openSocket(cookieA); await a.ready
    const b = openSocket(cookieB); await b.ready
    a.ws.send(JSON.stringify({ type: 'read:set', networkId: 1, target: '#p', ts: 5 }))
    await wait(100)
    expect(b.msgs.some((m) => m.type === 'read:update')).toBe(false)
    a.ws.close(); b.ws.close()
  })
})
