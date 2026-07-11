import { describe, it, expect, vi, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { getDb } from '../db.js'
import { ensureAppSchema } from '../schema.js'
import { createNetwork } from '../networks.js'
import { searchMessages } from '../messages.js'
import { IrcManager } from './manager.js'
import type { IrcClientLike } from './connection.js'

function fakeClient(): IrcClientLike {
  const ee = new EventEmitter() as any
  ee.user = { nick: 'bool' }
  ee.network = { name: 'N', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
  ee.say = vi.fn(); ee.join = vi.fn(); ee.part = vi.fn(); ee.quit = vi.fn(); ee.changeNick = vi.fn(); ee.raw = vi.fn(); ee.removeAllListeners = vi.fn()
  return ee
}

beforeAll(() => ensureAppSchema(getDb()))

describe('IrcManager persistence', () => {
  it('persists relayed chat messages and still relays them', () => {
    let client!: any
    const mgr = new IrcManager(() => (client = fakeClient()))
    const net = createNetwork('userP', { name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const relayed: any[] = []
    mgr.connectNetwork('userP', net.id, (m) => relayed.push(m))

    client.emit('message', { type: 'privmsg', nick: 'zed', target: '#p', message: 'persist this needle', tags: {}, time: 5 })

    expect(relayed.some((m) => m.type === 'chat:msg')).toBe(true) // still relayed
    const found = searchMessages('userP', 'needle')
    expect(found).toHaveLength(1)
    expect(found[0]!.sender).toBe('zed')
    expect(found[0]!.networkId).toBe(net.id)
  })
})
