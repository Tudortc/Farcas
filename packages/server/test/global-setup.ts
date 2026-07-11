import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { ensureAppSchema } from '../src/schema.js'

export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'bool-auth-'))
  const dbPath = join(dir, 'test.db')
  const secret = 'test-secret-0123456789abcdef0123456789abcdef'

  // Run Better Auth migrations against the temp DB before any test imports `auth`.
  execSync('pnpm exec better-auth migrate --config ./src/auth.ts --yes', {
    cwd: process.cwd(),
    env: { ...process.env, BOOL_DB: dbPath, BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:3030' },
    stdio: 'inherit',
  })

  const db = new Database(dbPath)
  ensureAppSchema(db)
  db.close()

  // Make the same DB + secret visible to test workers (inherited via process.env).
  process.env.BOOL_DB = dbPath
  process.env.BETTER_AUTH_SECRET = secret
  process.env.BETTER_AUTH_URL = 'http://localhost:3030'

  return () => rmSync(dir, { recursive: true, force: true })
}
