import webpush from 'web-push'
import { getDb } from './db.js'

export interface PushSubscriptionJSON {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export type PushSender = (subscription: webpush.PushSubscription, payload: string) => Promise<void>

export function isPushConfigured(): boolean {
  return Boolean(process.env.BOOL_VAPID_PUBLIC && process.env.BOOL_VAPID_PRIVATE)
}

export function vapidPublicKey(): string | null {
  return process.env.BOOL_VAPID_PUBLIC ?? null
}

export async function savePushSubscription(userId: string, sub: PushSubscriptionJSON): Promise<void> {
  const db = getDb()
  db.prepare(`
    INSERT INTO push_subs (user_id, endpoint, keys_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      keys_json = excluded.keys_json,
      created_at = excluded.created_at
  `).run(userId, sub.endpoint, JSON.stringify(sub.keys), Date.now())
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  getDb().prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(userId, endpoint)
}

function pruneSubscription(endpoint: string): void {
  getDb().prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint)
}

const defaultSender: PushSender = async (subscription, payload) => {
  const pub = process.env.BOOL_VAPID_PUBLIC!
  const priv = process.env.BOOL_VAPID_PRIVATE!
  const subject = process.env.BOOL_VAPID_SUBJECT ?? 'mailto:admin@bool.local'
  webpush.setVapidDetails(subject, pub, priv)
  await webpush.sendNotification(subscription, payload)
}

export async function sendPushToUser(
  userId: string,
  payload: Record<string, unknown>,
  sender: PushSender = defaultSender,
): Promise<number> {
  if (!isPushConfigured()) return 0

  const rows = getDb()
    .prepare('SELECT endpoint, keys_json FROM push_subs WHERE user_id = ?')
    .all(userId) as Array<{ endpoint: string; keys_json: string }>

  const payloadStr = JSON.stringify(payload)
  let sent = 0

  for (const row of rows) {
    const keys = JSON.parse(row.keys_json) as { p256dh: string; auth: string }
    const subscription: webpush.PushSubscription = {
      endpoint: row.endpoint,
      keys,
    }
    try {
      await sender(subscription, payloadStr)
      sent++
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        pruneSubscription(row.endpoint)
      }
      // Non-gone errors: log and continue
    }
  }

  return sent
}
