import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage } from './messages.js'

let app: FastifyInstance
let base: string
let userId: string
let cookie: string

beforeAll(async () => {
  ensureAppSchema(getDb())
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`

  const name = `h${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${name}@example.test`, password: 'password1234', name, username: name } })
  cookie = String(res.headers['set-cookie'])
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  userId = me.json().user.id

  storeMessage(userId, { networkId: 7, target: '#hist', sender: 'ann', kind: 'privmsg', body: 'searchable banana', ts: 1 })
  storeMessage(userId, { networkId: 7, target: '#hist', sender: 'ben', kind: 'privmsg', body: 'later message', ts: 2 })
})
afterAll(async () => { await app.close() })

function ask(payload: object, until: (m: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
    ws.on('open', () => ws.send(JSON.stringify(payload)))
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (until(m)) { resolve(m); ws.close() }
    })
    ws.on('error', reject)
  })
}

describe('ws history + search', () => {
  it('returns search results for the session user', async () => {
    const m = await ask({ type: 'chat:search', query: 'banana' }, (x) => x.type === 'search:results')
    expect(m.results).toHaveLength(1)
    expect(m.results[0].sender).toBe('ann')
  })
  it('returns channel history oldest-first', async () => {
    const m = await ask({ type: 'history:request', networkId: 7, target: '#hist' }, (x) => x.type === 'history:batch')
    expect(m.messages.map((r: any) => r.body)).toEqual(['searchable banana', 'later message'])
  })
})
