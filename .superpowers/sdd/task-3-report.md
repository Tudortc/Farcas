# Task 3 Report — SSRF-guarded link preview fetcher + cache + relay wiring

## Status
DONE — all tests green (172/172), typecheck clean, committed.

## IP-pinning Approach

The actual HTTP/HTTPS GET is made via Node's built-in `http`/`https` modules with a **custom `lookup` option** that returns only the pre-validated IP address:

```typescript
lookup: (_hostname, _opts, callback) => {
  callback(null, ip, ip.includes(':') ? 6 : 4)
},
```

This means the OS's DNS resolver is bypassed entirely for the actual connection — the socket dials the IP that was already checked through `isBlockedAddress`. Even if DNS returns a different address between the validation and the dial (DNS rebinding), the socket still connects to the validated IP.

## Redirect Re-validation

Redirects are NOT followed automatically by the `http.get` call. The response handler detects a 3xx status, reads the `Location` header, then calls `assertPublicUrl(nextUrl)` on the redirect target before following it:

```
pinnedGet(url, ip) → 3xx + Location
  → assertPublicUrl(location)   // NEW DNS resolution + SSRF check
  → pinnedGet(newUrl, newIp)    // Pinned to the newly-validated IP
  → repeat up to MAX_REDIRECTS (3)
```

This means every redirect hop independently validates the target host's resolved IPs. A redirect from `https://public.com` to `http://169.254.1.1/secret` is caught and aborted before any connection is made to the link-local address.

## Blocked Ranges

`isBlockedAddress` covers:
- IPv4: `0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16`, `172.16/12`, `192.168/16`
- IPv6: `::` (unspecified), `::1` (loopback), `fc00::/7` (ULA), `fe80::/10` (link-local)
- IPv4-mapped IPv6 (`::ffff:a.b.c.d`) — extracts the embedded IPv4 and applies the IPv4 checks

## Mixed-address Guard

If DNS returns a mix of public and private addresses for a hostname, `assertPublicUrl` **rejects the entire request** — it checks ALL resolved addresses, not just the first one. This prevents a crafted DNS response from sneaking in a private address alongside a public one.

## Caching

Results (both ok and not-ok) are stored in `link_previews` with a 1-hour TTL. Negative results (blocked, timeout, parse failure) are also cached to avoid hammering bad URLs on every message repeat.

## Injectability for Tests

`fetchPreview(url, deps?)` accepts:
- `deps.assertPublicUrl` — replace with a mock that throws (blocked) or resolves (public)
- `deps.fetchHtml(url, ip)` — replace with a function returning HTML without any network
- `deps.lookup` — passed through to the real `assertPublicUrl` for unit tests of that path

No real network is used in any test.

## Files Changed

- Created: `packages/server/src/ssrf.ts`
- Created: `packages/server/src/link-preview.ts`
- Modified: `packages/server/src/schema.ts` (added `link_previews` table)
- Modified: `packages/server/src/irc/manager.ts` (preview kick-off in persistingSink)
- Created: `packages/server/src/ssrf.test.ts` (38 tests)
- Created: `packages/server/src/link-preview.test.ts` (13 tests)
