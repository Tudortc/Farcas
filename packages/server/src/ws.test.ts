import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import { buildApp } from './app.js'
import type { FastifyInstance } from 'fastify'
import { PROTOCOL_VERSION } from '@bool/shared'

let app: FastifyInstance
let url: string
let sessionCookie: string

beforeAll(async () => {
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  url = `ws://127.0.0.1:${addr.port}/ws`

  // Sign up and capture session cookie for authenticated WS connections
  const name = `w${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  sessionCookie = Array.isArray(c) ? c.join('; ') : String(c)
})

afterAll(async () => {
  await app.close()
})

/** Waits for a message matching `pred` after sending `send`. */
function waitFor<T>(ws: WebSocket, send: object, pred: (msg: any) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('ws waitFor timeout')) }, 5000)
    ws.on('open', () => ws.send(JSON.stringify(send)))
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (pred(msg)) {
        clearTimeout(timer)
        resolve(msg as T)
        ws.close()
      }
    })
    ws.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

describe('websocket /ws', () => {
  it('replies welcome to hello', async () => {
    const reply = await waitFor<{ type: string; protocolVersion: number }>(
      new WebSocket(url, { headers: { cookie: sessionCookie } }),
      { type: 'hello', clientVersion: 1 },
      (m) => m.type === 'welcome',
    )
    expect(reply.type).toBe('welcome')
    expect(reply.protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('replies pong echoing t', async () => {
    const reply = await waitFor<{ type: string; t: number }>(
      new WebSocket(url, { headers: { cookie: sessionCookie } }),
      { type: 'ping', t: 42 },
      (m) => m.type === 'pong',
    )
    expect(reply).toMatchObject({ type: 'pong', t: 42 })
  })

  it('replies error on garbage', async () => {
    const reply = await waitFor<{ type: string }>(
      new WebSocket(url, { headers: { cookie: sessionCookie } }),
      { type: 'garbage' },
      (m) => m.type === 'error',
    )
    expect(reply.type).toBe('error')
  })
})
