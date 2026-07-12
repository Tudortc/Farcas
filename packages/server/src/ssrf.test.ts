import { describe, it, expect } from 'vitest'
import { isBlockedAddress, assertPublicUrl } from './ssrf.js'

describe('isBlockedAddress', () => {
  describe('IPv4 blocked ranges', () => {
    it('blocks loopback 127.0.0.1', () => expect(isBlockedAddress('127.0.0.1')).toBe(true))
    it('blocks loopback 127.255.255.255', () => expect(isBlockedAddress('127.255.255.255')).toBe(true))
    it('blocks 10.0.0.5 (10/8)', () => expect(isBlockedAddress('10.0.0.5')).toBe(true))
    it('blocks 10.255.255.255 (10/8)', () => expect(isBlockedAddress('10.255.255.255')).toBe(true))
    it('blocks 172.16.0.1 (172.16/12)', () => expect(isBlockedAddress('172.16.0.1')).toBe(true))
    it('blocks 172.31.255.255 (172.16/12 end)', () => expect(isBlockedAddress('172.31.255.255')).toBe(true))
    it('blocks 192.168.1.1 (192.168/16)', () => expect(isBlockedAddress('192.168.1.1')).toBe(true))
    it('blocks 169.254.1.1 (link-local)', () => expect(isBlockedAddress('169.254.1.1')).toBe(true))
    it('blocks 0.0.0.0 (0/8)', () => expect(isBlockedAddress('0.0.0.0')).toBe(true))
    it('blocks 0.255.255.255 (0/8)', () => expect(isBlockedAddress('0.255.255.255')).toBe(true))
    it('blocks 100.64.0.1 (CGNAT 100.64/10)', () => expect(isBlockedAddress('100.64.0.1')).toBe(true))
    it('blocks 100.127.255.255 (CGNAT end)', () => expect(isBlockedAddress('100.127.255.255')).toBe(true))
  })

  describe('IPv6 blocked ranges', () => {
    it('blocks ::1 (loopback)', () => expect(isBlockedAddress('::1')).toBe(true))
    it('blocks :: (unspecified)', () => expect(isBlockedAddress('::')).toBe(true))
    it('blocks fc00::1 (ULA fc00::/7)', () => expect(isBlockedAddress('fc00::1')).toBe(true))
    it('blocks fd00::1 (ULA fd00::/7)', () => expect(isBlockedAddress('fd00::1')).toBe(true))
    it('blocks fe80::1 (link-local fe80::/10)', () => expect(isBlockedAddress('fe80::1')).toBe(true))
    it('blocks fe80::1%eth0 (link-local with zone id)', () => expect(isBlockedAddress('fe80::1%eth0')).toBe(true))
  })

  describe('IPv4-mapped IPv6', () => {
    it('blocks ::ffff:10.0.0.1 (mapped private)', () => expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true))
    it('blocks ::ffff:192.168.1.1 (mapped private)', () => expect(isBlockedAddress('::ffff:192.168.1.1')).toBe(true))
    it('blocks ::ffff:127.0.0.1 (mapped loopback)', () => expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true))
    it('does not block ::ffff:1.1.1.1 (mapped public)', () => expect(isBlockedAddress('::ffff:1.1.1.1')).toBe(false))
    it('blocks ::FFFF:A9FE:A9FE (uppercase IPv4-mapped link-local)', () => expect(isBlockedAddress('::FFFF:A9FE:A9FE')).toBe(true))
  })

  describe('NAT64 (64:ff9b::/96)', () => {
    it('blocks 64:ff9b::a9fe:a9fe (NAT64 link-local 169.254.169.254)', () => expect(isBlockedAddress('64:ff9b::a9fe:a9fe')).toBe(true))
    it('blocks 64:ff9b::7f00:1 (NAT64 loopback 127.0.0.1)', () => expect(isBlockedAddress('64:ff9b::7f00:1')).toBe(true))
    it('does not block 64:ff9b::808:808 (NAT64 public 8.8.8.8)', () => expect(isBlockedAddress('64:ff9b::808:808')).toBe(false))
  })

  describe('public addresses (must not block)', () => {
    it('allows 1.1.1.1', () => expect(isBlockedAddress('1.1.1.1')).toBe(false))
    it('allows 8.8.8.8', () => expect(isBlockedAddress('8.8.8.8')).toBe(false))
    it('allows 2606:4700::1', () => expect(isBlockedAddress('2606:4700::1')).toBe(false))
    it('allows 172.15.255.255 (just below 172.16/12)', () => expect(isBlockedAddress('172.15.255.255')).toBe(false))
    it('allows 172.32.0.0 (just above 172.31.255.255)', () => expect(isBlockedAddress('172.32.0.0')).toBe(false))
    it('allows 100.63.255.255 (just below CGNAT)', () => expect(isBlockedAddress('100.63.255.255')).toBe(false))
    it('allows 100.128.0.0 (just above CGNAT)', () => expect(isBlockedAddress('100.128.0.0')).toBe(false))
  })
})

describe('assertPublicUrl', () => {
  it('throws for file:// protocol', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow()
  })

  it('throws for ftp:// protocol', async () => {
    await expect(assertPublicUrl('ftp://example.com/file')).rejects.toThrow()
  })

  it('throws for javascript: protocol', async () => {
    await expect(assertPublicUrl('javascript:alert(1)')).rejects.toThrow()
  })

  it('throws when injected lookup returns a private IP', async () => {
    const lookup = async (_host: string) => ['10.0.0.5']
    await expect(
      assertPublicUrl('http://internal.example.com/', { lookup }),
    ).rejects.toThrow(/blocked|private|SSRF/i)
  })

  it('throws when ALL resolved IPs are private', async () => {
    const lookup = async (_host: string) => ['192.168.1.1', '172.16.0.1']
    await expect(
      assertPublicUrl('https://evil.example.com/', { lookup }),
    ).rejects.toThrow()
  })

  it('returns url and ip when lookup resolves to a public IP', async () => {
    const lookup = async (_host: string) => ['1.1.1.1']
    const result = await assertPublicUrl('https://example.com/path', { lookup })
    expect(result.ip).toBe('1.1.1.1')
    expect(result.url.hostname).toBe('example.com')
  })

  it('returns url and ip for IPv6 public address', async () => {
    const lookup = async (_host: string) => ['2606:4700::1']
    const result = await assertPublicUrl('https://cloudflare.com/', { lookup })
    expect(result.ip).toBe('2606:4700::1')
  })

  it('throws when ANY resolved address is private (mixed)', async () => {
    // If ANY address is blocked, reject — don't allow falling back to the blocked one
    const lookup = async (_host: string) => ['1.1.1.1', '127.0.0.1']
    await expect(
      assertPublicUrl('https://sneaky.example.com/', { lookup }),
    ).rejects.toThrow()
  })

  it('throws for empty lookup result', async () => {
    const lookup = async (_host: string) => []
    await expect(
      assertPublicUrl('https://nodns.example.com/', { lookup }),
    ).rejects.toThrow()
  })
})
