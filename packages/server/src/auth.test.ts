import { describe, it, expect } from 'vitest'
import { getDb } from './db.js'
import { auth } from './auth.js'

describe('auth instance + schema', () => {
  it('created the Better Auth tables in the DB', () => {
    const rows = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['user', 'session', 'account', 'verification']))
  })

  it('getSession returns null without a session', async () => {
    const session = await auth.api.getSession({ headers: new Headers() })
    expect(session).toBeNull()
  })
})
