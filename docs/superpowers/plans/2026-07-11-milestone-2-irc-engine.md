# bool — Milestone 2: IRC Engine (Bouncer Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the authenticated server the ability to hold live IRC connections (one per user per network) via `irc-framework` — with IRCv3 capability negotiation, SASL, robust auto-reconnect, and send/receive — and relay those events to the user's WebSocket over the typed protocol.

**Architecture:** A server-side `IrcConnection` wraps an `irc-framework` `Client` (the client is dependency-injected via a factory so tests use a fake EventEmitter). It normalizes irc-framework events into our shared `ServerMessage` protocol. An `IrcManager` owns one `IrcConnection` per (userId, networkId), driven by network configs stored in SQLite (`networks`/`channels`, SASL secrets encrypted at rest). The session-gated `/ws` handler routes client IRC commands (`net:connect`, `chan:join`, `chat:send`, …) to that user's manager and fans manager events back to the socket. This milestone is server-only and live-relay (no history persistence — that is Milestone 3; no polished UI — that is Milestone 5). Automated tests use an injected fake IRC client; real-network validation is manual.

**Tech Stack (added):** `irc-framework` (v4.14.0, no bundled types → a local ambient `.d.ts`), Node `crypto` (AES-256-GCM) for SASL-secret encryption.

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM (`"type":"module"`), `moduleResolution: NodeNext` (server) / `Bundler` (client). Node `>=20`.
- **Protocol source of truth is `@bool/shared`** — all new client↔server IRC messages are defined there (types + zod). Server and client never redefine them.
- **The browser never speaks IRC.** All IRC I/O is server-side in the IRC Engine; the client only sends/receives the typed WS protocol.
- **One `irc-framework` `Client` per (userId, networkId).** The client is injected via a factory so tests never open a real socket. No test connects to a real IRC network.
- **IRCv3:** request the library's default caps plus `echo-message` (`enable_echomessage: true`) so sent messages are echoed for fan-out. Read enabled caps from `client.network.cap`. Never assume a cap is present — degrade gracefully.
- **Secrets at rest:** SASL passwords are encrypted with AES-256-GCM using a key derived from `BETTER_AUTH_SECRET`; never stored or logged in plaintext, never sent back to the client.
- **Per-user isolation:** every network/channel row and every manager lookup is scoped to the authenticated `user.id` (from `getSessionFromHeaders`). A user can never drive another user's connection.
- `irc-framework` is CommonJS with **named exports and no default** — import `{ Client }` and provide a hand-written ambient declaration (no types ship).

---

### Task 1: Extend the shared WS protocol with IRC messages

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol-irc.test.ts`

**Interfaces:**
- Produces (server + client both consume these EXACT shapes):
  - Client→server additions to `clientMessageSchema`:
    - `{ type:'net:add', name, host:string, port:number, tls:boolean, nick:string, username?:string, realname?:string, saslAccount?:string, saslPassword?:string }`
    - `{ type:'net:remove', networkId:number }`
    - `{ type:'net:connect', networkId:number }`
    - `{ type:'net:disconnect', networkId:number }`
    - `{ type:'net:list' }`
    - `{ type:'chan:join', networkId:number, channel:string }`
    - `{ type:'chan:part', networkId:number, channel:string }`
    - `{ type:'chat:send', networkId:number, target:string, text:string }`
  - Server→client additions to `serverMessageSchema`:
    - `{ type:'net:state', networkId:number, name:string, state:'connecting'|'registered'|'reconnecting'|'closed', nick?:string }`
    - `{ type:'net:list', networks: Array<{ id:number, name:string, host:string, port:number, tls:boolean, nick:string, connected:boolean }> }`
    - `{ type:'net:error', networkId:number, message:string }`
    - `{ type:'chat:msg', networkId:number, target:string, from:string, kind:'privmsg'|'notice'|'action', text:string, self:boolean, msgid?:string, time?:number, account?:string }`
    - `{ type:'chan:names', networkId:number, channel:string, users: Array<{ nick:string, modes:string[] }> }`
    - `{ type:'chan:join', networkId:number, channel:string, nick:string, self:boolean }`
    - `{ type:'chan:part', networkId:number, channel:string, nick:string, reason?:string }`
    - `{ type:'chan:topic', networkId:number, channel:string, topic:string }`
    - `{ type:'presence:quit', networkId:number, nick:string, reason?:string }`
    - `{ type:'presence:nick', networkId:number, oldNick:string, newNick:string }`
  - `parseClientMessage` / `parseServerMessage` accept all of the above; `PROTOCOL_VERSION` bumped to `2`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/protocol-irc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('irc protocol messages', () => {
  it('bumped PROTOCOL_VERSION to 2', () => {
    expect(PROTOCOL_VERSION).toBe(2)
  })

  it('parses net:add', () => {
    const m = parseClientMessage(
      JSON.stringify({ type: 'net:add', name: 'Libera', host: 'irc.libera.chat', port: 6697, tls: true, nick: 'bool' }),
    )
    expect(m.type).toBe('net:add')
  })

  it('parses chat:send and chan:join', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi' })).type).toBe('chat:send')
    expect(parseClientMessage(JSON.stringify({ type: 'chan:join', networkId: 1, channel: '#x' })).type).toBe('chan:join')
  })

  it('parses server chat:msg with optional tags', () => {
    const m = parseServerMessage(
      JSON.stringify({ type: 'chat:msg', networkId: 1, target: '#x', from: 'bob', kind: 'privmsg', text: 'yo', self: false, msgid: 'abc', time: 123 }),
    )
    expect(m).toMatchObject({ type: 'chat:msg', from: 'bob', kind: 'privmsg' })
  })

  it('parses net:state and chan:names', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'net:state', networkId: 1, name: 'Libera', state: 'registered', nick: 'bool' })).type).toBe('net:state')
    expect(
      parseServerMessage(JSON.stringify({ type: 'chan:names', networkId: 1, channel: '#x', users: [{ nick: 'bob', modes: ['o'] }] })).type,
    ).toBe('chan:names')
  })

  it('rejects an unknown type and a malformed net:add', () => {
    expect(() => parseClientMessage(JSON.stringify({ type: 'net:nope' }))).toThrow()
    expect(() => parseClientMessage(JSON.stringify({ type: 'net:add', name: 'x' }))).toThrow()
  })
})
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter @bool/shared test` → FAIL (version still 1, new types unknown).

- [ ] **Step 3: Extend `protocol.ts`**

In `packages/shared/src/protocol.ts`: bump `PROTOCOL_VERSION` to `2`, then add the schemas and fold them into the two discriminated unions. Add:

```ts
// --- IRC: Client -> Server ---
export const netAddSchema = z.object({
  type: z.literal('net:add'),
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  tls: z.boolean(),
  nick: z.string(),
  username: z.string().optional(),
  realname: z.string().optional(),
  saslAccount: z.string().optional(),
  saslPassword: z.string().optional(),
})
export const netRemoveSchema = z.object({ type: z.literal('net:remove'), networkId: z.number().int() })
export const netConnectSchema = z.object({ type: z.literal('net:connect'), networkId: z.number().int() })
export const netDisconnectSchema = z.object({ type: z.literal('net:disconnect'), networkId: z.number().int() })
export const netListReqSchema = z.object({ type: z.literal('net:list') })
export const chanJoinSchema = z.object({ type: z.literal('chan:join'), networkId: z.number().int(), channel: z.string() })
export const chanPartSchema = z.object({ type: z.literal('chan:part'), networkId: z.number().int(), channel: z.string() })
export const chatSendSchema = z.object({ type: z.literal('chat:send'), networkId: z.number().int(), target: z.string(), text: z.string() })

// --- IRC: Server -> Client ---
export const netStateSchema = z.object({
  type: z.literal('net:state'),
  networkId: z.number().int(),
  name: z.string(),
  state: z.enum(['connecting', 'registered', 'reconnecting', 'closed']),
  nick: z.string().optional(),
})
export const netListSchema = z.object({
  type: z.literal('net:list'),
  networks: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      host: z.string(),
      port: z.number().int(),
      tls: z.boolean(),
      nick: z.string(),
      connected: z.boolean(),
    }),
  ),
})
export const netErrorSchema = z.object({ type: z.literal('net:error'), networkId: z.number().int(), message: z.string() })
export const chatMsgSchema = z.object({
  type: z.literal('chat:msg'),
  networkId: z.number().int(),
  target: z.string(),
  from: z.string(),
  kind: z.enum(['privmsg', 'notice', 'action']),
  text: z.string(),
  self: z.boolean(),
  msgid: z.string().optional(),
  time: z.number().optional(),
  account: z.string().optional(),
})
export const chanNamesSchema = z.object({
  type: z.literal('chan:names'),
  networkId: z.number().int(),
  channel: z.string(),
  users: z.array(z.object({ nick: z.string(), modes: z.array(z.string()) })),
})
export const chanJoinEvtSchema = z.object({ type: z.literal('chan:join'), networkId: z.number().int(), channel: z.string(), nick: z.string(), self: z.boolean() })
export const chanPartEvtSchema = z.object({ type: z.literal('chan:part'), networkId: z.number().int(), channel: z.string(), nick: z.string(), reason: z.string().optional() })
export const chanTopicSchema = z.object({ type: z.literal('chan:topic'), networkId: z.number().int(), channel: z.string(), topic: z.string() })
export const presenceQuitSchema = z.object({ type: z.literal('presence:quit'), networkId: z.number().int(), nick: z.string(), reason: z.string().optional() })
export const presenceNickSchema = z.object({ type: z.literal('presence:nick'), networkId: z.number().int(), oldNick: z.string(), newNick: z.string() })
```

Then extend the unions (keep the existing members):

```ts
export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema, pingSchema,
  netAddSchema, netRemoveSchema, netConnectSchema, netDisconnectSchema, netListReqSchema,
  chanJoinSchema, chanPartSchema, chatSendSchema,
])

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema, pongSchema, errorSchema,
  netStateSchema, netListSchema, netErrorSchema,
  chatMsgSchema, chanNamesSchema, chanJoinEvtSchema, chanPartEvtSchema, chanTopicSchema,
  presenceQuitSchema, presenceNickSchema,
])
```

Update `PROTOCOL_VERSION = 2`. `ClientMessage`/`ServerMessage` types are re-inferred automatically.

- [ ] **Step 4: Run it (GREEN)**

Run: `pnpm --filter @bool/shared test` → PASS. Also `pnpm --filter @bool/shared typecheck`.

> Note: `PROTOCOL_VERSION` is now 2. The server's `welcome` already sends `PROTOCOL_VERSION`; the Milestone-0 client sends `clientVersion: 1` in `hello` — that's a client app version, not the protocol version, so no test breaks. Leave it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): extend WS protocol with IRC network/channel/chat messages (v2)"
```

---

### Task 2: `irc-framework` types + `IrcConnection` wrapper

**Files:**
- Create: `packages/server/src/types/irc-framework.d.ts`
- Create: `packages/server/src/irc/connection.ts`
- Test: `packages/server/src/irc/connection.test.ts`
- Modify: `packages/server/package.json` (add `irc-framework`)
- Modify: `packages/server/tsconfig.json` (ensure the local `.d.ts` is included)

**Interfaces:**
- Consumes: `ServerMessage` from `@bool/shared`.
- Produces:
  - `interface IrcClientLike` — the minimal EventEmitter surface we use (`on`, `emit`, `connect`, `say`, `join`, `part`, `quit`, `changeNick`, `raw`, plus `user`/`network` accessors). This is what the fake implements in tests.
  - `type IrcClientFactory = () => IrcClientLike`.
  - `class IrcConnection` — `new IrcConnection(networkId, config, sink, factory?)` where `config` is `{ name, host, port, tls, nick, username?, realname?, saslAccount?, saslPassword? }`, `sink: (msg: ServerMessage) => void`, and `factory` defaults to a real `irc-framework` client. Methods: `connect()`, `disconnect()`, `join(channel)`, `part(channel)`, `say(target, text)`, `isConnected(): boolean`, `currentNick(): string`. It wires irc-framework events → `sink(ServerMessage)`.

- [ ] **Step 1: Add the dependency and ambient types**

Add `"irc-framework": "^4.14.0"` to `packages/server/package.json` dependencies; `pnpm install`.

`packages/server/src/types/irc-framework.d.ts` — a minimal ambient module (the package ships no types):

```ts
declare module 'irc-framework' {
  import { EventEmitter } from 'node:events'

  export interface ConnectOptions {
    host: string
    port: number
    tls?: boolean
    ssl?: boolean
    nick: string
    username?: string
    gecos?: string
    password?: string
    account?: { account: string; password: string }
    enable_echomessage?: boolean
    auto_reconnect?: boolean
    auto_reconnect_max_retries?: number
    auto_reconnect_max_wait?: number
  }

  export class Client extends EventEmitter {
    user: { nick: string }
    network: { name: string; cap: { enabled: string[]; isEnabled(c: string): boolean } }
    connect(options: ConnectOptions): void
    say(target: string, message: string, tags?: Record<string, string>): void
    notice(target: string, message: string): void
    join(channel: string, key?: string): void
    part(channel: string, message?: string): void
    changeNick(nick: string): void
    quit(message?: string): void
    raw(...args: unknown[]): void
  }

  export function ircLineParser(line: string): unknown
}
```

Ensure `packages/server/tsconfig.json` `include` covers `src` (the `.d.ts` under `src/types` is picked up automatically since `include: ["src"]`).

- [ ] **Step 2: Write the failing test** (drive a FAKE client by emitting irc-framework events; assert the emitted `ServerMessage`s)

`packages/server/src/irc/connection.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { IrcConnection, type IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

function fakeClient() {
  const ee = new EventEmitter() as EventEmitter & IrcClientLike
  ;(ee as any).user = { nick: 'bool' }
  ;(ee as any).network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn()
  ee.say = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  return ee
}

function makeConn() {
  const client = fakeClient()
  const out: ServerMessage[] = []
  const conn = new IrcConnection(
    1,
    { name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' },
    (m) => out.push(m),
    () => client,
  )
  conn.connect()
  return { conn, client, out }
}

describe('IrcConnection', () => {
  it('emits net:state connecting then registered', () => {
    const { client, out } = makeConn()
    client.emit('registered', { nick: 'bool' })
    expect(out[0]).toMatchObject({ type: 'net:state', state: 'connecting' })
    expect(out.some((m) => m.type === 'net:state' && (m as any).state === 'registered')).toBe(true)
  })

  it('maps a channel privmsg to chat:msg (self=false)', () => {
    const { client, out } = makeConn()
    client.emit('message', { type: 'privmsg', nick: 'bob', target: '#x', message: 'hi', tags: { msgid: 'm1' }, time: 99 })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg).toMatchObject({ type: 'chat:msg', target: '#x', from: 'bob', kind: 'privmsg', text: 'hi', self: false, msgid: 'm1', time: 99 })
  })

  it('marks self=true when the sender is our own nick (echo-message)', () => {
    const { client, out } = makeConn()
    client.emit('message', { type: 'privmsg', nick: 'bool', target: '#x', message: 'me', tags: {} })
    const msg = out.find((m) => m.type === 'chat:msg') as any
    expect(msg.self).toBe(true)
  })

  it('maps join/part/quit/nick/topic/userlist', () => {
    const { client, out } = makeConn()
    client.emit('join', { nick: 'bob', channel: '#x' })
    client.emit('userlist', { channel: '#x', users: [{ nick: 'bob', modes: ['o'] }] })
    client.emit('part', { nick: 'bob', channel: '#x', message: 'bye' })
    client.emit('quit', { nick: 'bob', message: 'zzz' })
    client.emit('nick', { nick: 'bob', new_nick: 'bobby' })
    client.emit('topic', { channel: '#x', topic: 'hello' })
    const types = out.map((m) => m.type)
    expect(types).toEqual(expect.arrayContaining(['chan:join', 'chan:names', 'chan:part', 'presence:quit', 'presence:nick', 'chan:topic']))
  })

  it('say() delegates to the client', () => {
    const { conn, client } = makeConn()
    conn.say('#x', 'hello')
    expect(client.say).toHaveBeenCalledWith('#x', 'hello')
  })
})
```

- [ ] **Step 3: Run it (RED)**

Run: `pnpm --filter @bool/server test` → FAIL (`./connection.js` missing).

- [ ] **Step 4: Implement `IrcConnection`**

`packages/server/src/irc/connection.ts`:

```ts
import { Client } from 'irc-framework'
import type { ServerMessage } from '@bool/shared'

export interface IrcClientLike {
  on(event: string, cb: (arg: any) => void): void
  emit(event: string, arg?: any): boolean
  connect(options: any): void
  say(target: string, message: string, tags?: Record<string, string>): void
  join(channel: string, key?: string): void
  part(channel: string, message?: string): void
  quit(message?: string): void
  changeNick(nick: string): void
  raw(...args: any[]): void
  user: { nick: string }
  network: { name: string; cap: { enabled: string[]; isEnabled(c: string): boolean } }
}

export type IrcClientFactory = () => IrcClientLike

export interface NetworkConfig {
  name: string
  host: string
  port: number
  tls: boolean
  nick: string
  username?: string
  realname?: string
  saslAccount?: string
  saslPassword?: string
}

export class IrcConnection {
  private client: IrcClientLike | null = null
  private connected = false

  constructor(
    private readonly networkId: number,
    private readonly config: NetworkConfig,
    private readonly sink: (msg: ServerMessage) => void,
    private readonly factory: IrcClientFactory = () => new Client() as unknown as IrcClientLike,
  ) {}

  connect(): void {
    const client = this.factory()
    this.client = client
    this.wire(client)

    this.sink({ type: 'net:state', networkId: this.networkId, name: this.config.name, state: 'connecting' })

    const opts: any = {
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      nick: this.config.nick,
      username: this.config.username ?? this.config.nick,
      gecos: this.config.realname ?? this.config.nick,
      enable_echomessage: true,
      auto_reconnect: true,
    }
    if (this.config.saslAccount && this.config.saslPassword) {
      opts.account = { account: this.config.saslAccount, password: this.config.saslPassword }
    }
    client.connect(opts)
  }

  private wire(client: IrcClientLike): void {
    const nid = this.networkId

    client.on('registered', () => {
      this.connected = true
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'registered', nick: client.user.nick })
    })
    client.on('reconnecting', () => {
      this.connected = false
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'reconnecting' })
    })
    client.on('close', () => {
      this.connected = false
      this.sink({ type: 'net:state', networkId: nid, name: this.config.name, state: 'closed' })
    })

    client.on('message', (e: any) => {
      if (e.type !== 'privmsg' && e.type !== 'notice' && e.type !== 'action') return
      this.sink({
        type: 'chat:msg',
        networkId: nid,
        target: e.target,
        from: e.nick ?? '',
        kind: e.type,
        text: e.message ?? '',
        self: !!e.nick && e.nick === client.user.nick,
        ...(e.tags?.msgid ? { msgid: e.tags.msgid } : {}),
        ...(typeof e.time === 'number' ? { time: e.time } : {}),
        ...(e.account ? { account: e.account } : {}),
      })
    })

    client.on('join', (e: any) => {
      this.sink({ type: 'chan:join', networkId: nid, channel: e.channel, nick: e.nick, self: e.nick === client.user.nick })
    })
    client.on('part', (e: any) => {
      this.sink({ type: 'chan:part', networkId: nid, channel: e.channel, nick: e.nick, ...(e.message ? { reason: e.message } : {}) })
    })
    client.on('quit', (e: any) => {
      this.sink({ type: 'presence:quit', networkId: nid, nick: e.nick, ...(e.message ? { reason: e.message } : {}) })
    })
    client.on('nick', (e: any) => {
      this.sink({ type: 'presence:nick', networkId: nid, oldNick: e.nick, newNick: e.new_nick })
    })
    client.on('topic', (e: any) => {
      this.sink({ type: 'chan:topic', networkId: nid, channel: e.channel, topic: e.topic ?? '' })
    })
    client.on('userlist', (e: any) => {
      this.sink({
        type: 'chan:names',
        networkId: nid,
        channel: e.channel,
        users: (e.users ?? []).map((u: any) => ({ nick: u.nick, modes: u.modes ?? [] })),
      })
    })
  }

  join(channel: string): void {
    this.client?.join(channel)
  }
  part(channel: string): void {
    this.client?.part(channel)
  }
  say(target: string, text: string): void {
    this.client?.say(target, text)
  }
  disconnect(): void {
    this.client?.quit('bool')
    this.connected = false
  }
  isConnected(): boolean {
    return this.connected
  }
  currentNick(): string {
    return this.client?.user.nick ?? this.config.nick
  }
}
```

- [ ] **Step 5: Run it (GREEN)**

Run: `pnpm --filter @bool/server test` → PASS. Also `pnpm --filter @bool/server typecheck`.

> Implementer note: the `.d.ts` and the `IrcClientLike` interface must stay in sync with what `IrcConnection` actually calls. If the installed irc-framework's real event payloads differ from the reference (`userlist` users' `modes` shape, `tags` being an object keyed by name, the `time` field), adapt the mapping and note it — but keep the test's fake driving the same event names.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): IrcConnection wrapping irc-framework, normalizing events to protocol"
```

---

### Task 3: App schema + networks/channels storage + SASL secret encryption

**Files:**
- Create: `packages/server/src/schema.ts`
- Create: `packages/server/src/crypto.ts`
- Create: `packages/server/src/networks.ts`
- Modify: `packages/server/src/index.ts` (ensure app schema at startup)
- Modify: `packages/server/test/global-setup.ts` (ensure app schema in tests)
- Test: `packages/server/src/networks.test.ts`
- Test: `packages/server/src/crypto.test.ts`

**Interfaces:**
- Produces:
  - `ensureAppSchema(db): void` in `schema.ts` — creates `networks` and `channels` tables `IF NOT EXISTS` (app tables that Better Auth's migrator does not manage).
  - `encryptSecret(plain: string): string` / `decryptSecret(blob: string): string` in `crypto.ts` — AES-256-GCM using a key derived from `BETTER_AUTH_SECRET`. Format: `iv:tag:ciphertext` (base64 parts).
  - `NetworkStore` (in `networks.ts`) functions, all scoped by `userId`:
    - `createNetwork(userId, input): NetworkRow`
    - `listNetworks(userId): NetworkRow[]`
    - `getNetwork(userId, id): NetworkRow | null`
    - `removeNetwork(userId, id): void`
    - `NetworkRow` = `{ id, userId, name, host, port, tls, nick, username, realname, saslAccount, saslPassword }` where `saslPassword` is DECRYPTED on read (stored encrypted).

- [ ] **Step 1: Write the failing crypto test**

`packages/server/src/crypto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from './crypto.js'

describe('secret crypto', () => {
  it('round-trips a secret', () => {
    const blob = encryptSecret('hunter2')
    expect(blob).not.toContain('hunter2')
    expect(decryptSecret(blob)).toBe('hunter2')
  })
  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'))
  })
})
```

- [ ] **Step 2: Run it (RED)** → `pnpm --filter @bool/server test` fails (`./crypto.js` missing).

- [ ] **Step 3: Implement crypto + schema**

`packages/server/src/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required for secret encryption')
  return scryptSync(secret, 'bool-secret-salt', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, ctB] = blob.split(':')
  if (!ivB || !tagB || !ctB) throw new Error('malformed secret blob')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8')
}
```

`packages/server/src/schema.ts`:

```ts
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
```

- [ ] **Step 4: Write the failing networks test**

`packages/server/src/networks.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { getDb } from './db.js'
import { ensureAppSchema } from './schema.js'
import { createNetwork, listNetworks, getNetwork, removeNetwork } from './networks.js'

beforeAll(() => ensureAppSchema(getDb()))

describe('NetworkStore', () => {
  it('creates, lists, gets and removes networks scoped by user', () => {
    const a = createNetwork('userA', { name: 'Libera', host: 'irc.libera.chat', port: 6697, tls: true, nick: 'a', saslAccount: 'acc', saslPassword: 'sekret' })
    createNetwork('userB', { name: 'OFTC', host: 'irc.oftc.net', port: 6697, tls: true, nick: 'b' })

    const listA = listNetworks('userA')
    expect(listA).toHaveLength(1)
    expect(listA[0]!.name).toBe('Libera')
    expect(listA[0]!.saslPassword).toBe('sekret') // decrypted on read

    // userB cannot see userA's network
    expect(getNetwork('userB', a.id)).toBeNull()

    removeNetwork('userA', a.id)
    expect(listNetworks('userA')).toHaveLength(0)
  })

  it('stores the SASL password encrypted at rest', () => {
    const n = createNetwork('userC', { name: 'X', host: 'h', port: 1, tls: false, nick: 'c', saslAccount: 'acc', saslPassword: 'plaintextpw' })
    const raw = getDb().prepare('SELECT sasl_password FROM networks WHERE id = ?').get(n.id) as { sasl_password: string }
    expect(raw.sasl_password).not.toContain('plaintextpw')
  })
})
```

- [ ] **Step 5: Run it (RED)** → fails (`./networks.js` missing).

- [ ] **Step 6: Implement `networks.ts`**

`packages/server/src/networks.ts`:

```ts
import { getDb } from './db.js'
import { encryptSecret, decryptSecret } from './crypto.js'

export interface NetworkInput {
  name: string
  host: string
  port: number
  tls: boolean
  nick: string
  username?: string
  realname?: string
  saslAccount?: string
  saslPassword?: string
}

export interface NetworkRow extends NetworkInput {
  id: number
  userId: string
}

interface DbRow {
  id: number
  user_id: string
  name: string
  host: string
  port: number
  tls: number
  nick: string
  username: string | null
  realname: string | null
  sasl_account: string | null
  sasl_password: string | null
}

function toRow(r: DbRow): NetworkRow {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    host: r.host,
    port: r.port,
    tls: !!r.tls,
    nick: r.nick,
    username: r.username ?? undefined,
    realname: r.realname ?? undefined,
    saslAccount: r.sasl_account ?? undefined,
    saslPassword: r.sasl_password ? decryptSecret(r.sasl_password) : undefined,
  }
}

export function createNetwork(userId: string, input: NetworkInput): NetworkRow {
  const enc = input.saslPassword ? encryptSecret(input.saslPassword) : null
  const info = getDb()
    .prepare(
      `INSERT INTO networks (user_id, name, host, port, tls, nick, username, realname, sasl_account, sasl_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, input.name, input.host, input.port, input.tls ? 1 : 0, input.nick, input.username ?? null, input.realname ?? null, input.saslAccount ?? null, enc)
  return getNetwork(userId, Number(info.lastInsertRowid))!
}

export function listNetworks(userId: string): NetworkRow[] {
  return (getDb().prepare('SELECT * FROM networks WHERE user_id = ? ORDER BY id').all(userId) as DbRow[]).map(toRow)
}

export function getNetwork(userId: string, id: number): NetworkRow | null {
  const r = getDb().prepare('SELECT * FROM networks WHERE user_id = ? AND id = ?').get(userId, id) as DbRow | undefined
  return r ? toRow(r) : null
}

export function removeNetwork(userId: string, id: number): void {
  getDb().prepare('DELETE FROM networks WHERE user_id = ? AND id = ?').run(userId, id)
}
```

- [ ] **Step 7: Wire schema at startup and in tests**

In `packages/server/src/index.ts`, call `ensureAppSchema(getDb())` right after obtaining the DB (before the admin-count query, inside the same try/catch so a fresh DB is handled). In `packages/server/test/global-setup.ts`, after the Better Auth migrate step, open the DB and call `ensureAppSchema` so app tables exist for the suite:

```ts
// in global-setup.ts, after execSync(migrate...):
import Database from 'better-sqlite3'
import { ensureAppSchema } from '../src/schema.js'
const db = new Database(dbPath)
ensureAppSchema(db)
db.close()
```

- [ ] **Step 8: Run all server tests (GREEN)**

Run: `pnpm --filter @bool/server test` → PASS (crypto 2, networks 2, plus prior). `pnpm --filter @bool/server typecheck`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): app schema + per-user network store with encrypted SASL secrets"
```

---

### Task 4: `IrcManager` — per-user connection registry

**Files:**
- Create: `packages/server/src/irc/manager.ts`
- Test: `packages/server/src/irc/manager.test.ts`

**Interfaces:**
- Consumes: `IrcConnection`, `IrcClientFactory` (Task 2); `NetworkStore` (Task 3); `ServerMessage` (`@bool/shared`).
- Produces:
  - `class IrcManager` — `new IrcManager(factory?)`. Methods (all take `userId`):
    - `connectNetwork(userId, networkId, sink): void` — loads the network config (via `getNetwork`), creates an `IrcConnection` keyed by `userId:networkId` (idempotent — reuses an existing one), and connects. `sink` receives the connection's `ServerMessage`s.
    - `disconnectNetwork(userId, networkId): void`
    - `join(userId, networkId, channel)`, `part(...)`, `say(userId, networkId, target, text)` — delegate to the connection; no-op (and a returned `false`) if not connected.
    - `getConnection(userId, networkId): IrcConnection | undefined`
    - `isConnected(userId, networkId): boolean`
  - Connections are stored in a `Map<string, IrcConnection>` keyed by `${userId}:${networkId}`.

- [ ] **Step 1: Write the failing test** (inject a fake factory; drive events; assert routing + isolation)

`packages/server/src/irc/manager.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { getDb } from '../db.js'
import { ensureAppSchema } from '../schema.js'
import { createNetwork } from '../networks.js'
import { IrcManager } from './manager.js'
import type { IrcClientLike } from './connection.js'
import type { ServerMessage } from '@bool/shared'

function fakeClient(): IrcClientLike {
  const ee = new EventEmitter() as any
  ee.user = { nick: 'bool' }
  ee.network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
  ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
  ee.say = vi.fn()
  ee.join = vi.fn()
  ee.part = vi.fn()
  ee.quit = vi.fn()
  ee.changeNick = vi.fn()
  ee.raw = vi.fn()
  return ee
}

beforeAll(() => ensureAppSchema(getDb()))

describe('IrcManager', () => {
  it('connects a network and routes events to the sink; say() delegates', () => {
    const clients: any[] = []
    const mgr = new IrcManager(() => {
      const c = fakeClient()
      clients.push(c)
      return c
    })
    const net = createNetwork('userM', { name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' })
    const out: ServerMessage[] = []
    mgr.connectNetwork('userM', net.id, (m) => out.push(m))

    expect(mgr.isConnected('userM', net.id)).toBe(true)
    expect(out.some((m) => m.type === 'net:state' && (m as any).state === 'registered')).toBe(true)

    mgr.say('userM', net.id, '#x', 'hi')
    expect(clients[0].say).toHaveBeenCalledWith('#x', 'hi')
  })

  it('is idempotent per user:network and isolates users', () => {
    const mgr = new IrcManager(() => fakeClient())
    const netA = createNetwork('userA2', { name: 'N', host: 'h', port: 1, tls: false, nick: 'a' })
    mgr.connectNetwork('userA2', netA.id, () => {})
    const first = mgr.getConnection('userA2', netA.id)
    mgr.connectNetwork('userA2', netA.id, () => {})
    expect(mgr.getConnection('userA2', netA.id)).toBe(first) // reused
    expect(mgr.getConnection('userB2', netA.id)).toBeUndefined() // other user isolated
  })

  it('say returns false when not connected', () => {
    const mgr = new IrcManager(() => fakeClient())
    expect(mgr.say('nobody', 999, '#x', 'hi')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (RED)** → fails (`./manager.js` missing).

- [ ] **Step 3: Implement `IrcManager`**

`packages/server/src/irc/manager.ts`:

```ts
import type { ServerMessage } from '@bool/shared'
import { IrcConnection, type IrcClientFactory } from './connection.js'
import { getNetwork } from '../networks.js'

const keyOf = (userId: string, networkId: number) => `${userId}:${networkId}`

export class IrcManager {
  private conns = new Map<string, IrcConnection>()

  constructor(private readonly factory?: IrcClientFactory) {}

  connectNetwork(userId: string, networkId: number, sink: (msg: ServerMessage) => void): void {
    const k = keyOf(userId, networkId)
    const existing = this.conns.get(k)
    if (existing) {
      if (!existing.isConnected()) existing.connect()
      return
    }
    const cfg = getNetwork(userId, networkId)
    if (!cfg) {
      sink({ type: 'net:error', networkId, message: 'network not found' })
      return
    }
    const conn = new IrcConnection(
      networkId,
      { name: cfg.name, host: cfg.host, port: cfg.port, tls: cfg.tls, nick: cfg.nick, username: cfg.username, realname: cfg.realname, saslAccount: cfg.saslAccount, saslPassword: cfg.saslPassword },
      sink,
      this.factory,
    )
    this.conns.set(k, conn)
    conn.connect()
  }

  disconnectNetwork(userId: string, networkId: number): void {
    const k = keyOf(userId, networkId)
    const c = this.conns.get(k)
    if (c) {
      c.disconnect()
      this.conns.delete(k)
    }
  }

  join(userId: string, networkId: number, channel: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.join(channel)
    return true
  }
  part(userId: string, networkId: number, channel: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.part(channel)
    return true
  }
  say(userId: string, networkId: number, target: string, text: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.say(target, text)
    return true
  }

  getConnection(userId: string, networkId: number): IrcConnection | undefined {
    return this.conns.get(keyOf(userId, networkId))
  }
  isConnected(userId: string, networkId: number): boolean {
    return this.conns.get(keyOf(userId, networkId))?.isConnected() ?? false
  }
}
```

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS; `typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): IrcManager — per-user IRC connection registry"
```

---

### Task 5: Wire the IRC engine into the `/ws` handler

**Files:**
- Modify: `packages/server/src/ws.ts` (route IRC client messages → manager; fan manager events → socket; handle `net:add`/`net:remove`/`net:list`)
- Create: `packages/server/src/irc/singleton.ts` (a process-wide `IrcManager` instance)
- Test: `packages/server/src/ws-irc.test.ts`

**Interfaces:**
- Consumes: `getSessionFromHeaders` (session → `user.id`), `IrcManager` (Task 4), `NetworkStore` (Task 3), the new protocol messages (Task 1).
- Produces: the authenticated `/ws` socket now handles the IRC client messages. Per connected socket, a `sink` forwards manager `ServerMessage`s to that socket. `net:add` persists a network (scoped to the session user) and replies with `net:list`; `net:connect` starts the connection; `chan:join`/`chat:send`/etc. delegate to the manager for the session user only. A module-level `IrcManager` (singleton) persists connections across socket reconnects (bouncer behavior).

- [ ] **Step 1: Create the manager singleton**

`packages/server/src/irc/singleton.ts`:

```ts
import { IrcManager } from './manager.js'

// One process-wide manager so IRC connections outlive individual WebSocket sockets.
export const ircManager = new IrcManager()
```

- [ ] **Step 2: Write the failing test** (authenticated socket; inject a fake IRC factory into the singleton; full connect→join→message→send over WS)

`packages/server/src/ws-irc.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { ircManager } from './irc/singleton.js'
import type { IrcClientLike } from './irc/connection.js'

let app: FastifyInstance
let base: string
let lastClient: any

beforeAll(async () => {
  // Inject a fake IRC client factory into the singleton manager.
  ;(ircManager as any).factory = (): IrcClientLike => {
    const ee = new EventEmitter() as any
    ee.user = { nick: 'bool' }
    ee.network = { name: 'TestNet', cap: { enabled: [], isEnabled: () => false } }
    ee.connect = vi.fn(() => ee.emit('registered', { nick: 'bool' }))
    ee.say = vi.fn()
    ee.join = vi.fn(() => ee.emit('join', { nick: 'bool', channel: '#x' }))
    ee.part = vi.fn()
    ee.quit = vi.fn()
    ee.changeNick = vi.fn()
    ee.raw = vi.fn()
    lastClient = ee
    return ee
  }
  app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no address')
  base = `127.0.0.1:${addr.port}`
})
afterAll(async () => {
  await app.close()
})

async function signUpCookie(): Promise<string> {
  const name = `i${Math.floor(performance.now() * 1000) % 1_000_000}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email: `${name}@example.test`, password: 'password1234', name, username: name },
  })
  const c = res.headers['set-cookie']
  return Array.isArray(c) ? c.join('; ') : String(c)
}

function collect(cookie: string, script: (ws: WebSocket) => void, until: (msgs: any[]) => boolean): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = []
    const ws = new WebSocket(`ws://${base}/ws`, { headers: { cookie } })
    ws.on('open', () => script(ws))
    ws.on('message', (d) => {
      msgs.push(JSON.parse(d.toString()))
      if (until(msgs)) {
        resolve(msgs)
        ws.close()
      }
    })
    ws.on('error', reject)
    setTimeout(() => resolve(msgs), 2000)
  })
}

describe('ws irc integration', () => {
  it('adds a network, connects, joins, sends — over the WS protocol', async () => {
    const cookie = await signUpCookie()
    const msgs = await collect(
      cookie,
      (ws) => {
        ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 }))
        ws.send(JSON.stringify({ type: 'net:add', name: 'TestNet', host: 'h', port: 6697, tls: true, nick: 'bool' }))
      },
      (m) => m.some((x) => x.type === 'net:list'),
    )
    const list = msgs.find((m) => m.type === 'net:list')
    expect(list.networks.length).toBeGreaterThanOrEqual(1)
    const netId = list.networks[0].id

    const after = await collect(
      cookie,
      (ws) => {
        ws.send(JSON.stringify({ type: 'hello', clientVersion: 1 }))
        ws.send(JSON.stringify({ type: 'net:connect', networkId: netId }))
        setTimeout(() => ws.send(JSON.stringify({ type: 'chan:join', networkId: netId, channel: '#x' })), 100)
        setTimeout(() => ws.send(JSON.stringify({ type: 'chat:send', networkId: netId, target: '#x', text: 'hello' })), 200)
      },
      (m) => m.some((x) => x.type === 'chan:join' && x.channel === '#x'),
    )
    expect(after.some((m) => m.type === 'net:state' && m.state === 'registered')).toBe(true)
    expect(after.some((m) => m.type === 'chan:join' && m.channel === '#x')).toBe(true)
    expect(lastClient.say).toHaveBeenCalledWith('#x', 'hello')
  })
})
```

- [ ] **Step 3: Run it (RED)** → fails (the IRC messages aren't handled; no `net:list` reply).

- [ ] **Step 4: Extend the `/ws` handler**

Modify `packages/server/src/ws.ts` — after the session check, capture `userId = session.user.id`, build a `sink` that writes to this socket, and route the IRC messages. Keep the existing `hello`/`ping` behavior.

```ts
import type { FastifyInstance } from 'fastify'
import { parseClientMessage, PROTOCOL_VERSION, type ServerMessage } from '@bool/shared'
import { getSessionFromHeaders } from './auth-routes.js'
import { ircManager } from './irc/singleton.js'
import { createNetwork, removeNetwork, listNetworks } from './networks.js'

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
    const userId = session.user.id
    const sink = (msg: ServerMessage) => send(msg)

    const sendNetList = () => {
      send({
        type: 'net:list',
        networks: listNetworks(userId).map((n) => ({
          id: n.id, name: n.name, host: n.host, port: n.port, tls: n.tls, nick: n.nick,
          connected: ircManager.isConnected(userId, n.id),
        })),
      })
    }

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const text = Buffer.isBuffer(raw) ? raw.toString() : Array.isArray(raw) ? Buffer.concat(raw).toString() : Buffer.from(raw).toString()
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
        case 'net:add':
          createNetwork(userId, {
            name: msg.name, host: msg.host, port: msg.port, tls: msg.tls, nick: msg.nick,
            username: msg.username, realname: msg.realname, saslAccount: msg.saslAccount, saslPassword: msg.saslPassword,
          })
          sendNetList()
          break
        case 'net:remove':
          ircManager.disconnectNetwork(userId, msg.networkId)
          removeNetwork(userId, msg.networkId)
          sendNetList()
          break
        case 'net:list':
          sendNetList()
          break
        case 'net:connect':
          ircManager.connectNetwork(userId, msg.networkId, sink)
          break
        case 'net:disconnect':
          ircManager.disconnectNetwork(userId, msg.networkId)
          send({ type: 'net:state', networkId: msg.networkId, name: '', state: 'closed' })
          break
        case 'chan:join':
          ircManager.join(userId, msg.networkId, msg.channel)
          break
        case 'chan:part':
          ircManager.part(userId, msg.networkId, msg.channel)
          break
        case 'chat:send':
          if (!ircManager.say(userId, msg.networkId, msg.target, msg.text)) {
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          }
          break
      }
    })
  })
}
```

> Note on the sink and reconnecting sockets: `connectNetwork` binds the sink of whichever socket first connected the network. For this milestone that is acceptable (single-device relay). Full multi-device fan-out (re-binding all of a user's live sockets to one connection) is Milestone 4 (Sync gateway) — do not build it here. Leave a one-line comment saying so.

- [ ] **Step 5: Run it (GREEN)** → `pnpm --filter @bool/server test` PASS (ws-irc + all prior). `typecheck` clean, `pnpm -r test` green.

> Implementer note: because the `ircManager` singleton persists across tests, use unique users per test (the `signUpCookie` helper already makes unique names) and unique-enough networks so cross-test state doesn't collide. If the singleton's retained connections cause flakiness, disconnect them in an `afterAll`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): route IRC protocol messages through the session-gated /ws"
```

---

## Self-Review

**Spec coverage (Milestone 2 = "IRC Engine: connect to networks, SASL, IRCv3 caps, send/receive, reconnect"):** connect to networks via irc-framework ✓ Task 2; SASL (account option) ✓ Task 2 + encrypted secret storage Task 3; IRCv3 caps (library defaults + echo-message; read from `client.network.cap`) ✓ Task 2 (graceful — never asserts a cap); send/receive mapped to protocol ✓ Tasks 1–2; auto-reconnect (library `auto_reconnect` + `reconnecting`/`close` → `net:state`) ✓ Task 2; per-user isolation ✓ Tasks 3–5; tied to the authenticated session ✓ Task 5. Deferred by design (documented, not dropped): message **persistence** → Milestone 3 (History+FTS); **multi-device fan-out** → Milestone 4 (Sync gateway); **UI** → Milestone 5.

**Placeholder scan:** every code step is complete; commands have expected outcomes. "Implementer notes" flag runtime-verification points against the real irc-framework (event payload shapes, tags object) — verification instructions, not placeholders.

**Type consistency:** `IrcClientLike`/`IrcClientFactory`/`IrcConnection`/`NetworkConfig` (Task 2), `NetworkRow`/`createNetwork`/`getNetwork`/`listNetworks`/`removeNetwork` (Task 3), `IrcManager` methods (Task 4), `ircManager` singleton + protocol message names (Task 5) are defined once and consumed with identical names/shapes downstream. The protocol message shapes (Task 1) are the single contract used by Task 2's sink and Task 5's router.

**Known runtime-verification risks (call out during execution):** (1) real irc-framework event payload fields (`userlist` user `modes`, `tags` as object vs array, `time`) — Task 2 note; (2) the `.d.ts` must match the real API surface we call; (3) singleton-manager state bleed across tests — Task 5 note. None block the mock-driven tests.

## Execution Handoff

Executed subagent-driven like Milestones 0–1. After this: Milestone 3 (History persistence + FTS search — adds the `messages` table and stores what the IRC engine relays), then 4 (Sync gateway + read-state, incl. multi-device fan-out), 5 (Client UI core — Direction A + themes), 6 (rich features), 7 (push/PWA), 8 (Electron). A real end-to-end connect against Libera.Chat should be validated manually once the Milestone 5 UI exists (or via a throwaway script before then).
