# bool — Milestone 3: History Persistence + FTS Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the chat messages the IRC engine relays into SQLite, expose fast full-text search ("like Slack": `in:#channel` / `from:user` filters) and per-channel scrollback over the WS protocol, and prune messages past an admin-configurable retention window.

**Architecture:** A `messages` table plus a synchronized FTS5 index (`messages_fts`) live in the same SQLite DB. The IRC engine's per-connection sink is wrapped by `IrcManager` so every `chat:msg` it produces is persisted (always, independent of any attached socket — bouncer behavior) before being relayed. The session-gated `/ws` handler answers `chat:search` and `history:request` by querying the store scoped to `session.user.id`. A retention pruner deletes rows older than `BOOL_RETENTION_DAYS` at startup and on an interval.

**Tech Stack (added):** SQLite FTS5 (built into better-sqlite3). No new dependencies.

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM (`"type":"module"`), NodeNext (server). Node `>=20`.
- **Protocol source of truth is `@bool/shared`** — new search/history messages defined there (types + zod), `PROTOCOL_VERSION` bumped to `3`.
- **Per-user isolation:** every message row carries `user_id`; every search/history/prune query filters by it. A user can never read another user's history.
- **Persistence is always-on:** messages are stored whenever the IRC engine relays them, whether or not a WebSocket is currently attached (bouncer semantics). Persistence must not depend on the relay sink.
- **The store is the single owner of the `messages`/`messages_fts` schema and their sync** — inserts and deletes keep both tables consistent.
- Retention is admin-configurable via `BOOL_RETENTION_DAYS` (0 or unset = keep forever).
- Search must be safe against FTS5 syntax injection — user query terms are used as MATCH input; sanitize/quote so a stray `"` or operator can't error or escape scope.

---

### Task 1: Protocol v3 — search + history messages

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol-history.test.ts`

**Interfaces:**
- Produces:
  - Client→server: `{ type:'chat:search', query:string, limit?:number }`; `{ type:'history:request', networkId:number, target:string, limit?:number, before?:number }`.
  - Server→client: `{ type:'search:results', query:string, results: StoredMsg[] }`; `{ type:'history:batch', networkId:number, target:string, messages: StoredMsg[] }`.
  - `StoredMsg` = `{ id:number, networkId:number, target:string, sender:string, kind:'privmsg'|'notice'|'action', body:string, ts:number, msgid?:string }`.
  - `PROTOCOL_VERSION = 3`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/protocol-history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('history/search protocol', () => {
  it('bumped PROTOCOL_VERSION to 3', () => {
    expect(PROTOCOL_VERSION).toBe(3)
  })
  it('parses chat:search and history:request', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'chat:search', query: 'from:bob hello' })).type).toBe('chat:search')
    expect(parseClientMessage(JSON.stringify({ type: 'history:request', networkId: 1, target: '#x', limit: 50 })).type).toBe('history:request')
  })
  it('parses search:results and history:batch', () => {
    const sm = { id: 1, networkId: 1, target: '#x', sender: 'bob', kind: 'privmsg', body: 'hi', ts: 10 }
    expect(parseServerMessage(JSON.stringify({ type: 'search:results', query: 'hi', results: [sm] })).type).toBe('search:results')
    expect(parseServerMessage(JSON.stringify({ type: 'history:batch', networkId: 1, target: '#x', messages: [sm] })).type).toBe('history:batch')
  })
  it('rejects a search missing query', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'chat:search' }))).toThrow()
  })
})
```

- [ ] **Step 2: Run it (RED)** → `pnpm --filter @bool/shared test` fails.

- [ ] **Step 3: Extend `protocol.ts`**

Bump `PROTOCOL_VERSION` to `3`. Add:

```ts
export const storedMsgSchema = z.object({
  id: z.number().int(),
  networkId: z.number().int(),
  target: z.string(),
  sender: z.string(),
  kind: z.enum(['privmsg', 'notice', 'action']),
  body: z.string(),
  ts: z.number(),
  msgid: z.string().optional(),
})
export type StoredMsg = z.infer<typeof storedMsgSchema>

export const chatSearchSchema = z.object({ type: z.literal('chat:search'), query: z.string(), limit: z.number().int().optional() })
export const historyRequestSchema = z.object({
  type: z.literal('history:request'),
  networkId: z.number().int(),
  target: z.string(),
  limit: z.number().int().optional(),
  before: z.number().optional(),
})
export const searchResultsSchema = z.object({ type: z.literal('search:results'), query: z.string(), results: z.array(storedMsgSchema) })
export const historyBatchSchema = z.object({ type: z.literal('history:batch'), networkId: z.number().int(), target: z.string(), messages: z.array(storedMsgSchema) })
```

Add `chatSearchSchema, historyRequestSchema` to `clientMessageSchema`, and `searchResultsSchema, historyBatchSchema` to `serverMessageSchema`.

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/shared test` + `typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): protocol v3 — search + history messages"
```

---

### Task 2: Messages store + FTS5 schema

**Files:**
- Modify: `packages/server/src/schema.ts` (add `messages` + `messages_fts`)
- Create: `packages/server/src/messages.ts`
- Test: `packages/server/src/messages.test.ts`

**Interfaces:**
- Produces (in `messages.ts`):
  - `storeMessage(userId, m): number` — `m = { networkId, target, sender, kind, body, ts, msgid? }`; inserts into `messages` and mirrors `(body, sender, target)` into `messages_fts` at the same rowid; returns the new id.
  - `searchMessages(userId, query, limit?): StoredMsg[]` — parses `in:#channel` and `from:nick` tokens out of `query`, uses the remaining words as a sanitized FTS MATCH, filters by `user_id` (+ target/sender when tokens present), newest first.
  - `getHistory(userId, networkId, target, limit?, before?): StoredMsg[]` — newest-first page (optionally `ts < before`), returned oldest-first for display.
  - `pruneOlderThan(cutoffTs): number` — deletes messages (and their FTS rows) with `ts < cutoffTs`; returns deleted count.
  - `parseSearch(query): { terms: string, target?: string, sender?: string }` (exported for tests).

- [ ] **Step 1: Extend the schema**

In `packages/server/src/schema.ts` `ensureAppSchema`, add to the `db.exec` block:

```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  network_id INTEGER NOT NULL,
  target TEXT NOT NULL,
  sender TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  msgid TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_hist ON messages(user_id, network_id, target, ts);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(body, sender, target, content='messages', content_rowid='id');
```

> Using an external-content FTS5 table (`content='messages'`) keeps the index compact. We keep it in sync explicitly in `messages.ts` (insert/delete mirror rows) rather than with triggers, so the sync logic is testable in one place.

- [ ] **Step 2: Write the failing test**

`packages/server/src/messages.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage, searchMessages, getHistory, pruneOlderThan, parseSearch } from './messages.js'

beforeAll(() => ensureAppSchema(getDb()))

const base = (over: Partial<Parameters<typeof storeMessage>[1]> = {}) => ({
  networkId: 1, target: '#linux', sender: 'alice', kind: 'privmsg' as const, body: 'hello world', ts: 1000, ...over,
})

describe('parseSearch', () => {
  it('extracts in: and from: tokens', () => {
    expect(parseSearch('in:#linux from:bob kernel panic')).toEqual({ terms: 'kernel panic', target: '#linux', sender: 'bob' })
  })
  it('returns just terms when no tokens', () => {
    expect(parseSearch('hello there')).toEqual({ terms: 'hello there' })
  })
})

describe('messages store', () => {
  it('stores and searches by body', () => {
    storeMessage('u1', base({ body: 'the quick brown fox', ts: 10 }))
    const r = searchMessages('u1', 'brown')
    expect(r.length).toBe(1)
    expect(r[0]!.body).toBe('the quick brown fox')
  })

  it('isolates users', () => {
    storeMessage('uA', base({ body: 'secret alpha', ts: 20 }))
    expect(searchMessages('uB', 'alpha')).toHaveLength(0)
  })

  it('applies in:#channel and from:user filters', () => {
    storeMessage('u2', base({ target: '#python', sender: 'carol', body: 'match me', ts: 30 }))
    storeMessage('u2', base({ target: '#linux', sender: 'dave', body: 'match me', ts: 31 }))
    const r = searchMessages('u2', 'in:#python match')
    expect(r).toHaveLength(1)
    expect(r[0]!.target).toBe('#python')
  })

  it('does not crash on FTS special characters', () => {
    expect(() => searchMessages('u3', 'foo "bar OR baz*')).not.toThrow()
  })

  it('returns channel history oldest-first', () => {
    storeMessage('u4', base({ networkId: 2, target: '#c', body: 'first', ts: 100 }))
    storeMessage('u4', base({ networkId: 2, target: '#c', body: 'second', ts: 200 }))
    const h = getHistory('u4', 2, '#c')
    expect(h.map((m) => m.body)).toEqual(['first', 'second'])
  })

  it('prunes old messages from both tables', () => {
    const id = storeMessage('u5', base({ body: 'ancient', ts: 1 }))
    const del = pruneOlderThan(2)
    expect(del).toBeGreaterThanOrEqual(1)
    expect(getDb().prepare('SELECT COUNT(*) n FROM messages WHERE id = ?').get(id)).toEqual({ n: 0 })
    expect(searchMessages('u5', 'ancient')).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run it (RED)** → fails (`./messages.js` missing).

- [ ] **Step 4: Implement `messages.ts`**

```ts
import { getDb } from './db.js'
import type { StoredMsg } from '@bool/shared'

export interface MessageInput {
  networkId: number
  target: string
  sender: string
  kind: 'privmsg' | 'notice' | 'action'
  body: string
  ts: number
  msgid?: string
}

interface DbRow {
  id: number
  network_id: number
  target: string
  sender: string
  kind: string
  body: string
  msgid: string | null
  ts: number
}

function toStored(r: DbRow): StoredMsg {
  return {
    id: r.id,
    networkId: r.network_id,
    target: r.target,
    sender: r.sender,
    kind: r.kind as StoredMsg['kind'],
    body: r.body,
    ts: r.ts,
    ...(r.msgid ? { msgid: r.msgid } : {}),
  }
}

export function storeMessage(userId: string, m: MessageInput): number {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO messages (user_id, network_id, target, sender, kind, body, msgid, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, m.networkId, m.target, m.sender, m.kind, m.body, m.msgid ?? null, m.ts)
  const id = Number(info.lastInsertRowid)
  db.prepare('INSERT INTO messages_fts (rowid, body, sender, target) VALUES (?, ?, ?, ?)').run(id, m.body, m.sender, m.target)
  return id
}

export function parseSearch(query: string): { terms: string; target?: string; sender?: string } {
  let target: string | undefined
  let sender: string | undefined
  const rest: string[] = []
  for (const tok of query.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('in:')) target = tok.slice(3)
    else if (tok.startsWith('from:')) sender = tok.slice(5)
    else rest.push(tok)
  }
  return { terms: rest.join(' '), ...(target ? { target } : {}), ...(sender ? { sender } : {}) }
}

// Turn free text into a safe FTS5 MATCH: quote each word as a phrase so operators/quotes can't break out.
function ftsQuery(terms: string): string {
  const words = terms.split(/\s+/).filter(Boolean).map((w) => '"' + w.replace(/"/g, '""') + '"')
  return words.join(' ')
}

export function searchMessages(userId: string, query: string, limit = 50): StoredMsg[] {
  const { terms, target, sender } = parseSearch(query)
  const db = getDb()
  const where: string[] = ['m.user_id = ?']
  const params: unknown[] = [userId]
  const match = ftsQuery(terms)

  let sql: string
  if (match) {
    sql = `SELECT m.* FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? AND `
    params.unshift(match) // MATCH param comes first
  } else {
    sql = `SELECT m.* FROM messages m WHERE `
  }
  if (target) { where.push('m.target = ?'); params.push(target) }
  if (sender) { where.push('m.sender = ?'); params.push(sender) }
  sql += where.join(' AND ') + ' ORDER BY m.ts DESC LIMIT ?'
  params.push(limit)
  return (db.prepare(sql).all(...params) as DbRow[]).map(toStored)
}

export function getHistory(userId: string, networkId: number, target: string, limit = 50, before?: number): StoredMsg[] {
  const db = getDb()
  const rows = before
    ? (db.prepare('SELECT * FROM messages WHERE user_id = ? AND network_id = ? AND target = ? AND ts < ? ORDER BY ts DESC LIMIT ?').all(userId, networkId, target, before, limit) as DbRow[])
    : (db.prepare('SELECT * FROM messages WHERE user_id = ? AND network_id = ? AND target = ? ORDER BY ts DESC LIMIT ?').all(userId, networkId, target, limit) as DbRow[])
  return rows.map(toStored).reverse()
}

export function pruneOlderThan(cutoffTs: number): number {
  const db = getDb()
  db.prepare('DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE ts < ?)').run(cutoffTs)
  const info = db.prepare('DELETE FROM messages WHERE ts < ?').run(cutoffTs)
  return info.changes
}
```

- [ ] **Step 5: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): messages store with FTS5 search, history paging, prune"
```

---

### Task 3: Persist relayed messages in the IRC engine

**Files:**
- Modify: `packages/server/src/irc/manager.ts` (persist `chat:msg` before relaying)
- Test: `packages/server/src/irc/manager-persist.test.ts`

**Interfaces:**
- Consumes: `storeMessage` (Task 2).
- Produces: `IrcManager.connectNetwork(userId, networkId, relaySink)` now wraps the connection's sink so that every `chat:msg` `ServerMessage` is persisted via `storeMessage(userId, …)` **before** being forwarded to `relaySink`. Persistence happens regardless of the relay sink (so a message is stored even if the socket has gone away). Non-`chat:msg` events pass straight through. The wrapping is internal; the public method signature is unchanged.

- [ ] **Step 1: Write the failing test**

`packages/server/src/irc/manager-persist.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { getDb } from '../db.js'
import { ensureAppSchema } from '../schema.js'
import { createNetwork } from '../networks.js'
import { searchMessages } from '../messages.js'
import { IrcManager } from './manager.js'
import type { IrcClientLike } from './connection.js'

function fakeClient(): IrcClientLike {
  const ee = new EventEmitter() as any
  ee.user = { nick: 'bool' }
  ee.network = { name: 'N', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
  ee.say = vi.fn(); ee.join = vi.fn(); ee.part = vi.fn(); ee.quit = vi.fn(); ee.changeNick = vi.fn(); ee.raw = vi.fn(); ee.removeAllListeners = vi.fn()
  return ee
}

beforeAll(() => ensureAppSchema(getDb()))

describe('IrcManager persistence', () => {
  it('persists relayed chat messages and still relays them', () => {
    let client!: any
    const mgr = new IrcManager(() => (client = fakeClient()))
    const net = createNetwork('userP', { name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const relayed: any[] = []
    mgr.connectNetwork('userP', net.id, (m) => relayed.push(m))

    client.emit('message', { type: 'privmsg', nick: 'zed', target: '#p', message: 'persist this needle', tags: {}, time: 5 })

    expect(relayed.some((m) => m.type === 'chat:msg')).toBe(true) // still relayed
    const found = searchMessages('userP', 'needle')
    expect(found).toHaveLength(1)
    expect(found[0]!.sender).toBe('zed')
    expect(found[0]!.networkId).toBe(net.id)
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (messages not persisted).

- [ ] **Step 3: Implement the persistence wrap**

In `packages/server/src/irc/manager.ts`, import `storeMessage`, and in `connectNetwork`, wrap the sink before passing it to `IrcConnection`:

```ts
import { storeMessage } from '../messages.js'
// ...
// inside connectNetwork, replace the direct `sink` passed to new IrcConnection with a persisting wrapper:
const persistingSink = (msg: ServerMessage) => {
  if (msg.type === 'chat:msg') {
    storeMessage(userId, {
      networkId: msg.networkId,
      target: msg.target,
      sender: msg.from,
      kind: msg.kind,
      body: msg.text,
      ts: msg.time ?? Date.now(),
      ...(msg.msgid ? { msgid: msg.msgid } : {}),
    })
  }
  sink(msg)
}
const conn = new IrcConnection(networkId, { /* cfg… as before */ }, persistingSink, this.factory)
```

Keep the rest of `connectNetwork` (config load, map keying, idempotency) unchanged — only the sink handed to `IrcConnection` becomes `persistingSink`.

> Note: for M3 the persisting wrapper still forwards to a single relay `sink` (the connecting socket). Multi-relay fan-out is Milestone 4; persistence here is already socket-independent (it runs before the relay), which is the property M4 will build on.

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): persist relayed IRC messages via the manager sink"
```

---

### Task 4: Wire search + history into `/ws`

**Files:**
- Modify: `packages/server/src/ws.ts` (handle `chat:search`, `history:request`)
- Test: `packages/server/src/ws-history.test.ts`

**Interfaces:**
- Consumes: `searchMessages`, `getHistory` (Task 2); session `user.id`.
- Produces: the `/ws` switch handles `chat:search` → `searchMessages(userId, query, limit)` → `send({type:'search:results', query, results})`; and `history:request` → `getHistory(userId, networkId, target, limit, before)` → `send({type:'history:batch', networkId, target, messages})`. Both scoped to the session user.

- [ ] **Step 1: Write the failing test**

`packages/server/src/ws-history.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage } from './messages.js'

let app: FastifyInstance
let base: string
let userId: string
let cookie: string

beforeAll(async () => {
  ensureAppSchema(getDb())
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`

  const name = `h${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${name}@example.test`, password: 'password1234', name, username: name } })
  cookie = String(res.headers['set-cookie'])
  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  userId = me.json().user.id

  storeMessage(userId, { networkId: 7, target: '#hist', sender: 'ann', kind: 'privmsg', body: 'searchable banana', ts: 1 })
  storeMessage(userId, { networkId: 7, target: '#hist', sender: 'ben', kind: 'privmsg', body: 'later message', ts: 2 })
})
afterAll(async () => { await app.close() })

function ask(payload: object, until: (m: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
    ws.on('open', () => ws.send(JSON.stringify(payload)))
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString())
      if (until(m)) { resolve(m); ws.close() }
    })
    ws.on('error', reject)
  })
}

describe('ws history + search', () => {
  it('returns search results for the session user', async () => {
    const m = await ask({ type: 'chat:search', query: 'banana' }, (x) => x.type === 'search:results')
    expect(m.results).toHaveLength(1)
    expect(m.results[0].sender).toBe('ann')
  })
  it('returns channel history oldest-first', async () => {
    const m = await ask({ type: 'history:request', networkId: 7, target: '#hist' }, (x) => x.type === 'history:batch')
    expect(m.messages.map((r: any) => r.body)).toEqual(['searchable banana', 'later message'])
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (messages not handled).

- [ ] **Step 3: Extend the `/ws` switch**

In `packages/server/src/ws.ts`, import `searchMessages, getHistory` and add cases to the switch:

```ts
case 'chat:search':
  send({ type: 'search:results', query: msg.query, results: searchMessages(userId, msg.query, msg.limit) })
  break
case 'history:request':
  send({ type: 'history:batch', networkId: msg.networkId, target: msg.target, messages: getHistory(userId, msg.networkId, msg.target, msg.limit, msg.before) })
  break
```

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean; `pnpm -r test` green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): serve search + history over the session-gated /ws"
```

---

### Task 5: Retention pruning

**Files:**
- Create: `packages/server/src/retention.ts`
- Modify: `packages/server/src/index.ts` (prune at startup + interval)
- Test: `packages/server/src/retention.test.ts`

**Interfaces:**
- Consumes: `pruneOlderThan` (Task 2).
- Produces:
  - `retentionDays(): number` — reads `BOOL_RETENTION_DAYS` (integer; 0/unset/invalid → 0 = keep forever).
  - `runRetention(now: number): number` — if `retentionDays() > 0`, prunes messages older than `now - days*86400_000` and returns the deleted count; else 0.
  - `startRetention(intervalMs?)` in `index.ts` — runs `runRetention(Date.now())` once at startup and on an interval (default 6h), guarded by try/catch.

- [ ] **Step 1: Write the failing test**

`packages/server/src/retention.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { storeMessage } from './messages.js'
import { retentionDays, runRetention } from './retention.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('retention', () => {
  it('keeps everything when BOOL_RETENTION_DAYS is unset/0', () => {
    delete process.env.BOOL_RETENTION_DAYS
    expect(retentionDays()).toBe(0)
    const now = 10_000_000_000
    storeMessage('ur', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'keep', ts: 1 })
    expect(runRetention(now)).toBe(0)
  })

  it('prunes messages older than the window', () => {
    process.env.BOOL_RETENTION_DAYS = '7'
    expect(retentionDays()).toBe(7)
    const now = 1_000_000_000_000
    const oldTs = now - 8 * 86_400_000
    const freshTs = now - 1 * 86_400_000
    storeMessage('ur2', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'old', ts: oldTs })
    storeMessage('ur2', { networkId: 1, target: '#r', sender: 's', kind: 'privmsg', body: 'fresh', ts: freshTs })
    const deleted = runRetention(now)
    expect(deleted).toBeGreaterThanOrEqual(1)
    const rows = getDb().prepare('SELECT body FROM messages WHERE user_id = ?').all('ur2') as { body: string }[]
    expect(rows.map((r) => r.body)).toContain('fresh')
    expect(rows.map((r) => r.body)).not.toContain('old')
    delete process.env.BOOL_RETENTION_DAYS
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (`./retention.js` missing).

- [ ] **Step 3: Implement `retention.ts`**

```ts
import { pruneOlderThan } from './messages.js'

const DAY_MS = 86_400_000

export function retentionDays(): number {
  const n = Number.parseInt(process.env.BOOL_RETENTION_DAYS ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function runRetention(now: number): number {
  const days = retentionDays()
  if (days <= 0) return 0
  return pruneOlderThan(now - days * DAY_MS)
}
```

Add to `packages/server/src/index.ts` (after the server starts; guarded):

```ts
import { runRetention } from './retention.js'
// ...
export function startRetention(intervalMs = 6 * 60 * 60 * 1000): NodeJS.Timeout {
  const tick = () => {
    try {
      const n = runRetention(Date.now())
      if (n > 0) console.log(`retention: pruned ${n} messages`)
    } catch (err) {
      console.error('retention error', err)
    }
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return timer
}
// call startRetention() in the .then() after listen(), inside the existing try/catch context
```

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean; `pnpm -r test` green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): admin-configurable retention pruning"
```

---

## Self-Review

**Spec coverage (Milestone 3 = "Persistent history + fast FTS search + retention"):** persist messages ✓ Tasks 2–3; FTS5 search with `in:`/`from:` filters ("like Slack") ✓ Tasks 2, 4; per-channel scrollback ✓ Tasks 2, 4; admin-configurable retention ✓ Task 5; per-user isolation on every query ✓ Tasks 2–5; served over the session-gated `/ws` ✓ Task 4. Persistence is socket-independent (Task 3) — the always-on property the spec's bouncer model requires.

**Placeholder scan:** every code step is complete; commands have expected outcomes. The `parseSearch`/`ftsQuery` sanitization is concrete (phrase-quoting) — the FTS-injection safety test proves it.

**Type consistency:** `StoredMsg` (Task 1) is the single shape returned by `searchMessages`/`getHistory` (Task 2), carried by `search:results`/`history:batch` (Task 1), and emitted by `/ws` (Task 4). `MessageInput`/`storeMessage`/`searchMessages`/`getHistory`/`pruneOlderThan`/`parseSearch` (Task 2) are consumed with identical names in Tasks 3–5.

**Known risks (call out during execution):** (1) external-content FTS5 requires the mirror insert/delete to use the SAME rowid as `messages.id` — the store does; verify no orphan FTS rows after prune; (2) `ts` uses IRCv3 `server-time` when present else receipt time — acceptable; (3) if `@bool/shared` dist is stale, the vitest alias (added in M2) resolves it to source, so protocol v3 is visible without a rebuild.

## Execution Handoff

Executed subagent-driven like Milestones 0–2. After this: Milestone 4 (Sync gateway + read-state + multi-device fan-out — builds on the socket-independent persistence and the single-relay sink), 5 (Client UI core — Direction A + themes; consumes search/history), 6 (rich features), 7 (push/PWA), 8 (Electron).
