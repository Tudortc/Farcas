import { getDb } from './db.js'
import type { StoredMsg } from '@bool/shared'

export interface MessageInput {
  networkId: number
  target: string
  sender: string
  kind: 'privmsg' | 'notice' | 'action'
  body: string
  ts: number
  msgid?: string
}

interface DbRow {
  id: number
  network_id: number
  target: string
  sender: string
  kind: string
  body: string
  msgid: string | null
  ts: number
}

function toStored(r: DbRow): StoredMsg {
  return {
    id: r.id,
    networkId: r.network_id,
    target: r.target,
    sender: r.sender,
    kind: r.kind as StoredMsg['kind'],
    body: r.body,
    ts: r.ts,
    ...(r.msgid ? { msgid: r.msgid } : {}),
  }
}

export function storeMessage(userId: string, m: MessageInput): number {
  const db = getDb()
  const insertMsg = db.prepare('INSERT INTO messages (user_id, network_id, target, sender, kind, body, msgid, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const insertFts = db.prepare('INSERT INTO messages_fts (rowid, body, sender, target) VALUES (?, ?, ?, ?)')
  const tx = db.transaction(() => {
    const info = insertMsg.run(userId, m.networkId, m.target, m.sender, m.kind, m.body, m.msgid ?? null, m.ts)
    const id = Number(info.lastInsertRowid)
    insertFts.run(id, m.body, m.sender, m.target)
    return id
  })
  return tx()
}

export function parseSearch(query: string): { terms: string; target?: string; sender?: string } {
  let target: string | undefined
  let sender: string | undefined
  const rest: string[] = []
  for (const tok of query.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('in:')) target = tok.slice(3)
    else if (tok.startsWith('from:')) sender = tok.slice(5)
    else rest.push(tok)
  }
  return { terms: rest.join(' '), ...(target ? { target } : {}), ...(sender ? { sender } : {}) }
}

// Turn free text into a safe FTS5 MATCH: quote each word as a phrase so operators/quotes can't break out.
function ftsQuery(terms: string): string {
  const words = terms.split(/\s+/).filter(Boolean).map((w) => '"' + w.replace(/"/g, '""') + '"')
  return words.join(' ')
}

export function searchMessages(userId: string, query: string, limit = 50): StoredMsg[] {
  const { terms, target, sender } = parseSearch(query)
  const db = getDb()
  const where: string[] = ['m.user_id = ?']
  const params: unknown[] = [userId]
  const match = ftsQuery(terms)

  let sql: string
  if (match) {
    sql = `SELECT m.* FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? AND `
    params.unshift(match) // MATCH param comes first
  } else {
    sql = `SELECT m.* FROM messages m WHERE `
  }
  if (target) { where.push('m.target = ?'); params.push(target) }
  if (sender) { where.push('m.sender = ?'); params.push(sender) }
  sql += where.join(' AND ') + ' ORDER BY m.ts DESC LIMIT ?'
  params.push(limit)
  return (db.prepare(sql).all(...params) as DbRow[]).map(toStored)
}

export function getHistory(userId: string, networkId: number, target: string, limit = 50, before?: number): StoredMsg[] {
  const db = getDb()
  const rows = before
    ? (db.prepare('SELECT * FROM messages WHERE user_id = ? AND network_id = ? AND target = ? AND ts < ? ORDER BY ts DESC LIMIT ?').all(userId, networkId, target, before, limit) as DbRow[])
    : (db.prepare('SELECT * FROM messages WHERE user_id = ? AND network_id = ? AND target = ? ORDER BY ts DESC LIMIT ?').all(userId, networkId, target, limit) as DbRow[])
  return rows.map(toStored).reverse()
}

export function pruneOlderThan(cutoffTs: number): number {
  const db = getDb()
  const deleteFts = db.prepare('DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE ts < ?)')
  const deleteMsgs = db.prepare('DELETE FROM messages WHERE ts < ?')
  const tx = db.transaction(() => {
    deleteFts.run(cutoffTs)
    const info = deleteMsgs.run(cutoffTs)
    return info.changes
  })
  return tx()
}
