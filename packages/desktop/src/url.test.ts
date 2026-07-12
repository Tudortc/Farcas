import { describe, it, expect } from 'vitest'
import { isExternalHttpUrl, isValidServerUrl, normalizeServerUrl } from './url.js'

describe('isExternalHttpUrl', () => {
  it('accepts https URL', () => {
    expect(isExternalHttpUrl('https://x.com')).toBe(true)
  })

  it('accepts http URL', () => {
    expect(isExternalHttpUrl('http://x')).toBe(true)
  })

  it('rejects file scheme', () => {
    expect(isExternalHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects javascript scheme', () => {
    expect(isExternalHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects data URI', () => {
    expect(isExternalHttpUrl('data:text/html,<h1>x</h1>')).toBe(false)
  })

  it('rejects smb scheme', () => {
    expect(isExternalHttpUrl('smb://x')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isExternalHttpUrl('')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isExternalHttpUrl('not a url !!!')).toBe(false)
  })
})

describe('isValidServerUrl', () => {
  it('accepts https URL with host', () => {
    expect(isValidServerUrl('https://irc.example.com')).toBe(true)
  })

  it('accepts http URL with localhost and port', () => {
    expect(isValidServerUrl('http://localhost:3030')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidServerUrl('')).toBe(false)
  })

  it('rejects ftp scheme', () => {
    expect(isValidServerUrl('ftp://x')).toBe(false)
  })

  it('rejects javascript scheme', () => {
    expect(isValidServerUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isValidServerUrl('not a url')).toBe(false)
  })
})

describe('normalizeServerUrl', () => {
  it('adds https:// to a bare host', () => {
    expect(normalizeServerUrl('example.com')).toBe('https://example.com')
  })

  it('trims whitespace', () => {
    expect(normalizeServerUrl('  https://example.com  ')).toBe('https://example.com')
  })

  it('strips trailing slash', () => {
    expect(normalizeServerUrl('https://example.com/')).toBe('https://example.com')
  })

  it('handles bare host with port', () => {
    expect(normalizeServerUrl('localhost:3030')).toBe('https://localhost:3030')
  })

  it('preserves http scheme', () => {
    expect(normalizeServerUrl('http://localhost:3030')).toBe('http://localhost:3030')
  })
})
