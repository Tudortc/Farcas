import Database from 'better-sqlite3'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance
  const path = process.env.BOOL_DB ?? 'bool.db'
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  instance = db
  return instance
}
