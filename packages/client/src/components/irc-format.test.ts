import { describe, it, expect } from 'vitest'
import { parseIrcText, linkify } from './irc-format.js'

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

  it('ESCAPES HTML angle brackets — no raw HTML in text output', () => {
    const result = parseIrcText('<script>alert(1)</script>')
    const allText = result.map((s) => s.text).join('')
    expect(allText).not.toContain('<script>')
    expect(allText).not.toContain('</script>')
    // Should contain escaped form
    expect(allText).toContain('&lt;script&gt;')
  })

  it('escapes & in body', () => {
    const result = parseIrcText('a & b')
    const allText = result.map((s) => s.text).join('')
    expect(allText).toContain('&amp;')
    expect(allText).not.toContain(' & ')
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

  it('does NOT produce raw HTML in text segments', () => {
    const result = linkify('<b>https://x.com</b>')
    const allText = result.map((s) => s.text).join('')
    expect(allText).not.toContain('<b>')
  })
})
