/**
 * Link preview fetcher with SSRF guard, caching, and redirect re-validation.
 *
 * Security properties:
 *  - All fetches go through assertPublicUrl (blocks private/reserved IPs)
 *  - The actual HTTP connection is PINNED to the pre-validated IP via a custom
 *    lookup option on the http(s).get call — so DNS rebinding cannot swap the
 *    address after validation.
 *  - Each redirect Location is re-validated via assertPublicUrl before following.
 *  - Body capped at 512 KB; total time capped at 5 s; max 3 redirects.
 *  - Results (ok and not-ok) are cached in link_previews to avoid re-fetching.
 */

import * as http from 'node:http'
import * as https from 'node:https'
import { getDb } from './db.js'
import { assertPublicUrl, type LookupFn } from './ssrf.js'

// ---------------------------------------------------------------------------
// Meta extraction
// ---------------------------------------------------------------------------

/** Decode common HTML entities in attribute values / title text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
}

/**
 * Extract Open Graph / title / description from raw HTML.
 * Prefers og:* over plain title/description.
 * Uses lightweight regex — no full HTML parser dependency.
 */
export function extractMeta(html: string): {
  title?: string
  description?: string
  image?: string
  siteName?: string
} {
  // Match <meta property="og:*" content="..."> or <meta content="..." property="og:*">
  // Also handles single quotes and missing closing slash.
  function metaProp(prop: string): string | undefined {
    // Try property="prop" content="val" (both orderings, both quote styles)
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*?)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']${prop}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m) return decodeEntities(m[1]!)
    }
    return undefined
  }

  function metaName(name: string): string | undefined {
    const patterns = [
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*?)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']${name}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m) return decodeEntities(m[1]!)
    }
    return undefined
  }

  const ogTitle = metaProp('og:title')
  const ogDescription = metaProp('og:description')
  const ogImage = metaProp('og:image')
  const ogSiteName = metaProp('og:site_name')

  // Fall back to <title>...</title>
  let plainTitle: string | undefined
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (titleMatch) plainTitle = decodeEntities(titleMatch[1]!.trim())

  // Fall back to <meta name="description">
  const plainDesc = metaName('description')

  // Only allow absolute http/https image URLs — drop data:, blob:, javascript:, etc.
  const safeImage = ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : undefined

  return {
    title: ogTitle ?? plainTitle,
    description: ogDescription ?? plainDesc,
    image: safeImage,
    siteName: ogSiteName,
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheRow {
  url: string
  ok: number
  title: string | null
  description: string | null
  image: string | null
  site_name: string | null
  fetched_at: number
}

function getCached(url: string): PreviewResult | null {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM link_previews WHERE url = ?')
    .get(url) as CacheRow | undefined
  if (!row) return null
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null
  return {
    url: row.url,
    ok: row.ok === 1,
    ...(row.title != null ? { title: row.title } : {}),
    ...(row.description != null ? { description: row.description } : {}),
    ...(row.image != null ? { image: row.image } : {}),
    ...(row.site_name != null ? { siteName: row.site_name } : {}),
  }
}

function upsertCache(result: PreviewResult): void {
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO link_previews (url, ok, title, description, image, site_name, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.url,
    result.ok ? 1 : 0,
    result.title ?? null,
    result.description ?? null,
    result.image ?? null,
    result.siteName ?? null,
    Date.now(),
  )
}

// ---------------------------------------------------------------------------
// Preview result type
// ---------------------------------------------------------------------------

export interface PreviewResult {
  url: string
  ok: boolean
  title?: string
  description?: string
  image?: string
  siteName?: string
}

// ---------------------------------------------------------------------------
// Real network fetch (pinned to validated IP)
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 512 * 1024 // 512 KB
const FETCH_TIMEOUT_MS = 5_000
const MAX_REDIRECTS = 3
const USER_AGENT = 'bool-link-preview/1.0'

/**
 * Make a single GET request to url, with the connection pinned to `ip`
 * (defeats DNS rebinding).  Returns the HTML body (up to MAX_BODY_BYTES).
 * Throws on error, non-2xx, timeout, or body overflow.
 * Does NOT follow redirects — caller handles them.
 */
function pinnedGet(url: URL, ip: string): Promise<{ body: string; location?: string; status: number }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http

    const timer = setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      // Pin to the pre-validated IP to prevent DNS rebinding
      lookup: (_hostname: string, _opts: unknown, callback: (err: Error | null, address: string, family: number) => void) => {
        callback(null, ip, ip.includes(':') ? 6 : 4)
      },
    }

    const req = mod.get(options as any, (res) => {
      clearTimeout(timer)

      const status = res.statusCode ?? 0
      const location = res.headers['location'] as string | undefined

      // For redirects, return without reading body
      if (status >= 300 && status < 400) {
        res.resume() // drain
        resolve({ body: '', location, status })
        return
      }

      if (status < 200 || status >= 300) {
        res.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }

      const chunks: Buffer[] = []
      let totalBytes = 0

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_BODY_BYTES) {
          req.destroy()
          reject(new Error('body too large'))
          return
        }
        chunks.push(chunk)
      })

      res.on('end', () => {
        resolve({ body: Buffer.concat(chunks).toString('utf8'), status })
      })

      res.on('error', reject)
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    // Also set a socket timeout as a safety net
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('socket timeout'))
    })
  })
}

// ---------------------------------------------------------------------------
// Default real fetchHtml (injectable for tests)
// ---------------------------------------------------------------------------

export type FetchHtmlFn = (url: URL, ip: string) => Promise<string>
export type AssertPublicUrlFn = typeof assertPublicUrl

export interface FetchPreviewDeps {
  fetchHtml?: FetchHtmlFn
  assertPublicUrl?: AssertPublicUrlFn
  lookup?: LookupFn
}

/**
 * Real fetchHtml implementation: follows up to MAX_REDIRECTS, re-validating
 * each redirect target via assertPublicUrl before following.
 */
async function realFetchHtml(
  initialUrl: URL,
  initialIp: string,
  assertFn: AssertPublicUrlFn,
  lookupFn: LookupFn | undefined,
): Promise<string> {
  let url = initialUrl
  let ip = initialIp
  let redirects = 0

  while (true) {
    const res = await pinnedGet(url, ip)

    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error('redirect with no Location')
      if (redirects >= MAX_REDIRECTS) throw new Error('too many redirects')
      redirects++

      // Re-validate the redirect target — this is the DNS rebinding guard for
      // multi-hop redirects.
      const nextUrl = new URL(res.location, url)
      const validated = await assertFn(nextUrl.toString(), lookupFn ? { lookup: lookupFn } : undefined)
      url = validated.url
      ip = validated.ip
      continue
    }

    return res.body
  }
}

// ---------------------------------------------------------------------------
// fetchPreview — public API
// ---------------------------------------------------------------------------

/**
 * Fetch a link preview for `url`.
 *
 * 1. Check cache — return if fresh.
 * 2. assertPublicUrl to validate & resolve the host (throws → ok:false, cached).
 * 3. Fetch HTML pinned to the validated IP (redirect re-validated).
 * 4. extractMeta, cache, return.
 *
 * All failures → { url, ok: false } (also cached to avoid hammering bad URLs).
 *
 * `deps` is injectable for tests — replace fetchHtml and/or assertPublicUrl
 * with fakes so tests require no real network.
 */
export async function fetchPreview(
  url: string,
  deps?: FetchPreviewDeps,
): Promise<PreviewResult> {
  // 1. Cache check
  const cached = getCached(url)
  if (cached) return cached

  const assertFn = deps?.assertPublicUrl ?? assertPublicUrl
  const lookupFn = deps?.lookup

  // 2. SSRF guard
  let validated: { url: URL; ip: string }
  try {
    validated = await assertFn(url, lookupFn ? { lookup: lookupFn } : undefined)
  } catch {
    const result: PreviewResult = { url, ok: false }
    upsertCache(result)
    return result
  }

  // 3. Fetch
  try {
    let html: string
    if (deps?.fetchHtml) {
      html = await deps.fetchHtml(validated.url, validated.ip)
    } else {
      html = await realFetchHtml(validated.url, validated.ip, assertFn, lookupFn)
    }

    // 4. Extract meta & cache
    const meta = extractMeta(html)
    const result: PreviewResult = { url, ok: true, ...meta }
    upsertCache(result)
    return result
  } catch {
    const result: PreviewResult = { url, ok: false }
    upsertCache(result)
    return result
  }
}
