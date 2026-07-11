# bool — Milestone 4: Sync Gateway + Read-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver true multi-device fan-out — every message/event the IRC engine relays reaches ALL of a user's connected sockets (not just the one that issued `net:connect`) — and cross-device read-state sync (a read marker set on one device updates the others).

**Architecture:** A per-process `Hub` holds, per `userId`, the set of live socket sinks. `IrcManager`'s persisting wrapper stops targeting a single caller sink and instead `hub.publish(userId, msg)` after persisting — decoupling IRC connection lifetime from any one socket (the real bouncer model). Each authenticated `/ws` socket subscribes its `send` to the hub on connect and unsubscribes on close. Read markers live in a `read_markers` table (per user, per network+target); `read:set` upserts and fans a `read:update` out to the user's other devices; a subscribing socket receives current `net:list` + `read:list` to catch up (message backfill continues to use Milestone 3's `history:request`).

**Tech Stack (added):** none — pure server refactor + a new table.

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM (`"type":"module"`), NodeNext (server). Node `>=20`.
- **Protocol source of truth is `@bool/shared`** — new read messages defined there (types + zod), `PROTOCOL_VERSION` bumped to `4`.
- **Per-user isolation:** the hub fans out ONLY to sinks registered under the same `userId`; read markers are stored and listed per `user_id`. A user's message/read event can never reach another user's socket.
- **Connection lifetime is socket-independent:** an IRC connection keeps running and persisting when a user has zero sockets; when a socket (re)connects it subscribes and receives current state. Persistence (Milestone 3) already runs before fan-out.
- **No message loss on fan-out:** a throwing sink (dead socket) must not break delivery to the user's other sinks, nor stop persistence.
- Existing Milestone 2/3 tests that pass a per-call sink to `connectNetwork` are updated to the hub model — this is an intended interface change, not a regression to work around.

---

### Task 1: Protocol v4 — read-state messages

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/protocol-history.test.ts` (version bump assertion) OR a new test file
- Test: `packages/shared/src/protocol-read.test.ts`

**Interfaces:**
- Produces:
  - Client→server: `{ type:'read:set', networkId:number, target:string, ts:number }`; `{ type:'read:list' }`.
  - Server→client: `{ type:'read:update', networkId:number, target:string, ts:number }`; `{ type:'read:list', markers: Array<{ networkId:number, target:string, ts:number }> }`.
  - `PROTOCOL_VERSION = 4`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/protocol-read.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('read-state protocol', () => {
  it('bumped PROTOCOL_VERSION to 4', () => {
    expect(PROTOCOL_VERSION).toBe(4)
  })
  it('parses read:set and read:list (client)', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'read:set', networkId: 1, target: '#x', ts: 10 })).type).toBe('read:set')
    expect(parseClientMessage(JSON.stringify({ type: 'read:list' })).type).toBe('read:list')
  })
  it('parses read:update and read:list (server)', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'read:update', networkId: 1, target: '#x', ts: 10 })).type).toBe('read:update')
    expect(parseServerMessage(JSON.stringify({ type: 'read:list', markers: [{ networkId: 1, target: '#x', ts: 10 }] })).type).toBe('read:list')
  })
  it('rejects read:set missing ts', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'read:set', networkId: 1, target: '#x' }))).toThrow()
  })
})
```

Also update the existing `protocol-history.test.ts` assertion `expect(PROTOCOL_VERSION).toBe(3)` → `toBe(4)` (a version bump requires updating the version test; not a weakening).

- [ ] **Step 2: Run it (RED)** → `pnpm --filter @bool/shared test` fails.

- [ ] **Step 3: Extend `protocol.ts`**

Bump `PROTOCOL_VERSION` to `4`. Add:

```ts
export const readSetSchema = z.object({ type: z.literal('read:set'), networkId: z.number().int(), target: z.string(), ts: z.number() })
export const readListReqSchema = z.object({ type: z.literal('read:list') })
export const readUpdateSchema = z.object({ type: z.literal('read:update'), networkId: z.number().int(), target: z.string(), ts: z.number() })
export const readListSchema = z.object({
  type: z.literal('read:list'),
  markers: z.array(z.object({ networkId: z.number().int(), target: z.string(), ts: z.number() })),
})
```

Add `readSetSchema, readListReqSchema` to `clientMessageSchema`; `readUpdateSchema, readListSchema` to `serverMessageSchema`. (Note: `read:list` appears in both unions — same dual-union pattern already used for `net:list`; safe because separate parsers.)

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/shared test` + `typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): protocol v4 — read-state messages"
```

---

### Task 2: Read-marker store

**Files:**
- Modify: `packages/server/src/schema.ts` (add `read_markers`)
- Create: `packages/server/src/read-markers.ts`
- Test: `packages/server/src/read-markers.test.ts`

**Interfaces:**
- Produces (in `read-markers.ts`):
  - `setReadMarker(userId, networkId, target, ts): void` — upsert; a later `ts` advances the marker, an earlier `ts` is ignored (markers only move forward).
  - `listReadMarkers(userId): Array<{ networkId:number, target:string, ts:number }>`.

- [ ] **Step 1: Extend the schema**

In `ensureAppSchema`, add:

```sql
CREATE TABLE IF NOT EXISTS read_markers (
  user_id TEXT NOT NULL,
  network_id INTEGER NOT NULL,
  target TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, network_id, target)
);
```

- [ ] **Step 2: Write the failing test**

`packages/server/src/read-markers.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { setReadMarker, listReadMarkers } from './read-markers.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('read markers', () => {
  it('sets and lists markers per user', () => {
    setReadMarker('ru1', 1, '#a', 100)
    setReadMarker('ru1', 1, '#b', 200)
    const list = listReadMarkers('ru1')
    expect(list).toHaveLength(2)
    expect(list.find((m) => m.target === '#a')!.ts).toBe(100)
  })
  it('only moves markers forward', () => {
    setReadMarker('ru2', 1, '#a', 500)
    setReadMarker('ru2', 1, '#a', 300) // earlier — ignored
    expect(listReadMarkers('ru2')[0]!.ts).toBe(500)
    setReadMarker('ru2', 1, '#a', 700) // later — advances
    expect(listReadMarkers('ru2')[0]!.ts).toBe(700)
  })
  it('isolates users', () => {
    setReadMarker('ruA', 1, '#x', 10)
    expect(listReadMarkers('ruB')).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run it (RED)** → fails (`./read-markers.js` missing).

- [ ] **Step 4: Implement `read-markers.ts`**

```ts
import { getDb } from './db.js'

export function setReadMarker(userId: string, networkId: number, target: string, ts: number): void {
  getDb()
    .prepare(
      `INSERT INTO read_markers (user_id, network_id, target, ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, network_id, target) DO UPDATE SET ts = excluded.ts WHERE excluded.ts > read_markers.ts`,
    )
    .run(userId, networkId, target, ts)
}

export function listReadMarkers(userId: string): Array<{ networkId: number; target: string; ts: number }> {
  return (getDb().prepare('SELECT network_id, target, ts FROM read_markers WHERE user_id = ? ORDER BY network_id, target').all(userId) as {
    network_id: number
    target: string
    ts: number
  }[]).map((r) => ({ networkId: r.network_id, target: r.target, ts: r.ts }))
}
```

- [ ] **Step 5: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): read-marker store (forward-only, per user)"
```

---

### Task 3: Fan-out Hub + refactor `IrcManager` to publish to it

**Files:**
- Create: `packages/server/src/irc/hub.ts`
- Modify: `packages/server/src/irc/manager.ts` (publish to hub instead of a per-call sink)
- Modify: `packages/server/src/irc/singleton.ts` (export a `hub` too; wire it into the manager)
- Modify: existing tests that call `connectNetwork(userId, id, sink)` — `manager.test.ts`, `manager-persist.test.ts` (adapt to the hub model)
- Test: `packages/server/src/irc/hub.test.ts`

**Interfaces:**
- Produces:
  - `class Hub` in `hub.ts`: `subscribe(userId, sink): () => void` (adds sink to the user's Set, returns an unsubscribe fn that removes it and cleans up an empty Set); `publish(userId, msg): void` (calls every sink for that user, each wrapped so one throwing sink doesn't stop the others); `subscriberCount(userId): number` (for tests).
  - `IrcManager` constructor now takes `(factory?, hub?)` (defaults: real client factory, a new `Hub`). `connectNetwork(userId, networkId)` **drops the sink parameter**; its persisting wrapper does `storeMessage` (guarded, from M3) then `this.hub.publish(userId, msg)`. On missing config it publishes a `net:error` to the hub. `join/part/say/disconnectNetwork/isConnected/getConnection` unchanged.
  - `singleton.ts` exports both `hub` and `ircManager` (the manager constructed with that shared `hub`).

- [ ] **Step 1: Write the failing hub test**

`packages/server/src/irc/hub.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Hub } from './hub.js'
import type { ServerMessage } from '@bool/shared'

const welcome: ServerMessage = { type: 'welcome', protocolVersion: 4, serverTime: 0 }

describe('Hub', () => {
  it('fans a message out to all of a user\'s sinks', () => {
    const hub = new Hub()
    const a: ServerMessage[] = []
    const b: ServerMessage[] = []
    hub.subscribe('u1', (m) => a.push(m))
    hub.subscribe('u1', (m) => b.push(m))
    hub.publish('u1', welcome)
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })
  it('isolates users', () => {
    const hub = new Hub()
    const other: ServerMessage[] = []
    hub.subscribe('u2', (m) => other.push(m))
    hub.publish('u3', welcome)
    expect(other).toHaveLength(0)
  })
  it('unsubscribe stops delivery and cleans up', () => {
    const hub = new Hub()
    const got: ServerMessage[] = []
    const unsub = hub.subscribe('u4', (m) => got.push(m))
    unsub()
    hub.publish('u4', welcome)
    expect(got).toHaveLength(0)
    expect(hub.subscriberCount('u4')).toBe(0)
  })
  it('one throwing sink does not stop the others', () => {
    const hub = new Hub()
    const good: ServerMessage[] = []
    hub.subscribe('u5', () => { throw new Error('dead socket') })
    hub.subscribe('u5', (m) => good.push(m))
    expect(() => hub.publish('u5', welcome)).not.toThrow()
    expect(good).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (`./hub.js` missing).

- [ ] **Step 3: Implement `hub.ts`**

```ts
import type { ServerMessage } from '@bool/shared'

export type Sink = (msg: ServerMessage) => void

export class Hub {
  private subs = new Map<string, Set<Sink>>()

  subscribe(userId: string, sink: Sink): () => void {
    let set = this.subs.get(userId)
    if (!set) {
      set = new Set()
      this.subs.set(userId, set)
    }
    set.add(sink)
    return () => {
      const s = this.subs.get(userId)
      if (!s) return
      s.delete(sink)
      if (s.size === 0) this.subs.delete(userId)
    }
  }

  publish(userId: string, msg: ServerMessage): void {
    const set = this.subs.get(userId)
    if (!set) return
    for (const sink of set) {
      try {
        sink(msg)
      } catch {
        // a dead/throwing socket must not stop delivery to the user's other devices
      }
    }
  }

  subscriberCount(userId: string): number {
    return this.subs.get(userId)?.size ?? 0
  }
}
```

- [ ] **Step 4: Refactor `IrcManager` + singleton**

`singleton.ts`:

```ts
import { Hub } from './hub.js'
import { IrcManager } from './manager.js'

export const hub = new Hub()
export const ircManager = new IrcManager(undefined, hub)
```

`manager.ts` — constructor takes an optional hub; `connectNetwork` drops the sink param and publishes to the hub:

```ts
import type { ServerMessage } from '@bool/shared'
import { IrcConnection, type IrcClientFactory } from './connection.js'
import { getNetwork } from '../networks.js'
import { storeMessage } from '../messages.js'
import { Hub } from './hub.js'

const keyOf = (userId: string, networkId: number) => `${userId}:${networkId}`

export class IrcManager {
  private conns = new Map<string, IrcConnection>()
  private hub: Hub

  constructor(private readonly factory?: IrcClientFactory, hub?: Hub) {
    this.hub = hub ?? new Hub()
  }

  getHub(): Hub {
    return this.hub
  }

  connectNetwork(userId: string, networkId: number): void {
    const k = keyOf(userId, networkId)
    const existing = this.conns.get(k)
    if (existing) {
      if (!existing.isConnected()) existing.connect()
      return
    }
    const cfg = getNetwork(userId, networkId)
    if (!cfg) {
      this.hub.publish(userId, { type: 'net:error', networkId, message: 'network not found' })
      return
    }
    const persistingSink = (msg: ServerMessage) => {
      if (msg.type === 'chat:msg') {
        try {
          storeMessage(userId, {
            networkId: msg.networkId, target: msg.target, sender: msg.from, kind: msg.kind, body: msg.text,
            ts: msg.time ?? Date.now(), ...(msg.msgid ? { msgid: msg.msgid } : {}),
          })
        } catch {
          // persistence failure must not block fan-out
        }
      }
      this.hub.publish(userId, msg)
    }
    const conn = new IrcConnection(
      networkId,
      { name: cfg.name, host: cfg.host, port: cfg.port, tls: cfg.tls, nick: cfg.nick, username: cfg.username, realname: cfg.realname, saslAccount: cfg.saslAccount, saslPassword: cfg.saslPassword },
      persistingSink,
      this.factory,
    )
    this.conns.set(k, conn)
    conn.connect()
  }

  // join/part/say/disconnectNetwork/isConnected/getConnection UNCHANGED from Milestone 2/3
}
```

Update `manager.test.ts` and `manager-persist.test.ts` to the hub model: instead of passing a sink to `connectNetwork`, subscribe a collector to `mgr.getHub()` for the user, then `mgr.connectNetwork(userId, id)` and assert on what the hub delivered. (Keep the assertions' intent: registration state, chat relay, persistence, idempotency, isolation.)

- [ ] **Step 5: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): fan-out Hub; IrcManager publishes to all of a user's sockets"
```

---

### Task 4: Wire fan-out + read-state into `/ws`

**Files:**
- Modify: `packages/server/src/ws.ts` (subscribe/unsubscribe to the hub; handle `read:set`/`read:list`; send state on subscribe; `net:connect` no longer passes a sink)
- Test: `packages/server/src/ws-sync.test.ts`

**Interfaces:**
- Consumes: `hub` + `ircManager` (singleton), `setReadMarker`/`listReadMarkers` (Task 2), `listNetworks` (M2).
- Produces: on an authenticated `/ws` connect, the socket's `send` is `hub.subscribe(userId, send)`d, and the returned unsubscribe runs on socket `close`. Immediately after subscribing, the socket is sent the current `net:list` and a `read:list`. `net:connect` calls `ircManager.connectNetwork(userId, networkId)` (no sink — delivery is via the hub). New cases: `read:set` → `setReadMarker(userId, …)` then `hub.publish(userId, {type:'read:update', …})` (fans to all the user's devices, including the sender — idempotent); `read:list` → `send({type:'read:list', markers: listReadMarkers(userId)})`.

- [ ] **Step 1: Write the failing test** (two sockets, same user, both receive a relayed message + read updates; cross-user isolation)

`packages/server/src/ws-sync.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { ircManager } from './irc/singleton.js'
import type { IrcClientLike } from './irc/connection.js'

let app: FastifyInstance
let base: string
let lastClient: any

beforeAll(async () => {
  ;(ircManager as any).factory = (): IrcClientLike => {
    const ee = new EventEmitter() as any
    ee.user = { nick: 'bool' }
    ee.network = { name: 'N', cap: { enabled: [], isEnabled: () => false } }
    ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
    ee.say = vi.fn(); ee.join = vi.fn(); ee.part = vi.fn(); ee.quit = vi.fn(); ee.changeNick = vi.fn(); ee.raw = vi.fn(); ee.removeAllListeners = vi.fn()
    lastClient = ee
    return ee
  }
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`
})
afterAll(async () => { await app.close() })

async function signUpCookie(): Promise<string> {
  const name = 'sy' + randomUUID().slice(0, 8)
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${name}@example.test`, password: 'password1234', name, username: name } })
  const c = res.headers['set-cookie']
  return Array.isArray(c) ? c.join('; ') : String(c)
}

function openSocket(cookie: string): { ws: WebSocket; msgs: any[]; ready: Promise<void> } {
  const msgs: any[] = []
  const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
  const ready = new Promise<void>((resolve) => ws.on('open', () => resolve()))
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())))
  return { ws, msgs, ready }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('ws multi-device sync', () => {
  it('fans a relayed message to both of a user\'s sockets and syncs read markers', async () => {
    const cookie = await signUpCookie()
    const s1 = openSocket(cookie); await s1.ready
    const s2 = openSocket(cookie); await s2.ready

    // add + connect a network from socket 1
    s1.ws.send(JSON.stringify({ type: 'net:add', name: 'N', host: 'h', port: 6697, tls: true, nick: 'bool' }))
    await wait(100)
    const list = s1.msgs.find((m) => m.type === 'net:list')
    const netId = list.networks[0].id
    s1.ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
    await wait(100)

    // an inbound IRC message must reach BOTH sockets via the hub
    lastClient.emit('message', { type: 'privmsg', nick: 'zoe', target: '#x', message: 'hi all', tags: {}, time: 7 })
    await wait(100)
    expect(s1.msgs.some((m) => m.type === 'chat:msg' && m.text === 'hi all')).toBe(true)
    expect(s2.msgs.some((m) => m.type === 'chat:msg' && m.text === 'hi all')).toBe(true)

    // read:set on socket 1 fans read:update to socket 2
    s1.ws.send(JSON.stringify({ type: 'read:set', networkId: netId, target: '#x', ts: 7 }))
    await wait(100)
    expect(s2.msgs.some((m) => m.type === 'read:update' && m.target === '#x' && m.ts === 7)).toBe(true)

    s1.ws.close(); s2.ws.close()
  })

  it('does not leak to another user\'s socket', async () => {
    const cookieA = await signUpCookie()
    const cookieB = await signUpCookie()
    const a = openSocket(cookieA); await a.ready
    const b = openSocket(cookieB); await b.ready
    a.ws.send(JSON.stringify({ type: 'read:set', networkId: 1, target: '#p', ts: 5 }))
    await wait(100)
    expect(b.msgs.some((m) => m.type === 'read:update')).toBe(false)
    a.ws.close(); b.ws.close()
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (hub subscribe + read handlers not wired; `net:connect` still expects a sink).

- [ ] **Step 3: Extend `ws.ts`**

After the session gate captures `userId`, subscribe to the hub and send initial state; unsubscribe on close; add the read cases; drop the sink from `net:connect`:

```ts
import { hub, ircManager } from './irc/singleton.js'
import { setReadMarker, listReadMarkers } from './read-markers.js'
import { listNetworks } from './networks.js'
// ...
// after `const userId = session.user.id`:
const unsubscribe = hub.subscribe(userId, (msg) => socket.send(JSON.stringify(msg)))
socket.on('close', () => unsubscribe())

// send current state to the freshly-subscribed socket:
send({ type: 'net:list', networks: listNetworks(userId).map((n) => ({ id: n.id, name: n.name, host: n.host, port: n.port, tls: n.tls, nick: n.nick, connected: ircManager.isConnected(userId, n.id) })) })
send({ type: 'read:list', markers: listReadMarkers(userId) })

// in the switch, change net:connect and add read cases:
case 'net:connect':
  ircManager.connectNetwork(userId, msg.networkId)   // delivery is via the hub now
  break
case 'read:set':
  setReadMarker(userId, msg.networkId, msg.target, msg.ts)
  hub.publish(userId, { type: 'read:update', networkId: msg.networkId, target: msg.target, ts: msg.ts })
  break
case 'read:list':
  send({ type: 'read:list', markers: listReadMarkers(userId) })
  break
```

Also remove the now-unused per-socket `sink`/`sendNetList`-via-connect wiring that assumed a single relay (keep `sendNetList` for `net:add`/`net:remove`/`net:list` replies — those still reply to the requesting socket via `send`, which is fine). Ensure `net:disconnect` still calls `sendNetList()` (from M2 fix).

> Note: `read:update` is published to ALL the user's sockets including the sender — the client treats it idempotently (setting a marker it already has is a no-op). This keeps the fan-out path uniform.

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS (ws-sync + updated ws-irc). `typecheck` clean; `pnpm -r test` green.

> Implementer note: the M2 `ws-irc.test.ts` sent `net:connect` and expected the connecting socket to receive `net:state`/`chan:join`. That still works because the connecting socket is subscribed to the hub. But it previously may have relied on the per-call sink; verify it passes under the hub model and adjust if it asserted sink-specific behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): hub fan-out + read-state sync over /ws (multi-device)"
```

---

## Self-Review

**Spec coverage (Milestone 4 = "Sync gateway + read-state, incl. multi-device fan-out"):** multi-device fan-out ✓ Tasks 3–4 (Hub delivers to all a user's sockets); read-state store + cross-device sync ✓ Tasks 2, 4; connection-lifetime decoupled from any socket ✓ Task 3 (persist + publish, no per-socket sink); subscribing socket catches up on state ✓ Task 4 (`net:list` + `read:list` on connect; message backfill via M3 `history:request`); per-user isolation on hub + markers ✓ Tasks 2–4; no fan-out message loss on a dead sink ✓ Task 3 (per-sink try/catch).

**Placeholder scan:** every code step is complete. The M2/M3 test updates are described concretely (subscribe to `getHub()` instead of passing a sink).

**Type consistency:** `Hub`/`Sink`/`subscribe`/`publish`/`subscriberCount` (Task 3) are used identically by `singleton.ts` and `ws.ts`; `IrcManager.connectNetwork(userId, networkId)` new signature (no sink) is consumed by `ws.ts` Task 4; `setReadMarker`/`listReadMarkers` (Task 2) used by `ws.ts` Task 4; read message shapes (Task 1) are the contract for Task 4.

**Known risks (call out during execution):** (1) updating M2/M3 tests to the hub model is the main churn — keep their intent; (2) the initial `net:list`/`read:list` on every socket connect is small but fires per socket — fine; (3) fan-out to the sender of `read:set` is intentional (idempotent) — don't special-case it.

## Execution Handoff

Executed subagent-driven like Milestones 0–3. After this: Milestone 5 (Client UI core — Direction A + themes; consumes the fan-out, search/history, and read-state), 6 (rich features), 7 (push/PWA), 8 (Electron).
