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
  // Disconnect all live IRC connections in the singleton manager.
  const conns = (ircManager as any).conns as Map<string, any>
  for (const conn of conns.values()) {
    try { conn.disconnect() } catch { /* ignore */ }
  }
  conns.clear()
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

/**
 * Opens a WebSocket, runs `script`, and resolves when `until(msgs)` returns true.
 * The `script` receives a function `send` (type-safe wrapper) and a `waitFor`
 * function that resolves once a matching message has arrived (event-gated, not time-gated).
 */
function collect(
  cookie: string,
  script: (ws: WebSocket, waitFor: (pred: (msgs: any[]) => boolean) => Promise<void>) => void,
  until: (msgs: any[]) => boolean,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = []
    const waiters: Array<{ pred: (msgs: any[]) => boolean; resolve: () => void }> = []

    const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })

    function drainWaiters() {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i]!.pred(msgs)) {
          waiters[i]!.resolve()
          waiters.splice(i, 1)
        }
      }
    }

    const waitFor = (pred: (msgs: any[]) => boolean): Promise<void> =>
      new Promise<void>((res) => {
        if (pred(msgs)) { res(); return }
        waiters.push({ pred, resolve: res })
      })

    ws.on('open', () => script(ws, waitFor))
    ws.on('message', (d) => {
      msgs.push(JSON.parse(d.toString()))
      drainWaiters()
      if (until(msgs)) {
        ws.close()
        resolve(msgs)
      }
    })
    ws.on('error', reject)
    const timer = setTimeout(() => {
      ws.close()
      resolve(msgs)
    }, 8000)
    // Clear the timeout if we resolve early
    ws.on('close', () => clearTimeout(timer))
  })
}

describe('ws irc integration', () => {
  it('adds a network, connects, joins, sends — over the WS protocol', async () => {
    const cookie = await signUpCookie()

    // Step 1: add network, wait for net:list
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

    // Step 2: connect, wait for registered, then send chat, then join — event-gated
    const after = await collect(
      cookie,
      async (ws, waitFor) => {
        ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 }))
        ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
        // Wait for registered before sending chat (avoids "not connected" race)
        await waitFor((m) => m.some((x) => x.type === 'net:state' && x.state === 'registered'))
        ws.send(JSON.stringify({ type: 'chat:send', networkId: netId, target: '#x', text: 'hello' }))
        // Wait for registered (already done) then join
        ws.send(JSON.stringify({ type: 'chan:join', networkId: netId, channel: '#x' }))
      },
      (m) => m.some((x) => x.type === 'chan:join' && x.channel === '#x'),
    )
    expect(after.some((m) => m.type === 'net:state' && m.state === 'registered')).toBe(true)
    expect(after.some((m) => m.type === 'chan:join' && m.channel === '#x')).toBe(true)
    expect(lastClient.say).toHaveBeenCalledWith('#x', 'hello')
  }, 10000)
})
