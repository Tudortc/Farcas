# bool — Milestone 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo skeleton where a Vite + React 19 client connects to a Fastify server over a typed, validated WebSocket protocol and round-trips a `hello`/`welcome` + `ping`/`pong`, with tests and tooling running end to end.

**Architecture:** Three packages — `shared` (TypeScript types + zod schemas that are the single source of truth for the WebSocket protocol), `server` (Fastify + `@fastify/websocket`, headless, later the always-on IRC bouncer), and `client` (Vite + React 19 SPA/PWA). The client never speaks IRC; it speaks only the typed WS protocol to the server. This milestone builds the empty pipes, not the features.

**Tech Stack:** pnpm workspaces · TypeScript (ESM, NodeNext) · Fastify 5 + @fastify/websocket + @fastify/static · zod · Vite 7 + React 19 · Vitest 3 · @testing-library/react · tsx.

## Global Constraints

- **Language:** all UI copy, identifiers, comments, and docs in **English**.
- **Package manager:** **pnpm** with workspaces only. Never `npm`/`yarn`.
- **Module system:** **ESM** everywhere (`"type": "module"`), TypeScript `moduleResolution: "NodeNext"`.
- **Node:** `>=20`.
- **Workspace layout:** exactly `packages/shared`, `packages/server`, `packages/client`.
- **Protocol source of truth:** all client↔server message shapes live in `packages/shared` (types + zod schemas). Neither server nor client defines its own copy.
- **NOT Next.js:** the client is a plain Vite SPA; the server is a standalone long-lived Fastify process.
- **Internal deps:** referenced via the workspace protocol (`"@bool/shared": "workspace:*"`).
- **Tests:** every package has a `test` script running Vitest; `pnpm -r test` passes from the root.

---

### Task 1: Monorepo scaffold + toolchain

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts` (root)
- Create: `.prettierrc.json`
- Create: `README.md`
- Modify: `.gitignore` (already exists — append)
- Test: `tools/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: the root workspace with scripts `build`, `test`, `typecheck`, `dev`; a passing Vitest run. Later tasks add packages under `packages/*`.

- [ ] **Step 1: Write the failing smoke test**

Create `tools/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain smoke', () => {
  it('runs vitest and basic TS', () => {
    const doubled = [1, 2, 3].map((n) => n * 2)
    expect(doubled).toEqual([2, 4, 6])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tools/__tests__/smoke.test.ts`
Expected: FAIL — pnpm/vitest not set up yet ("command not found" or "no test files / vitest not installed").

- [ ] **Step 3: Create the workspace config files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`.npmrc`:

```
save-exact=false
strict-peer-dependencies=false
```

Root `package.json`:

```json
{
  "name": "bool",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:all": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm -r --parallel dev"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.14.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
  },
})
```

`.prettierrc.json`:

```json
{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`README.md`:

```markdown
# bool

A modern, self-hosted web IRC client — an open-source "IRCCloud". Monorepo:

- `packages/shared` — typed WebSocket protocol (types + zod schemas)
- `packages/server` — Fastify always-on bouncer server
- `packages/client` — Vite + React 19 SPA / PWA

## Develop

    pnpm install
    pnpm dev        # runs server + client in parallel
    pnpm test       # root smoke tests
    pnpm -r test    # all package tests
```

Append to `.gitignore`:

```
node_modules/
dist/
*.log
bool.db*
.DS_Store
coverage/
```

- [ ] **Step 4: Install and run the test to verify it passes**

Run: `pnpm install && pnpm vitest run tools/__tests__/smoke.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo + toolchain"
```

---

### Task 2: `@bool/shared` — typed, validated WebSocket protocol

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Produces:
  - Types `ClientMessage` and `ServerMessage` (discriminated unions on `type`).
  - `clientMessageSchema` / `serverMessageSchema` (zod).
  - `parseClientMessage(raw: string): ClientMessage` — throws on invalid.
  - `parseServerMessage(raw: string): ServerMessage` — throws on invalid.
  - `PROTOCOL_VERSION = 1`.
  - v0 message set: client `{type:'hello', clientVersion:number}`, client `{type:'ping', t:number}`; server `{type:'welcome', protocolVersion:number, serverTime:number}`, server `{type:'pong', t:number}`, server `{type:'error', message:string}`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('protocol', () => {
  it('parses a valid hello', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'hello', clientVersion: 1 }))
    expect(msg).toEqual({ type: 'hello', clientVersion: 1 })
  })

  it('parses a valid welcome', () => {
    const msg = parseServerMessage(
      JSON.stringify({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, serverTime: 123 }),
    )
    expect(msg.type).toBe('welcome')
  })

  it('rejects an unknown client type', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'nope' }))).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseClientMessage('{not json')).toThrow()
  })

  it('rejects a hello missing clientVersion', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'hello' }))).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bool/shared test`
Expected: FAIL — package/module `./index.js` does not exist yet.

- [ ] **Step 3: Create the package and implementation**

`packages/shared/package.json`:

```json
{
  "name": "@bool/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^3.0.0" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

`packages/shared/src/protocol.ts`:

```ts
import { z } from 'zod'

export const PROTOCOL_VERSION = 1

// --- Client -> Server ---
export const helloSchema = z.object({ type: z.literal('hello'), clientVersion: z.number().int() })
export const pingSchema = z.object({ type: z.literal('ping'), t: z.number() })

export const clientMessageSchema = z.discriminatedUnion('type', [helloSchema, pingSchema])
export type ClientMessage = z.infer<typeof clientMessageSchema>

// --- Server -> Client ---
export const welcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int(),
  serverTime: z.number(),
})
export const pongSchema = z.object({ type: z.literal('pong'), t: z.number() })
export const errorSchema = z.object({ type: z.literal('error'), message: z.string() })

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema,
  pongSchema,
  errorSchema,
])
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw))
}

export function parseServerMessage(raw: string): ServerMessage {
  return serverMessageSchema.parse(JSON.parse(raw))
}
```

`packages/shared/src/index.ts`:

```ts
export * from './protocol.js'
```

Add to root `vitest.config.ts`? No — each package runs its own Vitest via `pnpm --filter`. Leave the root config as-is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bool/shared test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): typed + zod-validated WebSocket protocol v1"
```

---

### Task 3: `@bool/server` — Fastify app with health check

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/src/app.test.ts`

**Interfaces:**
- Consumes: nothing yet (WS wiring comes in Task 4).
- Produces:
  - `buildApp(): FastifyInstance` — builds the app with routes but does not listen. Registers `GET /health` → `{ status: 'ok' }`.
  - `src/index.ts` — boots `buildApp()` and listens on `process.env.PORT ?? 3030`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/app.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { buildApp } from './app.js'

const app = buildApp()
afterAll(async () => {
  await app.close()
})

describe('server app', () => {
  it('responds to GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bool/server test`
Expected: FAIL — `./app.js` / package does not exist.

- [ ] **Step 3: Create the package and implementation**

`packages/server/package.json`:

```json
{
  "name": "@bool/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@bool/shared": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/static": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.14.0",
    "ws": "^8.18.0",
    "@types/ws": "^8.5.0"
  }
}
```

`packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

`packages/server/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
```

`packages/server/src/index.ts`:

```ts
import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 3030)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp()

app
  .listen({ port, host })
  .then((address) => {
    // eslint-disable-next-line no-console
    console.log(`bool server listening on ${address}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bool/server test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): Fastify app with /health"
```

---

### Task 4: `@bool/server` — WebSocket endpoint (`hello`/`welcome`, `ping`/`pong`)

**Files:**
- Create: `packages/server/src/ws.ts`
- Modify: `packages/server/src/app.ts` (register the WS plugin + route)
- Test: `packages/server/src/ws.test.ts`

**Interfaces:**
- Consumes: `parseClientMessage`, `PROTOCOL_VERSION`, and `ServerMessage` from `@bool/shared`.
- Produces:
  - A WebSocket route at `/ws`. On a valid `hello`, the server replies with a `welcome` (`{ type:'welcome', protocolVersion: PROTOCOL_VERSION, serverTime }`). On `ping`, replies `pong` echoing `t`. On any invalid/unparseable message, replies `{ type:'error', message }` and does not crash.
  - `registerWebSocket(app: FastifyInstance): void` in `ws.ts`.
  - `serverTimeNow(): number` helper (wraps `Date.now()`) so tests can reason about it.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/ws.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import { buildApp } from './app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let url: string

beforeAll(async () => {
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  url = `ws://127.0.0.1:${addr.port}/ws`
})

afterAll(async () => {
  await app.close()
})

function once<T>(ws: WebSocket, send: object): Promise<T> {
  return new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify(send)))
    ws.on('message', (data) => {
      resolve(JSON.parse(data.toString()) as T)
      ws.close()
    })
    ws.on('error', reject)
  })
}

describe('websocket /ws', () => {
  it('replies welcome to hello', async () => {
    const reply = await once<{ type: string; protocolVersion: number }>(new WebSocket(url), {
      type: 'hello',
      clientVersion: 1,
    })
    expect(reply.type).toBe('welcome')
    expect(reply.protocolVersion).toBe(1)
  })

  it('replies pong echoing t', async () => {
    const reply = await once<{ type: string; t: number }>(new WebSocket(url), {
      type: 'ping',
      t: 42,
    })
    expect(reply).toMatchObject({ type: 'pong', t: 42 })
  })

  it('replies error on garbage', async () => {
    const reply = await once<{ type: string }>(new WebSocket(url), { type: 'garbage' })
    expect(reply.type).toBe('error')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bool/server test`
Expected: FAIL — no `/ws` route; connection closes or times out.

- [ ] **Step 3: Implement the WebSocket handler**

`packages/server/src/ws.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'

export function serverTimeNow(): number {
  return Date.now()
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg))

    socket.on('message', (raw: Buffer) => {
      let msg
      try {
        msg = parseClientMessage(raw.toString())
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

Modify `packages/server/src/app.ts` to register the plugin and route:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import { registerWebSocket } from './ws.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(websocket)
  app.register(async (instance) => {
    registerWebSocket(instance)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
```

> Note: `@fastify/websocket` v11 passes the socket directly as the first handler argument (not `connection.socket`). The `{ websocket: true }` route option marks it as a WS route.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bool/server test`
Expected: PASS (health + 3 ws tests = 4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): WebSocket /ws with hello/welcome + ping/pong"
```

---

### Task 5: `@bool/client` — Vite + React 19 with a typed WS client

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/ws-client.ts`
- Test: `packages/client/src/ws-client.test.ts`

**Interfaces:**
- Consumes: `ClientMessage`, `ServerMessage`, `parseServerMessage` from `@bool/shared`.
- Produces:
  - `createWsClient(opts: { url: string; socketFactory?: (url: string) => WebSocketLike }): WsClient` where `WsClient` has `send(msg: ClientMessage): void`, `onMessage(cb: (msg: ServerMessage) => void): void`, `close(): void`.
  - `WebSocketLike` — the minimal interface (`send`, `close`, `addEventListener('open'|'message'|'close', cb)`) so tests inject a fake socket.
  - `<App />` renders connection status text: "Connecting…" → "Connected" once a `welcome` arrives.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/ws-client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createWsClient, type WebSocketLike } from './ws-client.js'

function fakeSocket() {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {}
  const sock: WebSocketLike = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (type, cb) => {
      ;(listeners[type] ??= []).push(cb as (ev: unknown) => void)
    },
  }
  const emit = (type: string, ev: unknown) => (listeners[type] ?? []).forEach((cb) => cb(ev))
  return { sock, emit }
}

describe('ws-client', () => {
  it('parses server messages and forwards them to onMessage', () => {
    const { sock, emit } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    const received: unknown[] = []
    client.onMessage((m) => received.push(m))

    emit('message', { data: JSON.stringify({ type: 'pong', t: 7 }) })

    expect(received).toEqual([{ type: 'pong', t: 7 }])
  })

  it('serializes outgoing client messages', () => {
    const { sock } = fakeSocket()
    const client = createWsClient({ url: 'ws://x/ws', socketFactory: () => sock })
    client.send({ type: 'ping', t: 9 })
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping', t: 9 }))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bool/client test`
Expected: FAIL — package/module missing.

- [ ] **Step 3: Create the package, WS client, and React app**

`packages/client/package.json`:

```json
{
  "name": "@bool/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@bool/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^7.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vitest": "^3.0.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`packages/client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`packages/client/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3030', ws: true },
      '/health': 'http://localhost:3030',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

`packages/client/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

`packages/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bool</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/client/src/ws-client.ts`:

```ts
import { parseServerMessage, type ClientMessage, type ServerMessage } from '@bool/shared'

export interface WebSocketLike {
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close', cb: (ev: unknown) => void): void
}

export interface WsClient {
  send(msg: ClientMessage): void
  onMessage(cb: (msg: ServerMessage) => void): void
  close(): void
}

export function createWsClient(opts: {
  url: string
  socketFactory?: (url: string) => WebSocketLike
}): WsClient {
  const factory = opts.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike)
  const sock = factory(opts.url)
  const handlers: ((msg: ServerMessage) => void)[] = []

  sock.addEventListener('message', (ev) => {
    const data = (ev as { data: string }).data
    let msg: ServerMessage
    try {
      msg = parseServerMessage(data)
    } catch {
      return
    }
    handlers.forEach((h) => h(msg))
  })

  return {
    send: (msg) => sock.send(JSON.stringify(msg)),
    onMessage: (cb) => handlers.push(cb),
    close: () => sock.close(),
  }
}
```

`packages/client/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { createWsClient } from './ws-client.js'

export function App() {
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

  return <main>{connected ? 'Connected' : 'Connecting…'}</main>
}
```

`packages/client/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bool/client test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): Vite + React 19 shell with typed WS client"
```

---

### Task 6: End-to-end wiring — server serves the built client + manual round-trip

**Files:**
- Modify: `packages/server/src/app.ts` (serve static client build when present)
- Create: `packages/server/src/static.ts`
- Test: `packages/server/src/static.test.ts`

**Interfaces:**
- Consumes: the client build output at `packages/client/dist`.
- Produces: when `packages/client/dist/index.html` exists, `GET /` serves it and unknown non-API routes fall back to `index.html` (SPA history fallback). When it does not exist (dev), `GET /` returns 404 without crashing.
  - `registerStatic(app: FastifyInstance, clientDist: string): void` in `static.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/static.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import fstatic from '@fastify/static'
import { registerStatic } from './static.js'

let app: FastifyInstance
let dist: string

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'bool-dist-'))
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>bool</title>')
  app = Fastify()
  await app.register(fstatic, { root: dist })
  registerStatic(app, dist)
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('static serving', () => {
  it('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('bool')
  })

  it('falls back to index.html for unknown SPA routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/libera' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('bool')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bool/server test`
Expected: FAIL — `./static.js` does not exist.

- [ ] **Step 3: Implement static serving with SPA fallback**

`packages/server/src/static.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Assumes @fastify/static is already registered with { root: clientDist }.
export function registerStatic(app: FastifyInstance, clientDist: string): void {
  app.get('/', async (_req, reply) => reply.sendFile('index.html'))

  // SPA history fallback: any GET not matched above and not an API/ws route.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/health') && !req.url.startsWith('/ws')) {
      if (existsSync(join(clientDist, 'index.html'))) {
        return reply.sendFile('index.html')
      }
    }
    return reply.code(404).send({ error: 'not found' })
  })
}
```

Modify `packages/server/src/app.ts` to wire static serving only when the build exists:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'
import fstatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWebSocket } from './ws.js'
import { registerStatic } from './static.js'

const here = dirname(fileURLToPath(import.meta.url))
const clientDist = join(here, '../../client/dist')

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(websocket)
  app.register(async (instance) => {
    registerWebSocket(instance)
  })

  app.get('/health', async () => ({ status: 'ok' }))

  if (existsSync(clientDist)) {
    app.register(fstatic, { root: clientDist })
    app.register(async (instance) => {
      registerStatic(instance, clientDist)
    })
  }

  return app
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @bool/server test`
Expected: PASS (health + 3 ws + 2 static = 6 tests).

- [ ] **Step 5: Manual end-to-end verification**

Run in two terminals:

```bash
# terminal 1
pnpm --filter @bool/server dev
# terminal 2
pnpm --filter @bool/client dev
```

Open the Vite dev URL (e.g. `http://localhost:5173`). Expected: the page shows "Connecting…" then flips to "Connected" (the WS proxy reaches the server, `hello`→`welcome` completes).

Then verify the production path:

```bash
pnpm --filter @bool/client build
pnpm --filter @bool/server start
# open http://localhost:3030 — should show "Connected" served entirely by the server
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): serve built client with SPA fallback; e2e round-trip"
```

---

## Self-Review

**Spec coverage (Milestone 0 scope):** monorepo (`packages/shared|server|client`) ✓ Task 1–5; shared WS protocol as single source of truth ✓ Task 2; Fastify server ✓ Task 3–4; Vite+React 19 client ✓ Task 5; typed WS round-trip ✓ Task 4–6; server serves client static ✓ Task 6; tests + tooling ✓ every task. Out of scope for this milestone (correctly deferred to later plans): auth/Better Auth, IRC engine, history/search, push, media, design system integration.

**Placeholder scan:** every code step contains complete, runnable code; every command has an expected result. No TBD/TODO.

**Type consistency:** `ClientMessage`/`ServerMessage`, `parseClientMessage`/`parseServerMessage`, `PROTOCOL_VERSION` defined in Task 2 and consumed with identical names in Tasks 4 (server) and 5 (client). `WebSocketLike`/`WsClient`/`createWsClient` defined and consumed consistently in Task 5. `registerWebSocket`, `registerStatic`, `buildApp` signatures match between definition and call sites.

## Execution Handoff

After this milestone, the next plans (each its own file) are: Milestone 1 (Better Auth + admin), Milestone 2 (IRC Engine), Milestone 3 (History + FTS search), Milestone 4 (Sync gateway + read-state), Milestone 5 (Client UI core — consumes the chosen design direction + shimmer-derived token architecture), Milestone 6 (rich features), Milestone 7 (push/PWA), Milestone 8 (Electron).
