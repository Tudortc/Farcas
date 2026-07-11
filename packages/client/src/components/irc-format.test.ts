import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { parseIrcText, linkify } from './irc-format.js'
import { MessageRow } from './MessageRow.js'
import type { StoredMsg } from '@bool/shared'

describe('parseIrcText', () => {
  it('returns plain text segment for plain string', () => {
    const result = parseIrcText('hello world')
    expect(result).toEqual([{ text: 'hello world' }])
  })

  it('parses a mIRC color code 4 (red) into a red segment', () => {
    const result = parseIrcText('\x034red text\x03')
    // At least one segment with the colored text; trailing empty reset segment may not be emitted
    expect(result.length).toBeGreaterThanOrEqual(1)
    const seg = result.find((s) => s.text === 'red text')
    expect(seg).toBeDefined()
    expect(seg?.color).toBe('var(--m-red)')
  })

  it('parses mIRC color code 3 (green)', () => {
    const result = parseIrcText('\x033green\x03')
    const colored = result.find((s) => s.text === 'green')
    expect(colored).toBeDefined()
    expect(colored?.color).toBe('var(--m-green)')
  })

  it('parses bold control code \\x02', () => {
    const result = parseIrcText('\x02bold\x02')
    const bold = result.find((s) => s.bold)
    expect(bold).toBeDefined()
    expect(bold?.text).toBe('bold')
  })

  it('parses underline control code \\x1f', () => {
    const result = parseIrcText('\x1funderlined\x1f')
    const ul = result.find((s) => s.underline)
    expect(ul).toBeDefined()
    expect(ul?.text).toBe('underlined')
  })

  it('resets formatting on \\x0f', () => {
    const result = parseIrcText('\x02bold\x0fplain')
    const plain = result.find((s) => s.text === 'plain')
    expect(plain).toBeDefined()
    expect(plain?.bold).toBeFalsy()
  })

  it('handles nested bold + color', () => {
    const result = parseIrcText('\x034\x02red bold\x03')
    const seg = result.find((s) => s.text === 'red bold')
    expect(seg).toBeDefined()
    expect(seg?.bold).toBe(true)
    expect(seg?.color).toBe('var(--m-red)')
  })

  it('returns RAW text — angle brackets are NOT HTML-escaped', () => {
    const result = parseIrcText('<world>')
    const allText = result.map((s) => s.text).join('')
    // Raw text passes through; React will escape when rendering
    expect(allText).toBe('<world>')
    expect(allText).not.toContain('&lt;')
    expect(allText).not.toContain('&gt;')
  })

  it('returns RAW text — ampersand is NOT HTML-escaped', () => {
    const result = parseIrcText('a & b')
    const allText = result.map((s) => s.text).join('')
    expect(allText).toBe('a & b')
    expect(allText).not.toContain('&amp;')
  })

  it('handles empty string', () => {
    const result = parseIrcText('')
    expect(result).toEqual([])
  })
})

describe('linkify', () => {
  it('linkifies https URLs', () => {
    const result = linkify('check https://x.com out')
    const link = result.find((s) => s.url)
    expect(link).toBeDefined()
    expect(link?.url).toBe('https://x.com')
    expect(link?.text).toBe('https://x.com')
  })

  it('splits text around a URL into [text, link, text] segments', () => {
    const result = linkify('before https://example.com after')
    expect(result.length).toBeGreaterThanOrEqual(3)
    const link = result.find((s) => s.url)
    expect(link).toBeDefined()
  })

  it('returns single text segment when no URLs present', () => {
    const result = linkify('no links here')
    expect(result).toEqual([{ text: 'no links here' }])
  })

  it('returns RAW text in text segments — no HTML escaping', () => {
    const result = linkify('<b>hello</b>')
    const allText = result.map((s) => s.text).join('')
    expect(allText).toBe('<b>hello</b>')
    expect(allText).not.toContain('&lt;')
  })

  it('does NOT linkify javascript: URLs — rendered as plain text', () => {
    const result = linkify('javascript:alert(1)')
    // Should have no url property (treated as plain text)
    const link = result.find((s) => s.url)
    expect(link).toBeUndefined()
  })
})

// ---- XSS safety — render-layer tests ----

function makeMsg(body: string): StoredMsg {
  return { id: 1, networkId: 1, target: '#test', sender: 'nick', body, ts: Date.now(), kind: 'privmsg' }
}

describe('IrcBody XSS safety (render layer)', () => {
  it('renders <img src=x onerror=...> as text, not an img element', () => {
    const xss = '<img src=x onerror="alert(1)">'
    const { container } = render(React.createElement(MessageRow, { msg: makeMsg(xss) }))
    // React must NOT create an img element from the body text
    expect(container.querySelector('img')).toBeNull()
    // The literal text should appear as text content (possibly partial)
    expect(container.textContent).toContain('<img')
  })

  it('renders <script>alert(1)</script> as text, not a script element', () => {
    const xss = '<script>alert(1)</script>'
    const { container } = render(React.createElement(MessageRow, { msg: makeMsg(xss) }))
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('does not linkify javascript: scheme — no href with javascript:', () => {
    const xss = 'javascript:alert(1)'
    const { container } = render(React.createElement(MessageRow, { msg: makeMsg(xss) }))
    const anchors = Array.from(container.querySelectorAll('a'))
    const hasJsHref = anchors.some((a) => a.href.startsWith('javascript:'))
    expect(hasJsHref).toBe(false)
  })
})
