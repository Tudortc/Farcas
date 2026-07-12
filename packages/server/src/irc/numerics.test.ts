import { describe, it, expect } from 'vitest'
import { formatNumeric } from './numerics.js'

describe('formatNumeric', () => {
  it('formats a WHOIS reply, dropping our own nick', () =>
    expect(formatNumeric(':server 311 bool alice ~u host * :Real Name', 'bool')).toBe('alice ~u host * Real Name'))
  it('formats a LIST reply', () =>
    expect(formatNumeric(':server 322 bool #chan 42 :a topic', 'bool')).toBe('#chan 42 a topic'))
  it('returns null for non-numeric commands', () =>
    expect(formatNumeric(':bob!u@h PRIVMSG #x :hi', 'bool')).toBeNull())
  it('suppresses NAMES/TOPIC numerics already handled elsewhere', () => {
    expect(formatNumeric(':server 353 bool = #x :bob alice', 'bool')).toBeNull()
    expect(formatNumeric(':server 366 bool #x :End of NAMES', 'bool')).toBeNull()
    expect(formatNumeric(':server 332 bool #x :the topic', 'bool')).toBeNull()
    expect(formatNumeric(':server 333 bool #x setter 12345', 'bool')).toBeNull()
  })
  it('handles a line with no prefix', () =>
    expect(formatNumeric('421 bool FOO :Unknown command', 'bool')).toBe('FOO Unknown command'))
})
