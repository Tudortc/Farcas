import { describe, it, expect } from 'vitest'
import { isAdmin } from './bootstrap-admin.js'

describe('isAdmin', () => {
  it('is true for role admin', () => {
    expect(isAdmin({ user: { id: 'x', role: 'admin' } } as any)).toBe(true)
  })
  it('is true for an id in BOOL_ADMIN_IDS', () => {
    process.env.BOOL_ADMIN_IDS = 'abc,def'
    expect(isAdmin({ user: { id: 'def', role: 'user' } } as any)).toBe(true)
  })
  it('is false for a plain user', () => {
    process.env.BOOL_ADMIN_IDS = ''
    expect(isAdmin({ user: { id: 'zzz', role: 'user' } } as any)).toBe(false)
  })
})
