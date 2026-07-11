import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { ircManager } from './irc/singleton.js'
import type { IrcClientLike } from './irc/connection.js'

let app: FastifyInstance
let base: string
let lastClient: any

beforeAll(async () => {
  // Inject a fake IRC client factory into the singleton manager.
  ;(ircManager as any).factory = (): IrcClientLike => {
    const ee = new EventEmitter() as any
    ee.user = { nick: 'bool' }
    ee.network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
    ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
    ee.say = vi.fn()
    ee.join = vi.fn(() => ee.emit('join', { nick: 'bool', channel: '#x' }))
    ee.part = vi.fn()
    ee.quit = vi.fn()
    ee.changeNick = vi.fn()
    ee.raw = vi.fn()
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
  await app.close()
})

async function signUpCookie(): Promise<string> {
  const name = `i${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  return Array.isArray(c) ? c.join('; ') : String(c)
}

function collect(cookie: string, script: (ws: WebSocket) => void, until: (msgs: any[]) => boolean): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = []
    const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
    ws.on('open', () => script(ws))
    ws.on('message', (d) => {
      msgs.push(JSON.parse(d.toString()))
      if (until(msgs)) {
        resolve(msgs)
        ws.close()
      }
    })
    ws.on('error', reject)
    setTimeout(() => resolve(msgs), 8000)
  })
}

describe('ws irc integration', () => {
  it('adds a network, connects, joins, sends — over the WS protocol', async () => {
    const cookie = await signUpCookie()
    const msgs = await collect(
      cookie,
      (ws) => {
        ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 }))
        ws.send(JSON.stringify({ type: 'net:add', name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' }))
      },
      (m) => m.some((x) => x.type === 'net:list'),
    )
    const list = msgs.find((m) => m.type === 'net:list')
    expect(list, 'net:list not received — likely DB contention timeout').toBeDefined()
    expect(list.networks.length).toBeGreaterThanOrEqual(1)
    const netId = list.networks[0].id

    const after = await collect(
      cookie,
      (ws) => {
        ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 }))
        ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
        setTimeout(() => ws.send(JSON.stringify({ type: 'chat:send', networkId: netId, target: '#x', text: 'hello' })), 50)
        setTimeout(() => ws.send(JSON.stringify({ type: 'chan:join', networkId: netId, channel: '#x' })), 150)
      },
      (m) => m.some((x) => x.type === 'chan:join' && x.channel === '#x'),
    )
    expect(after.some((m) => m.type === 'net:state' && m.state === 'registered')).toBe(true)
    expect(after.some((m) => m.type === 'chan:join' && m.channel === '#x')).toBe(true)
    expect(lastClient.say).toHaveBeenCalledWith('#x', 'hello')
  }, 10000)
})
