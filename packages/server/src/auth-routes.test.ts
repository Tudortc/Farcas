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

  // Fix 2: verify that sign-out (POST) is reachable — previously the route only
  // accepted GET/POST; now it accepts all verbs. Sign-out uses POST so this test
  // would also catch a regression if the verb list were narrowed back to GET only.
  // Fix 1: sign-out calls deleteSessionCookie which expires BOTH better-auth.session_token
  // and better-auth.dont_remember cookies, so the response must carry ≥ 2 Set-Cookie
  // headers. This proves that multi-cookie propagation (via getSetCookie()) works;
  // the old forEach() approach would have dropped one of them.
  it('sign-out round-trip: session is invalidated afterwards, and sign-out carries multiple Set-Cookie headers', async () => {
    // Step 1 – sign up and obtain a session cookie
    const name = uniq()
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
    })
    expect(signup.statusCode).toBeLessThan(400)
    const signupCookies = signup.headers['set-cookie']
    expect(signupCookies).toBeTruthy()
    const sessionCookieHeader = Array.isArray(signupCookies)
      ? signupCookies.join('; ')
      : String(signupCookies)

    // Step 2 – sign out using POST /api/auth/sign-out (the verb Better Auth requires)
    const signout = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie: sessionCookieHeader },
    })
    expect(signout.statusCode).toBeLessThan(400)

    // Fix 1 assertion: sign-out must return >= 2 Set-Cookie headers (expires both
    // better-auth.session_token and better-auth.dont_remember). The old forEach()
    // would collapse these into one, so the assertion would fail without Fix 1.
    const signoutCookies = signout.headers['set-cookie']
    const cookieArray = Array.isArray(signoutCookies)
      ? signoutCookies
      : signoutCookies
        ? [signoutCookies]
        : []
    expect(cookieArray.length).toBeGreaterThanOrEqual(2)
    // Both expiry cookies should be present (maxAge=0)
    const cookieNames = cookieArray.map((c) => c.split('=')[0].trim())
    expect(cookieNames.some((n) => n.includes('session_token'))).toBe(true)
    expect(cookieNames.some((n) => n.includes('dont_remember'))).toBe(true)

    // Step 3 – the old session cookie must no longer grant access
    const meAfterSignout = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: sessionCookieHeader },
    })
    expect(meAfterSignout.statusCode).toBe(401)
  })
})
