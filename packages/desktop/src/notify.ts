/**
 * Notification helpers for bool desktop — electron-free, fully testable.
 *
 * `buildNotification` sanitises and truncates a mention/DM payload for display
 * as an OS native notification. `shouldNotify` gates whether the notification
 * should be shown based on window focus state.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPayload {
  title: string
  body: string
  tag?: string
  data?: { networkId?: string; target?: string; [key: string]: unknown }
}

export interface NotificationResult {
  title: string
  body: string
}

export interface WindowState {
  focused: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TITLE = 80
const MAX_BODY = 200
const DEFAULT_TITLE = 'bool'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

/**
 * Strip ASCII control characters (0x00-0x1F, 0x7F) and collapse runs of
 * whitespace/newlines into a single space. Cheap anti-spoof for notification
 * title/body text sourced from untrusted server content.
 */
function sanitizeText(str: string): string {
  return str
    // Remove control chars (keep printable ASCII + Unicode)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Collapse multiple whitespace/newline runs into a single space
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitises and truncates the title and body of a mention/DM notification
 * payload for display as a native OS notification.
 *
 * - Title: control chars stripped, clamped to 80 chars; defaults to 'bool' if absent/empty.
 * - Body: trimmed before truthy check; control chars stripped, clamped to 200 chars; defaults to '' if absent/whitespace-only.
 */
export function buildNotification(payload: NotificationPayload): NotificationResult {
  const rawTitle = typeof payload.title === 'string' ? payload.title : ''
  const rawBody = typeof payload.body === 'string' ? payload.body : ''

  const cleanTitle = sanitizeText(rawTitle)
  const cleanBody = sanitizeText(rawBody)

  const title = cleanTitle ? truncate(cleanTitle, MAX_TITLE) : DEFAULT_TITLE
  const body = cleanBody ? truncate(cleanBody, MAX_BODY) : ''

  return { title, body }
}

/**
 * Returns `true` if a notification should be shown, `false` if the window is
 * already focused (the user is actively looking at the app).
 */
export function shouldNotify(state: WindowState): boolean {
  return !state.focused
}
