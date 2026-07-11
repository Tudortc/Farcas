import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('protocol', () => {
  it('parses a valid hello', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'hello', clientVersion: 1 }))
    expect(msg).toEqual({ type: 'hello', clientVersion: 1 })
  })

  it('parses a valid welcome', () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, serverTime: 123 }),
    )
    expect(msg.type).toBe('welcome')
  })

  it('rejects an unknown client type', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'nope' }))).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseClientMessage('{not json')).toThrow()
  })

  it('rejects a hello missing clientVersion', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'hello' }))).toThrow()
  })
})
