import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'

let app: FastifyInstance
let base: string
let sessionCookie: string

beforeAll(async () => {
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`

  // Pre-create the user once in beforeAll so the (slow) scrypt hash doesn't
  // count against the per-test timeout.
  const name = `w${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  sessionCookie = Array.isArray(c) ? c.join('; ') : String(c)
}, 30000)

afterAll(async () => {
  await app.close()
})

function firstMessage(ws: WebSocket, send: object): Promise<{ closed: boolean; msg: any }> {
  return new Promise((resolve, reject) => {
    let msg: any = null
    ws.on('open', () => ws.send(JSON.stringify(send)))
    ws.on('message', (d) => (msg = JSON.parse(d.toString())))
    ws.on('close', () => resolve({ closed: true, msg }))
    ws.on('error', reject)
  })
}

describe('ws auth gate', () => {
  it('closes an unauthenticated connection with an error', async () => {
    const { closed, msg } = await firstMessage(new WebSocket(`ws://${base}/ws`), {
      type: 'hello',
      clientVersion: 1,
    })
    expect(closed).toBe(true)
    expect(msg?.type).toBe('error')
    expect(msg?.message).toBe('unauthorized')
  })

  it('accepts an authenticated connection and replies welcome', async () => {
    const reply = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie: sessionCookie } })
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 })))
      ws.on('message', (d) => {
        resolve(JSON.parse(d.toString()))
        ws.close()
      })
      ws.on('error', reject)
    })
    expect(reply.type).toBe('welcome')
  })
})
