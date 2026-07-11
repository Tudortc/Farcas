import { describe, it, expect, vi, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { getDb } from '../db.js'
import { ensureAppSchema } from '../schema.js'
import { createNetwork } from '../networks.js'
import { IrcManager } from './manager.js'
import type { IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

function fakeClient(): IrcClientLike {
  const ee = new EventEmitter() as any
  ee.user = { nick: 'bool' }
  ee.network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
  ee.say = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  return ee
}

beforeAll(() => ensureAppSchema(getDb()))

describe('IrcManager', () => {
  it('connects a network and routes events to the hub; say() delegates', () => {
    const clients: any[] = []
    const mgr = new IrcManager(() => {
      const c = fakeClient()
      clients.push(c)
      return c
    })
    const net = createNetwork('userM', { name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const out: ServerMessage[] = []
    mgr.getHub().subscribe('userM', (m) => out.push(m))
    mgr.connectNetwork('userM', net.id)

    expect(mgr.isConnected('userM', net.id)).toBe(true)
    expect(out.some((m) => m.type === 'net:state' && (m as any).state === 'registered')).toBe(true)

    mgr.say('userM', net.id, '#x', 'hi')
    expect(clients[0].say).toHaveBeenCalledWith('#x', 'hi')
  })

  it('is idempotent per user:network and isolates users', () => {
    const mgr = new IrcManager(() => fakeClient())
    const netA = createNetwork('userA2', { name: 'N', host: 'h', port: 1, tls: false, nick: 'a' })
    mgr.connectNetwork('userA2', netA.id)
    const first = mgr.getConnection('userA2', netA.id)
    mgr.connectNetwork('userA2', netA.id)
    expect(mgr.getConnection('userA2', netA.id)).toBe(first) // reused
    expect(mgr.getConnection('userB2', netA.id)).toBeUndefined() // other user isolated
  })

  it('say returns false when not connected', () => {
    const mgr = new IrcManager(() => fakeClient())
    expect(mgr.say('nobody', 999, '#x', 'hi')).toBe(false)
  })

  it('disconnectNetwork removes the connection and marks it disconnected', () => {
    const mgr = new IrcManager(() => fakeClient())
    const net = createNetwork('userDN', { name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' })
    mgr.connectNetwork('userDN', net.id)
    expect(mgr.getConnection('userDN', net.id)).toBeDefined()
    expect(mgr.isConnected('userDN', net.id)).toBe(true)

    mgr.disconnectNetwork('userDN', net.id)

    expect(mgr.getConnection('userDN', net.id)).toBeUndefined()
    expect(mgr.isConnected('userDN', net.id)).toBe(false)
  })
})
