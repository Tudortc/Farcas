import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractMeta, fetchPreview } from './link-preview.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'

// Ensure schema is set up before tests
beforeEach(() => {
  ensureAppSchema(getDb())
  // Clear the cache between tests
  getDb().exec('DELETE FROM link_previews')
})

describe('extractMeta', () => {
  it('extracts og:title, og:description, og:image, og:site_name', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="OG Description" />
          <meta property="og:image" content="https://example.com/img.png" />
          <meta property="og:site_name" content="Example Site" />
          <title>Page Title</title>
        </head>
        <body><p>content</p></body>
      </html>
    `
    const meta = extractMeta(html)
    expect(meta.title).toBe('OG Title')
    expect(meta.description).toBe('OG Description')
    expect(meta.image).toBe('https://example.com/img.png')
    expect(meta.siteName).toBe('Example Site')
  })

  it('prefers og:title over <title>', () => {
    const html = `
      <html><head>
        <title>Plain Title</title>
        <meta property="og:title" content="OG Title" />
      </head></html>
    `
    const meta = extractMeta(html)
    expect(meta.title).toBe('OG Title')
  })

  it('falls back to <title> when no og:title', () => {
    const html = `<html><head><title>Plain Title</title></head></html>`
    const meta = extractMeta(html)
    expect(meta.title).toBe('Plain Title')
  })

  it('falls back to <meta name="description"> when no og:description', () => {
    const html = `
      <html><head>
        <meta name="description" content="Plain description" />
      </head></html>
    `
    const meta = extractMeta(html)
    expect(meta.description).toBe('Plain description')
  })

  it('HTML-entity-decodes &amp; &lt; &gt; &quot; &#39;', () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Rocks &amp; Rolls &lt;3 &quot;quotes&quot; &#39;apos&#39;" />
      </head></html>
    `
    const meta = extractMeta(html)
    expect(meta.title).toBe("Rocks & Rolls <3 \"quotes\" 'apos'")
  })

  it('returns empty object for empty HTML', () => {
    const meta = extractMeta('')
    expect(meta.title).toBeUndefined()
    expect(meta.description).toBeUndefined()
    expect(meta.image).toBeUndefined()
    expect(meta.siteName).toBeUndefined()
  })

  it('drops og:image with javascript: scheme', () => {
    const html = `<meta property="og:image" content="javascript:alert(1)" />`
    const meta = extractMeta(html)
    expect(meta.image).toBeUndefined()
  })

  it('drops og:image with data: scheme', () => {
    const html = `<meta property="og:image" content="data:image/png;base64,abc" />`
    const meta = extractMeta(html)
    expect(meta.image).toBeUndefined()
  })

  it('keeps og:image with https: scheme', () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/img.png" />`
    const meta = extractMeta(html)
    expect(meta.image).toBe('https://cdn.example.com/img.png')
  })

  it('keeps og:image with http: scheme', () => {
    const html = `<meta property="og:image" content="http://example.com/img.png" />`
    const meta = extractMeta(html)
    expect(meta.image).toBe('http://example.com/img.png')
  })

  it('handles self-closing meta tags with double-quoted content', () => {
    const html = `<meta property="og:title" content="Self Closing" />`
    const meta = extractMeta(html)
    expect(meta.title).toBe('Self Closing')
  })

  it('handles meta tags with single-quoted content', () => {
    const html = `<meta property='og:title' content='Single Quotes' />`
    const meta = extractMeta(html)
    expect(meta.title).toBe('Single Quotes')
  })
})

describe('fetchPreview', () => {
  const okHtml = `
    <html><head>
      <meta property="og:title" content="Test Page" />
      <meta property="og:description" content="Test description" />
    </head><body>content</body></html>
  `

  it('returns ok:true with meta when fetcher returns HTML', async () => {
    const mockFetchHtml = vi.fn().mockResolvedValue(okHtml)
    const mockAssertPublicUrl = vi.fn().mockResolvedValue({ url: new URL('https://example.com/'), ip: '1.1.1.1' })

    const result = await fetchPreview('https://example.com/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })

    expect(result.ok).toBe(true)
    expect(result.url).toBe('https://example.com/')
    expect(result.title).toBe('Test Page')
    expect(result.description).toBe('Test description')
    expect(mockFetchHtml).toHaveBeenCalledOnce()
  })

  it('caches result: second call does not re-fetch', async () => {
    const mockFetchHtml = vi.fn().mockResolvedValue(okHtml)
    const mockAssertPublicUrl = vi.fn().mockResolvedValue({ url: new URL('https://cache-test.com/'), ip: '1.1.1.1' })

    await fetchPreview('https://cache-test.com/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })
    const result2 = await fetchPreview('https://cache-test.com/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })

    expect(mockFetchHtml).toHaveBeenCalledOnce() // only called once despite two fetchPreview calls
    expect(result2.ok).toBe(true)
    expect(result2.title).toBe('Test Page')
  })

  it('returns ok:false and does NOT call fetcher when assertPublicUrl throws', async () => {
    const mockFetchHtml = vi.fn()
    const mockAssertPublicUrl = vi.fn().mockRejectedValue(new Error('SSRF blocked: private IP'))

    const result = await fetchPreview('https://internal.local/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })

    expect(result.ok).toBe(false)
    expect(result.url).toBe('https://internal.local/')
    expect(mockFetchHtml).not.toHaveBeenCalled()
  })

  it('caches negative result: second call for blocked URL skips assertPublicUrl', async () => {
    const mockFetchHtml = vi.fn()
    const mockAssertPublicUrl = vi.fn().mockRejectedValue(new Error('blocked'))

    await fetchPreview('https://blocked.local/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })
    // second call — should return from cache, not call assertPublicUrl again
    const result2 = await fetchPreview('https://blocked.local/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })

    expect(result2.ok).toBe(false)
    expect(mockAssertPublicUrl).toHaveBeenCalledOnce()
  })

  it('returns ok:false when fetchHtml throws', async () => {
    const mockFetchHtml = vi.fn().mockRejectedValue(new Error('timeout'))
    const mockAssertPublicUrl = vi.fn().mockResolvedValue({ url: new URL('https://timeout.com/'), ip: '1.1.1.1' })

    const result = await fetchPreview('https://timeout.com/', {
      fetchHtml: mockFetchHtml,
      assertPublicUrl: mockAssertPublicUrl,
    })

    expect(result.ok).toBe(false)
    expect(result.url).toBe('https://timeout.com/')
  })
})
