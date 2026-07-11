import { getDb } from './db.js'

export function setReadMarker(userId: string, networkId: number, target: string, ts: number): { ts: number; changed: boolean } {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO read_markers (user_id, network_id, target, ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, network_id, target) DO UPDATE SET ts = excluded.ts WHERE excluded.ts > read_markers.ts`,
    )
    .run(userId, networkId, target, ts)
  const changed = info.changes > 0
  const row = db
    .prepare('SELECT ts FROM read_markers WHERE user_id = ? AND network_id = ? AND target = ?')
    .get(userId, networkId, target) as { ts: number }
  return { ts: row.ts, changed }
}

export function listReadMarkers(userId: string): Array<{ networkId: number; target: string; ts: number }> {
  return (
    getDb()
      .prepare('SELECT network_id, target, ts FROM read_markers WHERE user_id = ? ORDER BY network_id, target')
      .all(userId) as {
      network_id: number
      target: string
      ts: number
    }[]
  ).map((r) => ({ networkId: r.network_id, target: r.target, ts: r.ts }))
}
