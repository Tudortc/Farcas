import { getDb } from './db.js'
import { encryptSecret, decryptSecret } from './crypto.js'

export interface NetworkInput {
  name: string
  host: string
  port: number
  tls: boolean
  nick: string
  username?: string
  realname?: string
  saslAccount?: string
  saslPassword?: string
}

export interface NetworkRow extends NetworkInput {
  id: number
  userId: string
}

interface DbRow {
  id: number
  user_id: string
  name: string
  host: string
  port: number
  tls: number
  nick: string
  username: string | null
  realname: string | null
  sasl_account: string | null
  sasl_password: string | null
}

function toRow(r: DbRow): NetworkRow {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    host: r.host,
    port: r.port,
    tls: !!r.tls,
    nick: r.nick,
    username: r.username ?? undefined,
    realname: r.realname ?? undefined,
    saslAccount: r.sasl_account ?? undefined,
    saslPassword: r.sasl_password ? decryptSecret(r.sasl_password) : undefined,
  }
}

// TODO(follow-up): add host allowlist / deny-private-IP-ranges (SSRF hardening) before
// this server is exposed to untrusted users — the outbound dial must not reach internal
// services (e.g. 10.x, 172.16.x, 192.168.x, 127.x, ::1, link-local, metadata endpoints).

const NETWORK_LIMIT = 50

export function createNetwork(userId: string, input: NetworkInput): NetworkRow {
  const existing = getDb().prepare('SELECT COUNT(*) as cnt FROM networks WHERE user_id = ?').get(userId) as { cnt: number }
  if (existing.cnt >= NETWORK_LIMIT) {
    throw new Error('network limit reached')
  }

  const enc = input.saslPassword ? encryptSecret(input.saslPassword) : null
  const info = getDb()
    .prepare(
      `INSERT INTO networks (user_id, name, host, port, tls, nick, username, realname, sasl_account, sasl_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, input.name, input.host, input.port, input.tls ? 1 : 0, input.nick, input.username ?? null, input.realname ?? null, input.saslAccount ?? null, enc)
  return getNetwork(userId, Number(info.lastInsertRowid))!
}

export function listNetworks(userId: string): NetworkRow[] {
  return (getDb().prepare('SELECT * FROM networks WHERE user_id = ? ORDER BY id').all(userId) as DbRow[]).map(toRow)
}

export function getNetwork(userId: string, id: number): NetworkRow | null {
  const r = getDb().prepare('SELECT * FROM networks WHERE user_id = ? AND id = ?').get(userId, id) as DbRow | undefined
  return r ? toRow(r) : null
}

export function removeNetwork(userId: string, id: number): number {
  const result = getDb().prepare('DELETE FROM networks WHERE user_id = ? AND id = ?').run(userId, id)
  return result.changes
}
