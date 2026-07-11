import { describe, it, expect } from 'vitest'
import { parsePushPayload } from './push-payload.js'

describe('parsePushPayload', () => {
  it('parses a valid JSON push payload', () => {
    const raw = JSON.stringify({
      title: 't',
      body: 'b',
      tag: 'x',
      data: { networkId: 1, target: '#a' },
    })
    expect(parsePushPayload(raw)).toEqual({
      title: 't',
      body: 'b',
      tag: 'x',
      data: { networkId: 1, target: '#a' },
    })
  })

  it('returns safe defaults for malformed JSON', () => {
    expect(parsePushPayload('not json')).toEqual({ title: 'bool', body: '' })
  })

  it('returns safe defaults for undefined input', () => {
    expect(parsePushPayload(undefined)).toEqual({ title: 'bool', body: '' })
  })
})
