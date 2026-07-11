import { describe, it, expect } from 'vitest'
import { Hub } from './hub.js'
import type { ServerMessage } from '@bool/shared'

const welcome: ServerMessage = { type: 'welcome', protocolVersion: 4, serverTime: 0 }

describe('Hub', () => {
  it('fans a message out to all of a user\'s sinks', () => {
    const hub = new Hub()
    const a: ServerMessage[] = []
    const b: ServerMessage[] = []
    hub.subscribe('u1', (m) => a.push(m))
    hub.subscribe('u1', (m) => b.push(m))
    hub.publish('u1', welcome)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })
  it('isolates users', () => {
    const hub = new Hub()
    const other: ServerMessage[] = []
    hub.subscribe('u2', (m) => other.push(m))
    hub.publish('u3', welcome)
    expect(other).toHaveLength(0)
  })
  it('unsubscribe stops delivery and cleans up', () => {
    const hub = new Hub()
    const got: ServerMessage[] = []
    const unsub = hub.subscribe('u4', (m) => got.push(m))
    unsub()
    hub.publish('u4', welcome)
    expect(got).toHaveLength(0)
    expect(hub.subscriberCount('u4')).toBe(0)
  })
  it('one throwing sink does not stop the others', () => {
    const hub = new Hub()
    const good: ServerMessage[] = []
    hub.subscribe('u5', () => { throw new Error('dead socket') })
    hub.subscribe('u5', (m) => good.push(m))
    expect(() => hub.publish('u5', welcome)).not.toThrow()
    expect(good).toHaveLength(1)
  })
})
