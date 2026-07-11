import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { ensureAppSchema } from '../src/schema.js'

export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'bool-auth-'))
  const dbPath = join(dir, 'template.db')
  const secret = 'test-secret-0123456789abcdef0123456789abcdef'

  // Run Better Auth migrations against a template DB. Each worker will copy this.
  execSync('pnpm exec better-auth migrate --config ./src/auth.ts --yes', {
    cwd: process.cwd(),
    env: { ...process.env, BOOL_DB: dbPath, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:3030' },
    stdio: 'inherit',
  })

  const db = new Database(dbPath)
  // Checkpoint WAL so the template DB file is fully self-contained when copied.
  db.pragma('wal_checkpoint(TRUNCATE)')
  ensureAppSchema(db)
  db.close()

  // Expose the template path + auth credentials to workers. Each worker copies to its own file.
  process.env.BOOL_DB_TEMPLATE = dbPath
  process.env.BETTER_AUTH_SECRET = secret
  process.env.BETTER_AUTH_URL = 'http://localhost:3030'
  // Do NOT set BOOL_DB here — each worker sets its own path in setup.ts.

  return () => rmSync(dir, { recursive: true, force: true })
}
