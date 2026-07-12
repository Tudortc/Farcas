import { describe, it, expect } from 'vitest'
import { parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('media protocol v6', () => {
  it('is version 6', () => expect(PROTOCOL_VERSION).toBe(6))

  it('parses preview:result with ok:true and all optional fields', () => {
    const m = parseServerMessage(
      JSON.stringify({
        type: 'preview:result',
        url: 'https://example.com/article',
        ok: true,
        title: 'Example Article',
        description: 'A brief description',
        image: 'https://example.com/og.png',
        siteName: 'Example',
      }),
    )
    expect(m).toMatchObject({
      type: 'preview:result',
      url: 'https://example.com/article',
      ok: true,
      title: 'Example Article',
      description: 'A brief description',
      image: 'https://example.com/og.png',
      siteName: 'Example',
    })
  })

  it('parses preview:result with ok:false (no optional fields)', () => {
    const m = parseServerMessage(
      JSON.stringify({
        type: 'preview:result',
        url: 'https://blocked.example.com',
        ok: false,
      }),
    )
    expect(m).toMatchObject({ type: 'preview:result', url: 'https://blocked.example.com', ok: false })
  })

  it('rejects preview:result missing required url', () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ type: 'preview:result', ok: true })),
    ).toThrow()
  })

  it('rejects preview:result missing required ok', () => {
    expect(() =>
      parseServerMessage(JSON.stringify({ type: 'preview:result', url: 'https://example.com' })),
    ).toThrow()
  })
})
