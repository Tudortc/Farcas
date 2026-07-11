# bool — Milestone 1: Multi-User Auth + Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-user authentication (username + password, cookie sessions) and a minimal admin panel to bool using Better Auth, and gate both the app and the `/ws` WebSocket behind an authenticated session.

**Architecture:** Better Auth runs inside the existing Fastify server, backed by the same `better-sqlite3` database the app will use for history. It mounts a catch-all `/api/auth/*` handler and owns the `user`/`session`/`account`/`verification` tables (plus `username` and `admin` plugin fields). The React SPA authenticates via the Better Auth React client and only opens the `/ws` WebSocket after a session exists; the server validates the session cookie on the WS upgrade. An admin (bootstrapped by user id) manages accounts through the admin plugin.

**Tech Stack (added this milestone):** `better-auth` (v1.6), `@better-auth/cli`, `better-sqlite3`, `@fastify/cors`; client `better-auth/react` + `better-auth/client/plugins`.

## Global Constraints

- All identifiers/comments/UI copy in **English**. pnpm workspaces only. ESM (`"type": "module"`), TypeScript `moduleResolution: NodeNext` (server) / `Bundler` (client). Node `>=20`.
- **Auth is Better Auth — do not hand-roll** password hashing, sessions, or CSRF. Login is by **username** + password (email is collected but login uses the username plugin).
- **Single DB:** one `better-sqlite3` database. Path from `process.env.BOOL_DB ?? 'bool.db'`. Better Auth owns `user`/`session`/`account`/`verification` (+ plugin fields); app tables reference `user.id`.
- **Secrets:** `BETTER_AUTH_SECRET` (32+ chars) and `BETTER_AUTH_URL` come from env, server-side only — never in the client bundle. The client knows only `baseURL`.
- **Session gates everything:** unauthenticated clients cannot open `/ws` and see the app shell only as a login screen.
- **Admin gating:** admin-only endpoints require the caller's role ∈ `adminRoles` (`["admin"]`) or id ∈ `adminUserIds`.
- **Protocol source of truth** stays in `@bool/shared`.
- Better Auth version pinned: keep `better-auth` and `@better-auth/cli` on the same minor.

---

### Task 1: Database module + Better Auth server instance + migrations

**Files:**
- Create: `packages/server/src/db.ts`
- Create: `packages/server/src/auth.ts`
- Create: `packages/server/.env.example`
- Create: `packages/server/src/auth.test.ts`
- Modify: `packages/server/package.json` (deps + `db:migrate` script)
- Modify: `packages/server/vitest.config.ts` (test env + globalSetup)
- Create: `packages/server/test/global-setup.ts`

**Interfaces:**
- Produces:
  - `getDb(): Database.Database` in `db.ts` — returns a singleton `better-sqlite3` instance opened at `process.env.BOOL_DB ?? 'bool.db'` (with `pragma journal_mode = WAL`).
  - `auth` in `auth.ts` — the `betterAuth({...})` instance (emailAndPassword + `username()` + `admin({ adminUserIds })`), using the `getDb()` connection, `trustedOrigins` from env.
  - The migrate command `pnpm --filter @bool/server db:migrate` creates the Better Auth tables in `BOOL_DB`.

- [ ] **Step 1: Add dependencies and scripts**

Modify `packages/server/package.json` — add to `dependencies`: `"better-auth": "^1.6.0"`, `"better-sqlite3": "^11.0.0"`, `"@fastify/cors": "^10.0.0"`; to `devDependencies`: `"@better-auth/cli": "^1.6.0"`, `"@types/better-sqlite3": "^7.6.0"`; add scripts:
```json
"db:migrate": "better-auth migrate --config ./src/auth.ts --yes"
```
Run `pnpm install` from the repo root.

- [ ] **Step 2: Implement the DB module**

`packages/server/src/db.ts`:

```ts
import Database from 'better-sqlite3'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance
  const path = process.env.BOOL_DB ?? 'bool.db'
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  instance = db
  return instance
}
```

- [ ] **Step 3: Implement the Better Auth instance**

`packages/server/src/auth.ts`:

```ts
import { betterAuth } from 'better-auth'
import { username, admin } from 'better-auth/plugins'
import { getDb } from './db.js'

const adminUserIds = (process.env.BOOL_ADMIN_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const trustedOrigins = (process.env.BOOL_TRUSTED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const auth = betterAuth({
  database: getDb(),
  emailAndPassword: { enabled: true },
  trustedOrigins,
  plugins: [username(), admin({ defaultRole: 'user', adminRoles: ['admin'], adminUserIds })],
})
```

`packages/server/.env.example`:

```
BETTER_AUTH_SECRET=change-me-to-a-32-char-random-string
BETTER_AUTH_URL=http://localhost:3030
BOOL_DB=bool.db
BOOL_TRUSTED_ORIGINS=http://localhost:5173
BOOL_ADMIN_IDS=
```

- [ ] **Step 4: Wire the test harness (migrated temp DB, shared across the server suite)**

`packages/server/test/global-setup.ts` — creates a temp DB, migrates it via the CLI, exposes its path + a test secret to all test workers, cleans up after:

```ts
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

  // Make the same DB + secret visible to test workers (inherited via process.env).
  process.env.BOOL_DB = dbPath
  process.env.BETTER_AUTH_SECRET = secret
  process.env.BETTER_AUTH_URL = 'http://localhost:3030'

  return () => rmSync(dir, { recursive: true, force: true })
}
```

Modify `packages/server/vitest.config.ts` to register the global setup and guarantee env for workers:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3030',
    },
    pool: 'forks',
  },
})
```

> Implementer note: verify empirically that a test worker sees the migrated `BOOL_DB`. If `process.env.BOOL_DB` from globalSetup does not reach workers in the installed Vitest, fall back to writing the temp path to a fixed file (e.g. `test/.tmp-db-path`) in globalSetup and reading it in a `setupFiles` module that sets `process.env.BOOL_DB` before `auth` is imported. Report which approach you used.

- [ ] **Step 5: Write the failing test**

`packages/server/src/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getDb } from './db.js'
import { auth } from './auth.js'

describe('auth instance + schema', () => {
  it('created the Better Auth tables in the DB', () => {
    const rows = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
    const names = rows.map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['user', 'session', 'account', 'verification']))
  })

  it('getSession returns null without a session', async () => {
    const session = await auth.api.getSession({ headers: new Headers() })
    expect(session).toBeNull()
  })
})
```

- [ ] **Step 6: Run tests (RED → GREEN)**

Run: `pnpm --filter @bool/server test`
Expected RED first (no `db.js`/`auth.js`), then GREEN after Steps 2–5. Also run `pnpm --filter @bool/server db:migrate` once manually to confirm it creates `bool.db` tables without error.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(server): Better Auth instance + sqlite db module + migrations"
```

---

### Task 2: Mount Better Auth on Fastify + protected `/api/me`

**Files:**
- Create: `packages/server/src/auth-routes.ts`
- Modify: `packages/server/src/app.ts` (register CORS + auth routes)
- Test: `packages/server/src/auth-routes.test.ts`

**Interfaces:**
- Consumes: `auth` from `auth.ts`.
- Produces:
  - `registerAuth(app: FastifyInstance): Promise<void>` in `auth-routes.ts` — registers `@fastify/cors` (credentials true, origins from `trustedOrigins`), the `/api/auth/*` catch-all bridging to `auth.handler`, and `GET /api/me` returning the session user or 401.
  - `getSessionFromHeaders(headers): Promise<Session | null>` helper (wraps `auth.api.getSession` + `fromNodeHeaders`) for reuse by the WS gate in Task 3.

- [ ] **Step 1: Write the failing test** (real sign-up → cookie → /api/me round-trip)

`packages/server/src/auth-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'

let app: FastifyInstance

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

const uniq = () => `u${Math.floor(performance.now() * 1000) % 1_000_000}`

describe('auth routes', () => {
  it('rejects /api/me without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
  })

  it('signs up, then /api/me returns the user via the session cookie', async () => {
    const name = uniq()
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
    })
    expect(signup.statusCode).toBeLessThan(400)
    const cookie = signup.headers['set-cookie']
    expect(cookie).toBeTruthy()

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: Array.isArray(cookie) ? cookie.join('; ') : String(cookie) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.username).toBe(name)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @bool/server test`
Expected: FAIL — `/api/auth/*` and `/api/me` not registered.

- [ ] **Step 3: Implement the auth routes plugin**

`packages/server/src/auth-routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './auth.js'

export async function getSessionFromHeaders(headers: FastifyRequest['headers']) {
  return auth.api.getSession({ headers: fromNodeHeaders(headers) })
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const origins = (process.env.BOOL_TRUSTED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      })
      const response = await auth.handler(req)
      reply.status(response.status)
      response.headers.forEach((value, key) => reply.header(key, value))
      return reply.send(response.body ? await response.text() : null)
    },
  })

  app.get('/api/me', async (request, reply) => {
    const session = await getSessionFromHeaders(request.headers)
    if (!session) return reply.status(401).send({ error: 'unauthorized' })
    return reply.send(session)
  })
}
```

Modify `packages/server/src/app.ts` — register auth before returning. `buildApp` becomes async-registered but keep the sync `buildApp()` signature by registering inside an encapsulated plugin:

```ts
// add near the other registrations in buildApp(), before `return app`:
import { registerAuth } from './auth-routes.js'
// ...
app.register(async (instance) => {
  await registerAuth(instance)
})
```

> Implementer note: Better Auth's exact sign-up path is `POST /api/auth/sign-up/email` (username plugin lets you pass `username`). Verify the response sets a session cookie; if sign-up requires email verification by default and blocks the cookie, set `emailAndPassword: { enabled: true, requireEmailVerification: false }` in `auth.ts` and note it.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @bool/server test`
Expected: PASS (auth: 2, auth-routes: 2, plus prior health/ws/static = all green).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): mount Better Auth on Fastify + protected /api/me"
```

---

### Task 3: Gate the `/ws` WebSocket behind a session

**Files:**
- Modify: `packages/server/src/ws.ts` (validate session on connect)
- Test: `packages/server/src/ws-auth.test.ts`

**Interfaces:**
- Consumes: `getSessionFromHeaders` from `auth-routes.ts`; `ServerMessage` from `@bool/shared`.
- Produces: on WS connect, `registerWebSocket` reads the session from the upgrade request headers; if there is no session it sends `{ type:'error', message:'unauthorized' }` and closes the socket before processing any message. Authenticated sockets behave exactly as before (welcome/pong).

- [ ] **Step 1: Write the failing test**

`packages/server/src/ws-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'

let app: FastifyInstance
let base: string

beforeAll(async () => {
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`
})
afterAll(async () => {
  await app.close()
})

function firstMessage(ws: WebSocket, send: object): Promise<{ closed: boolean; msg: any }> {
  return new Promise((resolve, reject) => {
    let msg: any = null
    ws.on('open', () => ws.send(JSON.stringify(send)))
    ws.on('message', (d) => (msg = JSON.parse(d.toString())))
    ws.on('close', () => resolve({ closed: true, msg }))
    ws.on('error', reject)
  })
}

async function signUpCookie(): Promise<string> {
  const name = `w${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  return Array.isArray(c) ? c.join('; ') : String(c)
}

describe('ws auth gate', () => {
  it('closes an unauthenticated connection with an error', async () => {
    const { closed, msg } = await firstMessage(new WebSocket(`ws://${base}/ws`), {
      type: 'hello',
      clientVersion: 1,
    })
    expect(closed).toBe(true)
    expect(msg?.type).toBe('error')
  })

  it('accepts an authenticated connection and replies welcome', async () => {
    const cookie = await signUpCookie()
    const reply = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 })))
      ws.on('message', (d) => {
        resolve(JSON.parse(d.toString()))
        ws.close()
      })
      ws.on('error', reject)
    })
    expect(reply.type).toBe('welcome')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @bool/server test`
Expected: FAIL — unauthenticated connection is currently accepted (no gate).

- [ ] **Step 3: Implement the gate**

Modify `packages/server/src/ws.ts` — make the handler async, check the session from `request.headers` before wiring the message handler:

```ts
import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'
import { getSessionFromHeaders } from './auth-routes.js'

export function serverTimeNow(): number {
  return Date.now()
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg))

    const session = await getSessionFromHeaders(request.headers)
    if (!session) {
      send({ type: 'error', message: 'unauthorized' })
      socket.close()
      return
    }

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Buffer.isBuffer(raw)
        ? raw.toString()
        : Array.isArray(raw)
          ? Buffer.concat(raw).toString()
          : Buffer.from(raw).toString()
      let msg
      try {
        msg = parseClientMessage(text)
      } catch {
        send({ type: 'error', message: 'invalid message' })
        return
      }
      switch (msg.type) {
        case 'hello':
          send({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, serverTime: serverTimeNow() })
          break
        case 'ping':
          send({ type: 'pong', t: msg.t })
          break
      }
    })
  })
}
```

> Implementer note: the existing `ws.test.ts` from Milestone 0 connects without a cookie and expects `welcome`. Update those Milestone-0 ws tests to sign up + pass the cookie (reuse the `signUpCookie` helper pattern), since the gate now (correctly) rejects anonymous sockets. This is an intended behavior change, not a regression.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @bool/server test`
Expected: PASS — `ws-auth` green and the updated `ws.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): require an authenticated session to open /ws"
```

---

### Task 4: Client auth — login/register UI, session gating, sign-out

**Files:**
- Create: `packages/client/src/auth-client.ts`
- Create: `packages/client/src/AuthGate.tsx`
- Create: `packages/client/src/LoginForm.tsx`
- Modify: `packages/client/src/App.tsx` (wrap in AuthGate; only open WS when authed; show user + sign out)
- Modify: `packages/client/vite.config.ts` (proxy `/api` to the server)
- Modify: `packages/client/package.json` (add `better-auth`)
- Test: `packages/client/src/auth-client.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (talks to the server over HTTP via the Vite proxy).
- Produces:
  - `authClient` in `auth-client.ts` (`createAuthClient` with `usernameClient()` + `adminClient()`, `baseURL: '/api/auth'`) plus re-exports `signUp`, `signIn`, `signOut`, `useSession`.
  - `<AuthGate>` renders `<LoginForm/>` when `useSession()` has no user, else its children.
  - `<LoginForm>` supports both sign-in (username+password) and register (username+email+password) modes.
  - `App` renders inside `AuthGate`; the WS connection is only created when a session exists; a header shows the username and a Sign out button.

- [ ] **Step 1: Add dependency + proxy**

Add `"better-auth": "^1.6.0"` to `packages/client/package.json` dependencies; `pnpm install`.
Modify `packages/client/vite.config.ts` `server.proxy` to also proxy HTTP:
```ts
proxy: {
  '/ws': { target: 'ws://localhost:3030', ws: true },
  '/api': { target: 'http://localhost:3030', changeOrigin: true },
  '/health': 'http://localhost:3030',
},
```

- [ ] **Step 2: Write the failing test** (pure logic: the auth client exposes the expected surface)

`packages/client/src/auth-client.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { authClient } from './auth-client.js'

describe('auth-client', () => {
  it('exposes username sign-in, email sign-up, sign-out and useSession', () => {
    expect(typeof authClient.signIn.username).toBe('function')
    expect(typeof authClient.signUp.email).toBe('function')
    expect(typeof authClient.signOut).toBe('function')
    expect(typeof authClient.useSession).toBe('function')
    expect(typeof authClient.admin).toBe('object')
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @bool/client test`
Expected: FAIL — `./auth-client.js` missing.

- [ ] **Step 4: Implement the auth client, gate, login form, and app wiring**

`packages/client/src/auth-client.ts`:

```ts
import { createAuthClient } from 'better-auth/react'
import { usernameClient, adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [usernameClient(), adminClient()],
})

export const { signUp, signIn, signOut, useSession } = authClient
```

`packages/client/src/LoginForm.tsx`:

```tsx
import { useState } from 'react'
import { authClient } from './auth-client.js'

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res =
      mode === 'signin'
        ? await authClient.signIn.username({ username, password })
        : await authClient.signUp.email({ email, password, name: username, username })
    setBusy(false)
    if (res.error) setError(res.error.message ?? 'Authentication failed')
  }

  return (
    <form onSubmit={submit} aria-label={mode === 'signin' ? 'Sign in' : 'Register'}>
      <h1>bool</h1>
      <input
        aria-label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        required
      />
      {mode === 'register' && (
        <input
          aria-label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
      )}
      <input
        aria-label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={busy}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}>
        {mode === 'signin' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  )
}
```

`packages/client/src/AuthGate.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useSession } from './auth-client.js'
import { LoginForm } from './LoginForm.js'

export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession()
  if (isPending) return <main>Loading…</main>
  if (!session) return <LoginForm />
  return <>{children}</>
}
```

Modify `packages/client/src/App.tsx` — wrap the connected view in `AuthGate`, only open the WS inside it, and show the user + sign out:

```tsx
import { useEffect, useState } from 'react'
import { createWsClient } from './ws-client.js'
import { AuthGate } from './AuthGate.js'
import { authClient, useSession } from './auth-client.js'

function ConnectedApp() {
  const { data: session } = useSession()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const client = createWsClient({ url: `${proto}://${location.host}/ws` })
    client.onMessage((msg) => {
      if (msg.type === 'welcome') setConnected(true)
    })
    client.send({ type: 'hello', clientVersion: 1 })
    return () => client.close()
  }, [])

  return (
    <main>
      <header>
        <span>{session?.user.username}</span>
        <button onClick={() => authClient.signOut()}>Sign out</button>
      </header>
      <p>{connected ? 'Connected' : 'Connecting…'}</p>
    </main>
  )
}

export function App() {
  return (
    <AuthGate>
      <ConnectedApp />
    </AuthGate>
  )
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @bool/client test`
Expected: PASS (auth-client surface test + existing ws-client tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(client): auth gate, login/register form, session-gated WS + sign out"
```

---

### Task 5: First-admin bootstrap + minimal admin panel

**Files:**
- Create: `packages/server/src/bootstrap-admin.ts`
- Modify: `packages/server/src/index.ts` (log admin bootstrap hint on start)
- Create: `packages/client/src/AdminPanel.tsx`
- Modify: `packages/client/src/App.tsx` (show an "Admin" toggle for admin users)
- Test: `packages/server/src/bootstrap-admin.test.ts`
- Test: `packages/client/src/AdminPanel.test.tsx`

**Interfaces:**
- Consumes: `auth` (server), `authClient` (client).
- Produces:
  - `isAdmin(session): boolean` in `bootstrap-admin.ts` — true when `session.user.role === 'admin'` or the user id is in `BOOL_ADMIN_IDS`. Also `firstAdminHint(): string` returning guidance printed at startup when no admin exists.
  - `<AdminPanel>` (client) — lists users (`authClient.admin.listUsers`), creates a user (`authClient.admin.createUser`), sets role (`authClient.admin.setRole`), and removes a user (`authClient.admin.removeUser`). Rendered only when `isAdmin` for the current session.

- [ ] **Step 1: Write the failing server test**

`packages/server/src/bootstrap-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isAdmin } from './bootstrap-admin.js'

describe('isAdmin', () => {
  it('is true for role admin', () => {
    expect(isAdmin({ user: { id: 'x', role: 'admin' } } as any)).toBe(true)
  })
  it('is true for an id in BOOL_ADMIN_IDS', () => {
    process.env.BOOL_ADMIN_IDS = 'abc,def'
    expect(isAdmin({ user: { id: 'def', role: 'user' } } as any)).toBe(true)
  })
  it('is false for a plain user', () => {
    process.env.BOOL_ADMIN_IDS = ''
    expect(isAdmin({ user: { id: 'zzz', role: 'user' } } as any)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter @bool/server test` → FAIL (`bootstrap-admin.js` missing).

- [ ] **Step 3: Implement the server bootstrap helper**

`packages/server/src/bootstrap-admin.ts`:

```ts
type SessionLike = { user: { id: string; role?: string | null } }

function adminIds(): string[] {
  return (process.env.BOOL_ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isAdmin(session: SessionLike | null): boolean {
  if (!session) return false
  if (session.user.role === 'admin') return true
  return adminIds().includes(session.user.id)
}

export function firstAdminHint(): string {
  return [
    'No admin configured yet.',
    'Register the first user, then either:',
    '  - set BOOL_ADMIN_IDS=<that user id> and restart, or',
    "  - run: UPDATE user SET role='admin' WHERE username='<name>'; in bool.db",
  ].join('\n')
}
```

Modify `packages/server/src/index.ts` — after listen, if no admin exists, print `firstAdminHint()`:

```ts
import { firstAdminHint } from './bootstrap-admin.js'
import { getDb } from './db.js'
// after the server logs it is listening:
const admins = getDb()
  .prepare("SELECT COUNT(*) AS n FROM user WHERE role = 'admin'")
  .get() as { n: number }
if (admins.n === 0 && (process.env.BOOL_ADMIN_IDS ?? '') === '') {
  // eslint-disable-next-line no-console
  console.log(firstAdminHint())
}
```

- [ ] **Step 4: Run it (GREEN)**

Run: `pnpm --filter @bool/server test` → PASS.

- [ ] **Step 5: Write the failing client test** (AdminPanel renders users from a mocked admin client)

`packages/client/src/AdminPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminPanel } from './AdminPanel.js'

vi.mock('./auth-client.js', () => ({
  authClient: {
    admin: {
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: '1', username: 'alice', role: 'admin' }, { id: '2', username: 'bob', role: 'user' }] },
      }),
      createUser: vi.fn(),
      setRole: vi.fn(),
      removeUser: vi.fn(),
    },
  },
}))

describe('AdminPanel', () => {
  it('lists users after loading', async () => {
    render(<AdminPanel />)
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(await screen.findByText('bob')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run it (RED)**

Run: `pnpm --filter @bool/client test` → FAIL (`AdminPanel.js` missing).

- [ ] **Step 7: Implement AdminPanel and wire the admin toggle**

`packages/client/src/AdminPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { authClient } from './auth-client.js'

type AdminUser = { id: string; username?: string | null; role?: string | null }

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function refresh() {
    const res = await authClient.admin.listUsers({ query: { limit: 100 } })
    setUsers((res.data?.users as AdminUser[]) ?? [])
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await authClient.admin.createUser({ email, password, name: username, username, role: 'user' })
    setUsername('')
    setEmail('')
    setPassword('')
    await refresh()
  }

  return (
    <section aria-label="Admin panel">
      <h2>Users</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            <span>{u.username}</span> <em>{u.role}</em>
            <button
              onClick={async () => {
                await authClient.admin.setRole({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' })
                await refresh()
              }}
            >
              {u.role === 'admin' ? 'Demote' : 'Make admin'}
            </button>
            <button
              onClick={async () => {
                await authClient.admin.removeUser({ userId: u.id })
                await refresh()
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={create} aria-label="Create user">
        <input aria-label="New username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
        <input aria-label="New email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input aria-label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
        <button type="submit">Create user</button>
      </form>
    </section>
  )
}
```

Modify `packages/client/src/App.tsx` `ConnectedApp` — add an admin toggle when the session user is an admin:

```tsx
// inside ConnectedApp, add:
import { AdminPanel } from './AdminPanel.js'
// ...
const [showAdmin, setShowAdmin] = useState(false)
const isAdmin = session?.user.role === 'admin'
// in the returned header, when isAdmin:
{isAdmin && <button onClick={() => setShowAdmin((v) => !v)}>Admin</button>}
// and below the connection line:
{showAdmin && isAdmin && <AdminPanel />}
```

- [ ] **Step 8: Run both suites (GREEN)**

Run: `pnpm --filter @bool/server test` and `pnpm --filter @bool/client test` → both PASS. Then `pnpm -r test` for the full suite.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: first-admin bootstrap + minimal admin panel (list/create/role/remove)"
```

---

## Self-Review

**Spec coverage (Milestone 1 = "Multi-user + auth + admin panel minimal"):** multi-user auth ✓ Tasks 1–2; username+password login ✓ Task 4; sessions/CSRF/hashing via Better Auth ✓ Task 1; session gates the app ✓ Task 4 and the WS ✓ Task 3; admin panel add/remove/role ✓ Task 5; first-admin bootstrap ✓ Task 5; secrets server-side only ✓ (env, not in client). Retention (admin-configurable history retention) is deferred to the History milestone (Milestone 3), where the history tables live — noted, not silently dropped.

**Placeholder scan:** every code step has complete code; commands have expected results. "Implementer notes" flag integration points to verify against the running Better Auth (sign-up path, email-verification default, Vitest env propagation) — these are verification instructions, not placeholders.

**Type consistency:** `getDb`, `auth`, `registerAuth`, `getSessionFromHeaders`, `isAdmin`, `authClient` names are defined once and consumed consistently across tasks. `getSessionFromHeaders` (Task 2) is the single session-reading helper reused by the WS gate (Task 3).

**Known integration risks (call out during execution):** (1) Vitest globalSetup → worker env propagation for `BOOL_DB` (Task 1 note gives a fallback); (2) whether email/password sign-up returns a session cookie without email verification (Task 2 note); (3) exact admin client response shape for `listUsers` (`data.users`) — verify and adjust the AdminPanel accessor if the shape differs.

## Execution Handoff

This plan is executed the same way as Milestone 0 (subagent-driven: implementer + task review per task, final whole-branch review). Later milestones after this: 2 IRC Engine, 3 History+FTS search (incl. retention), 4 Sync gateway, 5 Client UI core (applies Direction A + themes), 6 rich features, 7 push/PWA, 8 Electron.
