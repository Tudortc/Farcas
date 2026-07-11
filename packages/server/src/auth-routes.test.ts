import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'

let app: FastifyInstance

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

const uniq = () => `u${Math.floor(performance.now() * 1000) % 1_000_000}`

describe('auth routes', () => {
  it('rejects /api/me without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
  })

  it('signs up, then /api/me returns the user via the session cookie', async () => {
    const name = uniq()
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
    })
    expect(signup.statusCode).toBeLessThan(400)
    const cookie = signup.headers['set-cookie']
    expect(cookie).toBeTruthy()

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: Array.isArray(cookie) ? cookie.join('; ') : String(cookie) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.username).toBe(name)
  })
})
