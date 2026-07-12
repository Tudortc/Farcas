/**
 * URL utilities for bool desktop — electron-free, fully testable.
 */

/**
 * Returns true if `raw` is a valid http/https URL with a non-empty host.
 * Rejects empty strings, non-http/https schemes, and unparseable input.
 */
export function isValidServerUrl(raw: string): boolean {
  if (!raw || !raw.trim()) return false
  try {
    const url = new URL(raw)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

/**
 * Normalises a raw server URL:
 * - Trims surrounding whitespace
 * - Prepends `https://` when no scheme is present
 * - Strips a trailing slash
 */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim()
  // Add scheme if missing
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  // Strip trailing slash
  return withScheme.replace(/\/$/, '')
}
