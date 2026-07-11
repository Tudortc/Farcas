import type { ServerMessage } from '@bool/shared'
import { sendPushToUser } from './push.js'

type ChatMsg = Extract<ServerMessage, { type: 'chat:msg' }>

export interface NotifyContext {
  /** The user's current nick on this IRC network. */
  selfNick: string
  /** Number of live WebSocket connections (hub subscribers) for this user. */
  activeSockets: number
  /**
   * Optional send override — defaults to `sendPushToUser`.
   * Accepts (userId, payload) and returns a Promise<number> or void.
   */
  send?: (userId: string, payload: Record<string, unknown>) => Promise<number> | void
}

const MAX_BODY = 120

function truncate(text: string): string {
  if (text.length <= MAX_BODY) return text
  return text.slice(0, MAX_BODY) + '…'
}

/**
 * Escape special regex characters in a string so it can be used as a literal
 * pattern inside a RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Returns true and fires a push notification when ALL of:
 * - `!msg.self`  (not an echo of the user's own message)
 * - `msg.kind === 'privmsg'`  (simple text; actions are optional per brief)
 * - `ctx.activeSockets === 0`  (the user has no open app)
 * - AND: it is a DM (`msg.target === ctx.selfNick`) OR
 *         the message body contains `ctx.selfNick` as a whole word (case-insensitive).
 *
 * Payload shape:
 *   { title, body, tag, data: { networkId, target } }
 *   title = DM sender (msg.from) OR channel name (msg.target)
 *   body  = "from: text" truncated to ~120 chars
 *   tag   = "${networkId}:${target}"  (collapses repeated channel notifications)
 */
export async function maybeNotify(
  userId: string,
  msg: ChatMsg,
  ctx: NotifyContext,
): Promise<boolean> {
  if (msg.self) return false
  if (msg.kind !== 'privmsg') return false
  if (ctx.activeSockets !== 0) return false

  const isDm = msg.target === ctx.selfNick
  const isMention =
    !isDm &&
    new RegExp(`(?<![\\w])${escapeRegex(ctx.selfNick)}(?![\\w])`, 'i').test(msg.text)

  if (!isDm && !isMention) return false

  const title = isDm ? msg.from : msg.target
  const body = truncate(`${msg.from}: ${msg.text}`)
  const tag = `${msg.networkId}:${msg.target}`

  const payload: Record<string, unknown> = {
    title,
    body,
    tag,
    data: { networkId: msg.networkId, target: msg.target },
  }

  const sendFn = ctx.send ?? sendPushToUser
  await sendFn(userId, payload)
  return true
}
