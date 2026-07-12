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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitises and truncates the title and body of a mention/DM notification
 * payload for display as a native OS notification.
 *
 * - Title: clamped to 80 chars; defaults to 'bool' if absent/empty.
 * - Body: clamped to 200 chars; defaults to '' if absent/empty.
 */
export function buildNotification(payload: NotificationPayload): NotificationResult {
  const rawTitle = typeof payload.title === 'string' ? payload.title : ''
  const rawBody = typeof payload.body === 'string' ? payload.body : ''

  const title = rawTitle.trim() ? truncate(rawTitle, MAX_TITLE) : DEFAULT_TITLE
  const body = rawBody ? truncate(rawBody, MAX_BODY) : ''

  return { title, body }
}

/**
 * Returns `true` if a notification should be shown, `false` if the window is
 * already focused (the user is actively looking at the app).
 */
export function shouldNotify(state: WindowState): boolean {
  return !state.focused
}
