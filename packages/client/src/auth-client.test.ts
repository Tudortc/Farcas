import { describe, it, expect, vi } from 'vitest'

vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn((config) => {
    // Collect plugins to simulate what better-auth does
    const plugins: Record<string, unknown>[] = config?.plugins ?? []
    const pluginMethods: Record<string, unknown> = {}
    for (const p of plugins) {
      // adminClient plugin adds an `admin` object
      if (typeof p === 'object' && p !== null && 'id' in p && p.id === 'admin') {
        pluginMethods.admin = {}
      }
    }
    return {
      signIn: { username: vi.fn() },
      signUp: { email: vi.fn() },
      signOut: vi.fn(),
      useSession: vi.fn(),
      ...pluginMethods,
    }
  }),
}))

vi.mock('better-auth/client/plugins', () => ({
  usernameClient: vi.fn(() => ({ id: 'username' })),
  adminClient: vi.fn(() => ({ id: 'admin' })),
}))

import { authClient } from './auth-client.js'

describe('auth-client', () => {
  it('exposes username sign-in, email sign-up, sign-out and useSession', () => {
    expect(typeof authClient.signIn.username).toBe('function')
    expect(typeof authClient.signUp.email).toBe('function')
    expect(typeof authClient.signOut).toBe('function')
    expect(typeof authClient.useSession).toBe('function')
    expect(typeof authClient.admin).toBe('object')
  })
})
