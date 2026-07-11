/**
 * Per-file Vitest setupFile.
 * Runs before EACH test file (even within the same worker process).
 * Copies the shared template DB to a file-unique path so:
 *  - parallel workers never contend on the same SQLite file, AND
 *  - sequential files within the same worker each get a clean slate.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { ensureAppSchema } from '../src/schema.js'

// Use a combination of worker ID and a monotonic counter so that each invocation
// of this setupFile gets a unique DB path, even within the same worker process.
const workerId =
  process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? String(process.pid)

// A per-process counter to differentiate sequential test files in the same worker.
const g = globalThis as any
g.__bool_setup_counter = (g.__bool_setup_counter ?? 0) + 1
const fileSeq = g.__bool_setup_counter

const workerDbPath = join(tmpdir(), `bool-worker-${workerId}-${fileSeq}.db`)
const templatePath = process.env.BOOL_DB_TEMPLATE

// Remove any stale WAL/SHM/DB files at this path (unlikely since fileSeq is unique,
// but defensive against unexpected reuse).
for (const suffix of ['-wal', '-shm', '']) {
  const stale = workerDbPath + suffix
  if (existsSync(stale)) rmSync(stale)
}

if (!templatePath || !existsSync(templatePath)) {
  // Fallback: run a fresh migration per file (slower, but always safe).
  const { execSync } = await import('node:child_process')
  const secret = process.env.BETTER_AUTH_SECRET ?? 'test-secret-0123456789abcdef0123456789abcdef'
  execSync('pnpm exec better-auth migrate --config ./src/auth.ts --yes', {
    cwd: process.cwd(),
    env: { ...process.env, BOOL_DB: workerDbPath, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:3030' },
    stdio: 'inherit',
  })
  const db = new Database(workerDbPath)
  ensureAppSchema(db)
  db.close()
} else {
  // Copy the pre-migrated, WAL-checkpointed template.
  copyFileSync(templatePath, workerDbPath)
  const db = new Database(workerDbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  ensureAppSchema(db)
  db.close()
}

process.env.BOOL_DB = workerDbPath
