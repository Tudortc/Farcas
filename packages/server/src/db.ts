import Database from 'better-sqlite3'

let instance: Database.Database | null = null
let instancePath: string | null = null

export function getDb(): Database.Database {
  const path = process.env.BOOL_DB ?? 'bool.db'
  // Re-initialize if the DB path changed (e.g. per-file test isolation via setupFiles).
  if (instance && instancePath === path) return instance
  if (instance) {
    instance.close()
    instance = null
  }
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  instance = db
  instancePath = path
  return instance
}
