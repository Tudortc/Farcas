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
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      network_id INTEGER NOT NULL,
      target TEXT NOT NULL,
      sender TEXT NOT NULL,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      msgid TEXT,
      ts INTEGER NOT NULL,
      reply_to TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_hist ON messages(user_id, network_id, target, ts);
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(body, sender, target, content='messages', content_rowid='id');
    CREATE TABLE IF NOT EXISTS read_markers (
      user_id TEXT NOT NULL,
      network_id INTEGER NOT NULL,
      target TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (user_id, network_id, target)
    );
    CREATE TABLE IF NOT EXISTS push_subs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id);
  `)

  // Idempotent migration: add reply_to column to existing databases.
  try {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to TEXT')
  } catch (e: any) {
    if (!e?.message?.includes('duplicate column name')) throw e
  }
}
