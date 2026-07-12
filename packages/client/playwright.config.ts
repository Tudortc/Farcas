import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Self-contained e2e harness
//
// Playwright boots BOTH the API server and the Vite client itself, on a fresh
// throwaway SQLite database and media dir, so the suite is fully reproducible
// and never touches the developer's real `bool.db`.
//
// Ports mirror the known-working dev topology:
//   - server:  0.0.0.0:3030            (health checked on 127.0.0.1)
//   - client:  vite on localhost:5175  (its proxy forwards /api,/ws,/health → :3030)
//
// The server's trustedOrigins is pinned to the client origin so Better Auth
// accepts sign-up / sign-in — see docs/audit/E2E-AUDIT.md for why the default
// (:5173) silently breaks auth when Vite falls back to another port.
// ---------------------------------------------------------------------------

const CLIENT_PORT = 5175
const SERVER_PORT = 3030
const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`

// Fresh, unique throwaway data dir per run. Computed at config-eval time (before
// both webServer and globalSetup) so there is no start-order dependency.
const runId = `${Date.now()}-${process.pid}`
const tmpBase = path.join(os.tmpdir(), `bool-e2e-${runId}`)
const mediaDir = path.join(tmpBase, 'media')
fs.mkdirSync(mediaDir, { recursive: true })
const dbPath = path.join(tmpBase, 'bool.db')
process.env.__BOOL_E2E_TMP = tmpBase // consumed by global-teardown.ts

const serverEnv = {
  ...process.env,
  PORT: String(SERVER_PORT),
  BOOL_DB: dbPath,
  BOOL_MEDIA_DIR: mediaDir,
  BOOL_TRUSTED_ORIGINS: CLIENT_ORIGIN,
  BETTER_AUTH_URL: `http://localhost:${SERVER_PORT}`,
  BETTER_AUTH_SECRET: 'e2e-test-secret-0123456789abcdef0123456789abcdef',
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: CLIENT_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Migrate the throwaway DB (Better Auth tables) then boot the API server.
      // App-specific tables are created at startup via ensureAppSchema().
      command:
        'node_modules/.bin/better-auth migrate --config ./src/auth.ts --yes && node --import tsx src/index.ts',
      cwd: path.resolve(__dirname, '../server'),
      env: serverEnv,
      url: `http://127.0.0.1:${SERVER_PORT}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `node_modules/.bin/vite --port ${CLIENT_PORT} --strictPort`,
      cwd: __dirname,
      url: CLIENT_ORIGIN,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
