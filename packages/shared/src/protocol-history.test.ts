import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('history/search protocol', () => {
  it('bumped PROTOCOL_VERSION to 3', () => {
    expect(PROTOCOL_VERSION).toBe(4)
  })
  it('parses chat:search and history:request', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'chat:search', query: 'from:bob hello' })).type).toBe('chat:search')
    expect(parseClientMessage(JSON.stringify({ type: 'history:request', networkId: 1, target: '#x', limit: 50 })).type).toBe('history:request')
  })
  it('parses search:results and history:batch', () => {
    const sm = { id: 1, networkId: 1, target: '#x', sender: 'bob', kind: 'privmsg', body: 'hi', ts: 10 }
    expect(parseServerMessage(JSON.stringify({ type: 'search:results', query: 'hi', results: [sm] })).type).toBe('search:results')
    expect(parseServerMessage(JSON.stringify({ type: 'history:batch', networkId: 1, target: '#x', messages: [sm] })).type).toBe('history:batch')
  })
  it('rejects a search missing query', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'chat:search' }))).toThrow()
  })
})
