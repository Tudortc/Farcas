import type Database from 'better-sqlite3'

export function ensureAppSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS networks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      tls INTEGER NOT NULL DEFAULT 1,
      nick TEXT NOT NULL,
      username TEXT,
      realname TEXT,
      sasl_account TEXT,
      sasl_password TEXT
    );
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      network_id INTEGER NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      joined INTEGER NOT NULL DEFAULT 0,
      UNIQUE(network_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_networks_user ON networks(user_id);
  `)
}
