/**
 * Fix 6 — Security tests: lock the invariants the reviewer verified manually.
 *
 * (a) Admin enforcement: the list-users endpoint must reject normal users (403)
 *     and unauthenticated callers (401).
 * (b) Admin-created user with username can sign in by username, and /api/me
 *     returns the username.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getDb } from './db.js'

let app: FastifyInstance

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

const uniq = () => `s${Math.floor(performance.now() * 1000) % 1_000_000_000}`

/** Sign up a user and return their session cookie header string. */
async function signUp(
  name: string,
): Promise<{ cookie: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  expect(res.statusCode).toBeLessThan(400)
  const c = res.headers['set-cookie']
  const cookie = Array.isArray(c) ? c.join('; ') : String(c)
  const body = res.json() as { user: { id: string } }
  return { cookie, userId: body.user.id }
}

/** Promote a user to admin directly in the DB (test helper). */
function promoteToAdmin(userId: string): void {
  getDb().prepare("UPDATE user SET role='admin' WHERE id=?").run(userId)
}

describe('admin security', () => {
  describe('(a) admin enforcement on list-users endpoint', () => {
    it('returns 401 for an unauthenticated request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/admin/list-users',
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 403 for a normal (non-admin) user', async () => {
      const name = uniq()
      const { cookie } = await signUp(name)
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/admin/list-users',
        headers: { cookie },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('(b) admin-created user can sign in by username', () => {
    it('creates a user via the admin API with a username, signs in by username, and /api/me returns the username', async () => {
      // 1. Create an admin user by signing up and promoting via DB.
      const adminName = uniq()
      const { cookie: adminCookie, userId: adminId } = await signUp(adminName)
      promoteToAdmin(adminId)

      // 2. Use the admin session to create a new user with a username via the
      //    admin API (username is passed in the `data` extra-fields record).
      const newUsername = uniq()
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/create-user',
        headers: { cookie: adminCookie },
        payload: {
          email: `${newUsername}@example.test`,
          password: 'password1234',
          name: newUsername,
          data: { username: newUsername },
        },
      })
      expect(createRes.statusCode).toBeLessThan(400)

      // 3. Sign in using the username plugin endpoint.
      const signInRes = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/username',
        payload: { username: newUsername, password: 'password1234' },
      })
      expect(signInRes.statusCode).toBeLessThan(400)

      // 4. Retrieve the session and verify the username is present.
      const signinCookie = signInRes.headers['set-cookie']
      const sessionCookie = Array.isArray(signinCookie)
        ? signinCookie.join('; ')
        : String(signinCookie)

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { cookie: sessionCookie },
      })
      expect(meRes.statusCode).toBe(200)
      const me = meRes.json() as { user: { username?: string | null } }
      expect(me.user.username).toBe(newUsername)
    })
  })
})
