/**
 * SSRF protection utilities.
 *
 * isBlockedAddress: returns true for private/loopback/link-local/reserved IP
 * ranges that must never be dialed by the server on behalf of a user.
 *
 * assertPublicUrl: resolves a URL's host and throws if any resolved address is
 * blocked, ensuring the link-preview fetcher never dials internal hosts.
 */

import { isIP } from 'node:net'
import * as dns from 'node:dns/promises'

// ---------------------------------------------------------------------------
// IPv4 helpers
// ---------------------------------------------------------------------------

/** Parse an IPv4 dotted-decimal string into a 32-bit unsigned integer. */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

/** Return true if the numeric IPv4 address falls within a CIDR block. */
function inRange(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ip & mask) === (base & mask)
}

/**
 * The IPv4 CIDR ranges to block:
 *   0/8           — "This" network
 *   10/8          — Private
 *   100.64/10     — CGNAT / shared address space
 *   127/8         — Loopback
 *   169.254/16    — Link-local
 *   172.16/12     — Private
 *   192.168/16    — Private
 */
const BLOCKED_IPV4: Array<{ base: number; bits: number }> = [
  { base: ipv4ToInt('0.0.0.0'), bits: 8 },
  { base: ipv4ToInt('10.0.0.0'), bits: 8 },
  { base: ipv4ToInt('100.64.0.0'), bits: 10 },
  { base: ipv4ToInt('127.0.0.0'), bits: 8 },
  { base: ipv4ToInt('169.254.0.0'), bits: 16 },
  { base: ipv4ToInt('172.16.0.0'), bits: 12 },
  { base: ipv4ToInt('192.168.0.0'), bits: 16 },
]

function isBlockedIPv4(ip: string): boolean {
  const num = ipv4ToInt(ip)
  return BLOCKED_IPV4.some(({ base, bits }) => inRange(num, base, bits))
}

// ---------------------------------------------------------------------------
// IPv6 helpers
// ---------------------------------------------------------------------------

/**
 * Expand an IPv6 address to its full 32-hex-digit representation with colons.
 * Handles :: abbreviation and strips zone IDs (%eth0 etc).
 */
function expandIPv6(ip: string): string {
  // Strip zone ID and lowercase for case-insensitive prefix comparisons
  const withoutZone = ip.split('%')[0]!.toLowerCase()

  // Handle IPv4-mapped: ::ffff:a.b.c.d — normalize to hex form
  // (We handle this case separately in isBlockedAddress)

  const halves = withoutZone.split('::')
  if (halves.length > 2) return '' // invalid

  function groupsOf(s: string): string[] {
    return s === '' ? [] : s.split(':')
  }

  let left = groupsOf(halves[0] ?? '')
  let right = halves.length === 2 ? groupsOf(halves[1] ?? '') : []

  // Detect and handle embedded IPv4 in the right half (e.g. ::ffff:192.168.1.1)
  if (right.length > 0) {
    const last = right[right.length - 1]!
    if (last.includes('.')) {
      // IPv4 in right part — convert to two hex groups
      const octets = last.split('.').map(Number)
      const hi = ((octets[0]! << 8) | octets[1]!).toString(16).padStart(4, '0')
      const lo = ((octets[2]! << 8) | octets[3]!).toString(16).padStart(4, '0')
      right = [...right.slice(0, -1), hi, lo]
    }
  }

  const missing = 8 - left.length - right.length
  const middle = Array(missing).fill('0000')
  const groups = [...left, ...middle, ...right]

  return groups.map((g) => g.padStart(4, '0')).join(':')
}

function isBlockedIPv6(ip: string): boolean {
  const expanded = expandIPv6(ip)
  if (!expanded) return false

  // Unspecified address: ::
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return true

  // Loopback: ::1
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return true

  // Check IPv4-mapped: ::ffff:a.b.c.d — prefix is 0000:0000:0000:0000:0000:ffff
  if (expanded.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    // Extract the embedded IPv4 address from the last two groups
    const parts = expanded.split(':')
    const hi = parseInt(parts[6]!, 16)
    const lo = parseInt(parts[7]!, 16)
    const ipv4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
    return isBlockedIPv4(ipv4)
  }

  // NAT64: 64:ff9b::/96 — the well-known NAT64 prefix embeds an IPv4 in the
  // last 32 bits. Block if the embedded IPv4 is in a private/reserved range.
  // expanded is already lowercased so this comparison is case-insensitive.
  if (expanded.startsWith('0064:ff9b:0000:0000:0000:0000:')) {
    const parts = expanded.split(':')
    const hi = parseInt(parts[6]!, 16)
    const lo = parseInt(parts[7]!, 16)
    const ipv4 = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
    return isBlockedIPv4(ipv4)
  }

  // ULA: fc00::/7 — first byte high bits: 1111 1100 or 1111 1101
  // i.e. first two hex digits are fc or fd
  const firstGroup = parseInt(expanded.substring(0, 4), 16)
  if ((firstGroup & 0xfe00) === 0xfc00) return true

  // Link-local: fe80::/10 — first 10 bits are 1111 1110 10
  // First group: fe80 to febf
  if ((firstGroup & 0xffc0) === 0xfe80) return true

  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given IP address is in a private, loopback, link-local,
 * or otherwise reserved range that should not be contacted by the server.
 *
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 (::ffff:a.b.c.d).
 */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip.split('%')[0]!) // strip zone ID before checking
  if (version === 4) return isBlockedIPv4(ip)
  if (version === 6) return isBlockedIPv6(ip)
  // isIP returns 0 for invalid — treat as blocked to be safe
  return true
}

export type LookupFn = (host: string) => Promise<string[]>

const defaultLookup: LookupFn = async (host: string): Promise<string[]> => {
  const results = await dns.lookup(host, { all: true })
  return results.map((r) => r.address)
}

/**
 * Parses rawUrl, requires http/https, resolves the host via `deps.lookup`
 * (injectable for tests), and throws if ANY resolved address is blocked or
 * if no addresses resolve.
 *
 * Returns { url, ip } where ip is the first public address found.
 *
 * This is the SSRF guard entry point — call it before any network fetch.
 */
export async function assertPublicUrl(
  rawUrl: string,
  deps?: { lookup?: LookupFn },
): Promise<{ url: URL; ip: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`SSRF: invalid URL: ${rawUrl}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`SSRF: disallowed protocol: ${url.protocol}`)
  }

  const lookup = deps?.lookup ?? defaultLookup
  const addresses = await lookup(url.hostname)

  if (addresses.length === 0) {
    throw new Error(`SSRF: no addresses resolved for ${url.hostname}`)
  }

  // Reject if ANY resolved address is blocked — prevents partial SSRF via
  // a mix of public + private addresses returned by a crafted DNS response.
  for (const addr of addresses) {
    if (isBlockedAddress(addr)) {
      throw new Error(`SSRF: blocked address ${addr} for ${url.hostname}`)
    }
  }

  return { url, ip: addresses[0]! }
}
