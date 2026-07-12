import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('read-state protocol', () => {
  it('bumped PROTOCOL_VERSION to 6', () => {
    expect(PROTOCOL_VERSION).toBe(6)
  })
  it('parses read:set and read:list (client)', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'read:set', networkId: 1, target: '#x', ts: 10 })).type).toBe('read:set')
    expect(parseClientMessage(JSON.stringify({ type: 'read:list' })).type).toBe('read:list')
  })
  it('parses read:update and read:list (server)', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'read:update', networkId: 1, target: '#x', ts: 10 })).type).toBe('read:update')
    expect(parseServerMessage(JSON.stringify({ type: 'read:list', markers: [{ networkId: 1, target: '#x', ts: 10 }] })).type).toBe('read:list')
  })
  it('rejects read:set missing ts', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'read:set', networkId: 1, target: '#x' }))).toThrow()
  })
})
