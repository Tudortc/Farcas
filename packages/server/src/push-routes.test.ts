import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'

const FAKE_PUBLIC = 'BFakePublicKeyForRoutesTest1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'
const FAKE_PRIVATE = 'FakePrivateKeyForRoutesTest1234567890ABCDEFG'

let app: FastifyInstance

beforeAll(async () => {
  process.env.BOOL_VAPID_PUBLIC = FAKE_PUBLIC
  process.env.BOOL_VAPID_PRIVATE = FAKE_PRIVATE
  ensureAppSchema(getDb())
  app = buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

afterEach(() => {
  getDb().exec('DELETE FROM push_subs')
})

const uniq = () => `u${Math.floor(performance.now() * 1000) % 1_000_000_000}`

async function signUpAndGetCookie(name: string): Promise<string> {
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  expect(signup.statusCode).toBeLessThan(400)
  const cookie = signup.headers['set-cookie']
  return Array.isArray(cookie) ? cookie.join('; ') : String(cookie)
}

describe('GET /api/push/vapid', () => {
  it('returns the public key when VAPID is configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/push/vapid' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ key: FAKE_PUBLIC })
  })
})

describe('POST /api/push/subscribe', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { endpoint: 'https://push.example.com/test', keys: { p256dh: 'x', auth: 'y' } },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when body is missing endpoint', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: { keys: { p256dh: 'abc', auth: 'def' } }, // missing endpoint
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid subscription' })
  })

  it('returns 400 when body is missing keys', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: { endpoint: 'https://push.example.com/test' }, // missing keys
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid subscription' })
  })

  it('stores a subscription row for the authenticated user', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)

    const res = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: { endpoint: `https://push.example.com/${name}`, keys: { p256dh: 'abc', auth: 'def' } },
    })
    expect(res.statusCode).toBe(200)

    const row = getDb()
      .prepare('SELECT * FROM push_subs WHERE endpoint = ?')
      .get(`https://push.example.com/${name}`) as any
    expect(row).toBeTruthy()
    expect(row.user_id).toBeTruthy() // stored under the signed-in user's id
  })
})

describe('POST /api/push/unsubscribe', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/unsubscribe',
      payload: { endpoint: 'https://push.example.com/test' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('removes the subscription for the authenticated user', async () => {
    const name = uniq()
    const cookie = await signUpAndGetCookie(name)
    const endpoint = `https://push.example.com/unsub-${name}`

    // Subscribe first
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: { cookie },
      payload: { endpoint, keys: { p256dh: 'abc', auth: 'def' } },
    })

    // Verify it was stored
    const beforeRow = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get(endpoint)
    expect(beforeRow).toBeTruthy()

    // Unsubscribe
    const res = await app.inject({
      method: 'POST',
      url: '/api/push/unsubscribe',
      headers: { cookie },
      payload: { endpoint },
    })
    expect(res.statusCode).toBe(200)

    const afterRow = getDb().prepare('SELECT * FROM push_subs WHERE endpoint = ?').get(endpoint)
    expect(afterRow).toBeUndefined()
  })
})
