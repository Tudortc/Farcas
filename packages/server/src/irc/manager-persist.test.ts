import { describe, it, expect, vi, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { getDb } from '../db.js'
import { ensureAppSchema } from '../schema.js'
import { createNetwork } from '../networks.js'
import { searchMessages } from '../messages.js'
import { IrcManager } from './manager.js'
import type { IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

// Spy on storeMessage so we can force it to throw for the failure-isolation test
vi.mock('../messages.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../messages.js')>()
  return { ...original, storeMessage: vi.fn(original.storeMessage) }
})

// Re-import after mock so we get the spy
const { storeMessage } = await import('../messages.js')

function fakeClient(): IrcClientLike {
  const ee = new EventEmitter() as any
  ee.user = { nick: 'bool' }
  ee.network = { name: 'N', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
  ee.say = vi.fn()
  ee.tagmsg = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  ee.removeAllListeners = vi.fn((...args: any[]) => {
    EventEmitter.prototype.removeAllListeners.apply(ee, args)
    return ee
  })
  return ee
}

beforeAll(() => ensureAppSchema(getDb()))

describe('IrcManager persistence', () => {
  it('persists relayed chat messages and still relays them via hub', () => {
    let client!: any
    const mgr = new IrcManager(() => (client = fakeClient()))
    const net = createNetwork('userP', { name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const relayed: any[] = []
    mgr.getHub().subscribe('userP', (m) => relayed.push(m))
    mgr.connectNetwork('userP', net.id)

    client.emit('message', { type: 'privmsg', nick: 'zed', target: '#p', message: 'persist this needle', tags: {}, time: 5 })

    expect(relayed.some((m) => m.type === 'chat:msg')).toBe(true) // still relayed via hub
    const found = searchMessages('userP', 'needle')
    expect(found).toHaveLength(1)
    expect(found[0]!.sender).toBe('zed')
    expect(found[0]!.networkId).toBe(net.id)
  })

  it('still relays privmsg via hub even when storeMessage throws (failure isolation)', () => {
    // Force storeMessage to throw once
    vi.mocked(storeMessage).mockImplementationOnce(() => {
      throw new Error('simulated DB failure')
    })

    let lastClient: any
    const mgr = new IrcManager(() => {
      const c = fakeClient()
      lastClient = c
      return c
    })

    const net = createNetwork('uIsolation', { name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const received: ServerMessage[] = []
    mgr.getHub().subscribe('uIsolation', (m) => received.push(m))
    mgr.connectNetwork('uIsolation', net.id)

    // Emit a privmsg — storeMessage will throw, but the message must still reach the hub
    lastClient.emit('message', {
      type: 'privmsg',
      nick: 'alice',
      target: '#test',
      message: 'hello despite db error',
    })

    const chatMsgs = received.filter((m) => m.type === 'chat:msg')
    expect(chatMsgs).toHaveLength(1)
    expect((chatMsgs[0] as any).text).toBe('hello despite db error')
    expect((chatMsgs[0] as any).from).toBe('alice')
  })
})
