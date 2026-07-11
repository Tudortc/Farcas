import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { createNetwork, listNetworks, getNetwork, removeNetwork } from './networks.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('NetworkStore', () => {
  it('creates, lists, gets and removes networks scoped by user', () => {
    const a = createNetwork('userA', { name: 'Libera', host: 'irc.libera.chat', port: 6697, tls: true, nick: 'a', saslAccount: 'acc', saslPassword: 'sekret' })
    createNetwork('userB', { name: 'OFTC', host: 'irc.oftc.net', port: 6697, tls: true, nick: 'b' })

    const listA = listNetworks('userA')
    expect(listA).toHaveLength(1)
    expect(listA[0]!.name).toBe('Libera')
    expect(listA[0]!.saslPassword).toBe('sekret') // decrypted on read

    // userB cannot see userA's network
    expect(getNetwork('userB', a.id)).toBeNull()

    removeNetwork('userA', a.id)
    expect(listNetworks('userA')).toHaveLength(0)
  })

  it('stores the SASL password encrypted at rest', () => {
    const n = createNetwork('userC', { name: 'X', host: 'h', port: 1, tls: false, nick: 'c', saslAccount: 'acc', saslPassword: 'plaintextpw' })
    const raw = getDb().prepare('SELECT sasl_password FROM networks WHERE id = ?').get(n.id) as { sasl_password: string }
    expect(raw.sasl_password).not.toContain('plaintextpw')
  })

  it('removeNetwork returns the number of deleted rows', () => {
    const n = createNetwork('userDel', { name: 'Del', host: 'h', port: 6697, tls: true, nick: 'd' })
    const changes = removeNetwork('userDel', n.id)
    expect(changes).toBe(1)
    const missing = removeNetwork('userDel', n.id)
    expect(missing).toBe(0)
  })

  it('enforces a per-user limit of 50 networks', () => {
    const userId = 'userLimit'
    for (let i = 0; i < 50; i++) {
      createNetwork(userId, { name: `N${i}`, host: 'h', port: 6697, tls: true, nick: 'n' })
    }
    expect(() => createNetwork(userId, { name: 'overflow', host: 'h', port: 6697, tls: true, nick: 'n' })).toThrow('network limit reached')
  })
})
