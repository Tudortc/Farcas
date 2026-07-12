# Missing Chat Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the connected client usable — wire slash commands (full set), add a channel-join UI, a sign-out control, and render the connection indicator.

**Architecture:** A pure parser turns composer input into a typed `ParsedCommand`; the Composer dispatches each kind to store actions. Response-producing IRC commands get explicit client→server protocol messages, handled server-side via `irc-framework` and echoed as text into a per-network `*` status buffer. UI wiring (join affordance, sign-out, ConnDot) sits on top of store actions that mostly already exist.

**Tech Stack:** TypeScript, React + Zustand (client), Fastify + irc-framework (server), Zod (shared protocol), Vitest (unit), Playwright (e2e). pnpm workspace: `@bool/client`, `@bool/server`, `@bool/shared`.

## Global Constraints

- Monorepo packages: `@bool/client`, `@bool/server`, `@bool/shared`. Shared types are consumed via `@bool/shared`; **after editing `packages/shared`, run `pnpm --filter @bool/shared build`** before client/server typecheck sees the new types.
- Protocol lives in `packages/shared/src/protocol.ts`. Bump `PROTOCOL_VERSION` from `6` to `7` (this plan, Task 2). Do not bump it more than once.
- Client→server IRC commands must be **explicit semantic schemas** — no generic raw passthrough.
- Status buffer target string is the literal `'*'`; its `TargetKind` is `'status'`.
- Test runner per package: `pnpm --filter <pkg> test <path>` (script is `vitest run`). E2E: `pnpm --filter @bool/client test:e2e`.
- Follow existing file patterns (fake `WebSocketLike` in client store tests, fake `IrcClientLike` EventEmitter in server connection tests).
- Commit after each task. Do not push.

---

### Task 1: Slash-command parser (`commands.ts`)

Pure, dependency-free parser + a `normalizeChannel` helper reused by the join UI.

**Files:**
- Create: `packages/client/src/commands.ts`
- Test: `packages/client/src/commands.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CommandContext { activeTarget: string | null; isChannel: boolean }
  export type ParsedCommand =
    | { kind: 'text'; text: string }
    | { kind: 'action'; text: string }
    | { kind: 'join'; channel: string }
    | { kind: 'part'; reason?: string }
    | { kind: 'msg'; nick: string; text: string }
    | { kind: 'nick'; nick: string }
    | { kind: 'topic'; topic: string }
    | { kind: 'whois'; nick: string }
    | { kind: 'kick'; nick: string; reason?: string }
    | { kind: 'mode'; modes: string; args?: string }
    | { kind: 'list'; filter?: string }
    | { kind: 'error'; message: string }
  export function normalizeChannel(name: string): string
  export function parseCommand(input: string, ctx: CommandContext): ParsedCommand
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/client/src/commands.test.ts
import { describe, it, expect } from 'vitest'
import { parseCommand, normalizeChannel } from './commands.js'

const chanCtx = { activeTarget: '1:#dev', isChannel: true }
const pmCtx = { activeTarget: '1:bob', isChannel: false }

describe('normalizeChannel', () => {
  it('prefixes # when missing', () => expect(normalizeChannel('dev')).toBe('#dev'))
  it('keeps existing # or &', () => {
    expect(normalizeChannel('#dev')).toBe('#dev')
    expect(normalizeChannel('&local')).toBe('&local')
  })
})

describe('parseCommand', () => {
  it('plain text is text', () => expect(parseCommand('hi there', chanCtx)).toEqual({ kind: 'text', text: 'hi there' }))
  it('// escapes a leading slash', () => expect(parseCommand('//not a cmd', chanCtx)).toEqual({ kind: 'text', text: '/not a cmd' }))
  it('/me -> action', () => expect(parseCommand('/me waves', chanCtx)).toEqual({ kind: 'action', text: 'waves' }))
  it('/join normalizes channel', () => expect(parseCommand('/join dev', chanCtx)).toEqual({ kind: 'join', channel: '#dev' }))
  it('/join without arg errors', () => expect(parseCommand('/join', chanCtx).kind).toBe('error'))
  it('/part with reason on a channel', () => expect(parseCommand('/part bye all', chanCtx)).toEqual({ kind: 'part', reason: 'bye all' }))
  it('/part off-channel errors', () => expect(parseCommand('/part', pmCtx).kind).toBe('error'))
  it('/msg splits nick and text', () => expect(parseCommand('/msg bob hey you', chanCtx)).toEqual({ kind: 'msg', nick: 'bob', text: 'hey you' }))
  it('/query is an alias for /msg', () => expect(parseCommand('/query bob hi', chanCtx)).toEqual({ kind: 'msg', nick: 'bob', text: 'hi' }))
  it('/nick', () => expect(parseCommand('/nick newnick', chanCtx)).toEqual({ kind: 'nick', nick: 'newnick' }))
  it('/topic on a channel', () => expect(parseCommand('/topic new topic', chanCtx)).toEqual({ kind: 'topic', topic: 'new topic' }))
  it('/topic off-channel errors', () => expect(parseCommand('/topic x', pmCtx).kind).toBe('error'))
  it('/whois', () => expect(parseCommand('/whois bob', chanCtx)).toEqual({ kind: 'whois', nick: 'bob' }))
  it('/kick with reason', () => expect(parseCommand('/kick bob spamming', chanCtx)).toEqual({ kind: 'kick', nick: 'bob', reason: 'spamming' }))
  it('/kick off-channel errors', () => expect(parseCommand('/kick bob', pmCtx).kind).toBe('error'))
  it('/mode flags and args', () => expect(parseCommand('/mode +o bob', chanCtx)).toEqual({ kind: 'mode', modes: '+o', args: 'bob' }))
  it('/mode flags only', () => expect(parseCommand('/mode +m', chanCtx)).toEqual({ kind: 'mode', modes: '+m' }))
  it('/list with filter', () => expect(parseCommand('/list *rust*', chanCtx)).toEqual({ kind: 'list', filter: '*rust*' }))
  it('/list no filter', () => expect(parseCommand('/list', chanCtx)).toEqual({ kind: 'list' }))
  it('unknown command errors', () => expect(parseCommand('/frobnicate x', chanCtx).kind).toBe('error'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bool/client test src/commands.test.ts`
Expected: FAIL — `commands.js` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/client/src/commands.ts
export interface CommandContext {
  activeTarget: string | null
  isChannel: boolean
}

export type ParsedCommand =
  | { kind: 'text'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'join'; channel: string }
  | { kind: 'part'; reason?: string }
  | { kind: 'msg'; nick: string; text: string }
  | { kind: 'nick'; nick: string }
  | { kind: 'topic'; topic: string }
  | { kind: 'whois'; nick: string }
  | { kind: 'kick'; nick: string; reason?: string }
  | { kind: 'mode'; modes: string; args?: string }
  | { kind: 'list'; filter?: string }
  | { kind: 'error'; message: string }

export function normalizeChannel(name: string): string {
  return name.startsWith('#') || name.startsWith('&') ? name : `#${name}`
}

export function parseCommand(input: string, ctx: CommandContext): ParsedCommand {
  const trimmed = input.trim()
  // '//' escapes a literal leading slash
  if (trimmed.startsWith('//')) return { kind: 'text', text: trimmed.slice(1) }
  if (!trimmed.startsWith('/')) return { kind: 'text', text: input.trim() }

  const spaceIdx = trimmed.indexOf(' ')
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()
  const needChannel = (name: string) =>
    ctx.isChannel ? null : ({ kind: 'error', message: `${name} can only be used in a channel` } as const)

  switch (cmd) {
    case '/me':
      return rest ? { kind: 'action', text: rest } : { kind: 'error', message: '/me needs an action' }
    case '/join': {
      const chan = rest.split(' ')[0]
      return chan ? { kind: 'join', channel: normalizeChannel(chan) } : { kind: 'error', message: '/join needs a channel' }
    }
    case '/part':
      return needChannel('/part') ?? { kind: 'part', ...(rest ? { reason: rest } : {}) }
    case '/msg':
    case '/query': {
      const idx = rest.indexOf(' ')
      if (idx === -1) return { kind: 'error', message: '/msg needs a nick and a message' }
      return { kind: 'msg', nick: rest.slice(0, idx), text: rest.slice(idx + 1).trim() }
    }
    case '/nick':
      return rest ? { kind: 'nick', nick: rest.split(' ')[0]! } : { kind: 'error', message: '/nick needs a nickname' }
    case '/topic':
      return needChannel('/topic') ?? (rest ? { kind: 'topic', topic: rest } : { kind: 'error', message: '/topic needs text' })
    case '/whois':
      return rest ? { kind: 'whois', nick: rest.split(' ')[0]! } : { kind: 'error', message: '/whois needs a nick' }
    case '/kick': {
      const channelErr = needChannel('/kick')
      if (channelErr) return channelErr
      const idx = rest.indexOf(' ')
      if (!rest) return { kind: 'error', message: '/kick needs a nick' }
      return idx === -1
        ? { kind: 'kick', nick: rest }
        : { kind: 'kick', nick: rest.slice(0, idx), reason: rest.slice(idx + 1).trim() }
    }
    case '/mode': {
      if (!rest) return { kind: 'error', message: '/mode needs flags' }
      const idx = rest.indexOf(' ')
      return idx === -1
        ? { kind: 'mode', modes: rest }
        : { kind: 'mode', modes: rest.slice(0, idx), args: rest.slice(idx + 1).trim() }
    }
    case '/list':
      return rest ? { kind: 'list', filter: rest.split(' ')[0] } : { kind: 'list' }
    default:
      return { kind: 'error', message: `Unknown command: ${cmd}` }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bool/client test src/commands.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/commands.ts packages/client/src/commands.test.ts
git commit -m "feat(client): pure slash-command parser"
```

---

### Task 2: Shared protocol — new client messages + version bump

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Test: `packages/shared/src/protocol-commands.test.ts` (create)

**Interfaces:**
- Produces new `ClientMessage` variants: `chat:send` gains `action?: boolean`; new types `user:nick`, `chan:topic:set`, `chan:kick`, `chan:mode`, `user:whois`, `chan:list`. `PROTOCOL_VERSION === 7`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/protocol-commands.test.ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, PROTOCOL_VERSION } from './protocol.js'

describe('command protocol', () => {
  it('bumped protocol version', () => expect(PROTOCOL_VERSION).toBe(7))
  it('chat:send accepts action flag', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi', action: true }))).toMatchObject({ action: true }))
  it('user:nick', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'user:nick', networkId: 1, nick: 'neo' })).type).toBe('user:nick'))
  it('chan:topic:set', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:topic:set', networkId: 1, channel: '#x', topic: 't' })).type).toBe('chan:topic:set'))
  it('chan:kick', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:kick', networkId: 1, channel: '#x', nick: 'bob' })).type).toBe('chan:kick'))
  it('chan:mode', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:mode', networkId: 1, target: '#x', modes: '+o', args: 'bob' })).type).toBe('chan:mode'))
  it('user:whois', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'user:whois', networkId: 1, nick: 'bob' })).type).toBe('user:whois'))
  it('chan:list', () =>
    expect(parseClientMessage(JSON.stringify({ type: 'chan:list', networkId: 1 })).type).toBe('chan:list'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bool/shared test src/protocol-commands.test.ts`
Expected: FAIL — version is 6, new types rejected.

- [ ] **Step 3: Edit the protocol**

In `packages/shared/src/protocol.ts`:

Change the version constant:
```ts
export const PROTOCOL_VERSION = 7
```

Add `action` to `chatSendSchema` (replace the existing line):
```ts
export const chatSendSchema = z.object({ type: z.literal('chat:send'), networkId: z.number().int(), target: z.string(), text: z.string(), replyTo: z.string().optional(), action: z.boolean().optional() })
```

Add these schemas right after `chatSendSchema`:
```ts
export const userNickSchema = z.object({ type: z.literal('user:nick'), networkId: z.number().int(), nick: z.string() })
export const chanTopicSetSchema = z.object({ type: z.literal('chan:topic:set'), networkId: z.number().int(), channel: z.string(), topic: z.string() })
export const chanKickSchema = z.object({ type: z.literal('chan:kick'), networkId: z.number().int(), channel: z.string(), nick: z.string(), reason: z.string().optional() })
export const chanModeSchema = z.object({ type: z.literal('chan:mode'), networkId: z.number().int(), target: z.string(), modes: z.string(), args: z.string().optional() })
export const userWhoisSchema = z.object({ type: z.literal('user:whois'), networkId: z.number().int(), nick: z.string() })
export const chanListSchema = z.object({ type: z.literal('chan:list'), networkId: z.number().int(), filter: z.string().optional() })
```

Add them to the `clientMessageSchema` discriminated union (append to the array):
```ts
export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema, pingSchema,
  netAddSchema, netRemoveSchema, netConnectSchema, netDisconnectSchema, netListReqSchema,
  chanJoinSchema, chanPartSchema, chatSendSchema, chatSearchSchema, historyRequestSchema,
  readSetSchema, readListReqSchema,
  typingSetSchema, reactAddSchema, reactRemoveSchema,
  userNickSchema, chanTopicSetSchema, chanKickSchema, chanModeSchema, userWhoisSchema, chanListSchema,
])
```

- [ ] **Step 4: Run test to verify it passes, then rebuild shared**

Run: `pnpm --filter @bool/shared test src/protocol-commands.test.ts`
Expected: PASS.
Then: `pnpm --filter @bool/shared build`
Expected: builds clean (regenerates `dist` so client/server pick up the new types).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol-commands.test.ts
git commit -m "feat(shared): protocol v7 — slash-command client messages"
```

---

### Task 3: Numeric-reply formatter (`irc/numerics.ts`)

Pure helper that turns a raw inbound IRC numeric line into a readable status-buffer line (or `null` to skip).

**Files:**
- Create: `packages/server/src/irc/numerics.ts`
- Test: `packages/server/src/irc/numerics.test.ts`

**Interfaces:**
- Produces: `export function formatNumeric(rawLine: string, selfNick: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/irc/numerics.test.ts
import { describe, it, expect } from 'vitest'
import { formatNumeric } from './numerics.js'

describe('formatNumeric', () => {
  it('formats a WHOIS reply, dropping our own nick', () =>
    expect(formatNumeric(':server 311 bool alice ~u host * :Real Name', 'bool')).toBe('alice ~u host * Real Name'))
  it('formats a LIST reply', () =>
    expect(formatNumeric(':server 322 bool #chan 42 :a topic', 'bool')).toBe('#chan 42 a topic'))
  it('returns null for non-numeric commands', () =>
    expect(formatNumeric(':bob!u@h PRIVMSG #x :hi', 'bool')).toBeNull())
  it('suppresses NAMES/TOPIC numerics already handled elsewhere', () => {
    expect(formatNumeric(':server 353 bool = #x :bob alice', 'bool')).toBeNull()
    expect(formatNumeric(':server 366 bool #x :End of NAMES', 'bool')).toBeNull()
    expect(formatNumeric(':server 332 bool #x :the topic', 'bool')).toBeNull()
    expect(formatNumeric(':server 333 bool #x setter 12345', 'bool')).toBeNull()
  })
  it('handles a line with no prefix', () =>
    expect(formatNumeric('421 bool FOO :Unknown command', 'bool')).toBe('FOO Unknown command'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bool/server test src/irc/numerics.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// packages/server/src/irc/numerics.ts
// Numerics already represented as structured events (NAMES / TOPIC); skip to avoid duplication.
const SUPPRESS = new Set(['353', '366', '332', '333'])

/**
 * Format an inbound IRC numeric reply into a readable status-buffer line.
 * Returns null for non-numeric lines and for numerics already handled elsewhere.
 */
export function formatNumeric(rawLine: string, selfNick: string): string | null {
  let line = rawLine.trim()
  if (line.startsWith(':')) {
    const sp = line.indexOf(' ')
    if (sp === -1) return null
    line = line.slice(sp + 1)
  }
  const sp = line.indexOf(' ')
  const command = sp === -1 ? line : line.slice(0, sp)
  if (!/^\d{3}$/.test(command)) return null
  if (SUPPRESS.has(command)) return null

  const rest = sp === -1 ? '' : line.slice(sp + 1)
  let params = rest
  let trailing = ''
  if (rest.startsWith(':')) {
    trailing = rest.slice(1)
    params = ''
  } else {
    const ti = rest.indexOf(' :')
    if (ti !== -1) {
      params = rest.slice(0, ti)
      trailing = rest.slice(ti + 2)
    }
  }
  const paramList = params.split(' ').filter(Boolean)
  if (paramList[0] === selfNick) paramList.shift()
  const text = [...paramList, trailing].filter(Boolean).join(' ').trim()
  return text.length > 0 ? text : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bool/server test src/irc/numerics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/irc/numerics.ts packages/server/src/irc/numerics.test.ts
git commit -m "feat(server): pure IRC numeric-reply formatter"
```

---

### Task 4: Server connection — status buffer + command methods

Wire the `raw` event into the `*` status buffer and add command methods to `IrcConnection`.

**Files:**
- Modify: `packages/server/src/irc/connection.ts`
- Test: `packages/server/src/irc/connection.test.ts` (append cases)

**Interfaces:**
- Consumes: `formatNumeric` (Task 3).
- Produces on `IrcConnection`:
  ```ts
  setNick(nick: string): void
  setTopic(channel: string, topic: string): void
  kick(channel: string, nick: string, reason?: string): void
  setMode(target: string, modes: string, args?: string): void
  whois(nick: string): void
  listChannels(filter?: string): void
  action(target: string, text: string): void
  ```
  and emits `chat:msg` with `target: '*'`, `from: '*'`, `kind: 'notice'` for numeric replies.

- [ ] **Step 1: Write the failing tests (append to `connection.test.ts`)**

```ts
  it('routes numeric replies into the * status buffer', () => {
    const { client, out } = makeConn()
    client.emit('raw', { line: ':server 322 bool #chan 42 :a topic', from_server: true })
    const msg = out.find((m) => m.type === 'chat:msg' && (m as any).target === '*') as any
    expect(msg).toMatchObject({ target: '*', from: '*', kind: 'notice', text: '#chan 42 a topic' })
  })

  it('ignores client-originated raw lines', () => {
    const { client, out } = makeConn()
    client.emit('raw', { line: ':server 322 bool #chan 42 :a topic', from_server: false })
    expect(out.some((m) => m.type === 'chat:msg' && (m as any).target === '*')).toBe(false)
  })

  it('sends command methods through the client', () => {
    const { conn, client } = makeConn()
    conn.setNick('neo')
    conn.setTopic('#x', 'hello world')
    conn.kick('#x', 'bob', 'spam')
    conn.setMode('#x', '+o', 'bob')
    conn.whois('bob')
    conn.listChannels('*rust*')
    conn.action('#x', 'waves')
    expect(client.changeNick).toHaveBeenCalledWith('neo')
    expect(client.raw).toHaveBeenCalledWith('TOPIC #x :hello world')
    expect(client.raw).toHaveBeenCalledWith('KICK #x bob :spam')
    expect(client.raw).toHaveBeenCalledWith('MODE #x +o bob')
    expect(client.raw).toHaveBeenCalledWith('WHOIS bob')
    expect(client.raw).toHaveBeenCalledWith('LIST *rust*')
    expect(client.say).toHaveBeenCalledWith('#x', '\x01ACTION waves\x01')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/server test src/irc/connection.test.ts`
Expected: FAIL — methods/handler missing.

- [ ] **Step 3: Implement**

In `connection.ts`, add the import at the top:
```ts
import { formatNumeric } from './numerics.js'
```

Inside `wire(client)`, after the existing `client.on('userlist', …)` block, add:
```ts
    client.on('raw', (e: any) => {
      if (!e?.from_server || typeof e.line !== 'string') return
      const text = formatNumeric(e.line, client.user.nick)
      if (text) {
        this.sink({ type: 'chat:msg', networkId: nid, target: '*', from: '*', kind: 'notice', text, self: false, time: Date.now() })
      }
    })
```

Add the command methods after the existing `part(channel)` method:
```ts
  setNick(nick: string): void {
    this.client?.changeNick(nick)
  }
  setTopic(channel: string, topic: string): void {
    this.client?.raw(`TOPIC ${channel} :${topic}`)
  }
  kick(channel: string, nick: string, reason?: string): void {
    this.client?.raw(`KICK ${channel} ${nick}${reason ? ` :${reason}` : ''}`)
  }
  setMode(target: string, modes: string, args?: string): void {
    this.client?.raw(`MODE ${target} ${modes}${args ? ` ${args}` : ''}`)
  }
  whois(nick: string): void {
    this.client?.raw(`WHOIS ${nick}`)
  }
  listChannels(filter?: string): void {
    this.client?.raw(`LIST${filter ? ` ${filter}` : ''}`)
  }
  action(target: string, text: string): void {
    this.client?.say(target, `\x01ACTION ${text}\x01`)
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @bool/server test src/irc/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/irc/connection.ts packages/server/src/irc/connection.test.ts
git commit -m "feat(server): status buffer + IRC command methods on connection"
```

---

### Task 5: Server manager + ws routing for new commands

**Files:**
- Modify: `packages/server/src/irc/manager.ts`
- Modify: `packages/server/src/ws.ts`
- Test: `packages/server/src/irc/manager.test.ts` (append) and rely on existing `ws.test.ts` patterns for routing

**Interfaces:**
- Consumes: connection methods (Task 4).
- Produces on `IrcManager`:
  ```ts
  setNick(userId, networkId, nick): boolean
  setTopic(userId, networkId, channel, topic): boolean
  kick(userId, networkId, channel, nick, reason?): boolean
  setMode(userId, networkId, target, modes, args?): boolean
  whois(userId, networkId, nick): boolean
  listChannels(userId, networkId, filter?): boolean
  sendAction(userId, networkId, target, text): boolean
  ```

- [ ] **Step 1: Write the failing test (append to `manager.test.ts`)**

```ts
  it('routes command methods to the active connection', () => {
    // Mirror the existing manager.test.ts setup for a connected network as `mgr`,
    // `userId`, and `networkId`. Then:
    expect(mgr.setNick(userId, networkId, 'neo')).toBe(true)
    expect(mgr.setTopic(userId, networkId, '#x', 't')).toBe(true)
    expect(mgr.whois(userId, networkId, 'bob')).toBe(true)
    expect(mgr.sendAction(userId, networkId, '#x', 'waves')).toBe(true)
    // Unknown network returns false
    expect(mgr.setNick(userId, 9999, 'neo')).toBe(false)
  })
```

> Note: reuse the connected-network setup already present at the top of `manager.test.ts` (same fake-client factory the file uses). If that file has no reusable helper, model the setup on `connection.test.ts`'s `makeConn` but through the manager's public `connectNetwork`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/server test src/irc/manager.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 3: Implement manager methods**

In `manager.ts`, add after the existing `react(...)` method (mirror the `say` guard pattern):
```ts
  setNick(userId: string, networkId: number, nick: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setNick(nick)
    return true
  }
  setTopic(userId: string, networkId: number, channel: string, topic: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setTopic(channel, topic)
    return true
  }
  kick(userId: string, networkId: number, channel: string, nick: string, reason?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.kick(channel, nick, reason)
    return true
  }
  setMode(userId: string, networkId: number, target: string, modes: string, args?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.setMode(target, modes, args)
    return true
  }
  whois(userId: string, networkId: number, nick: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.whois(nick)
    return true
  }
  listChannels(userId: string, networkId: number, filter?: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.listChannels(filter)
    return true
  }
  sendAction(userId: string, networkId: number, target: string, text: string): boolean {
    const c = this.conns.get(keyOf(userId, networkId))
    if (!c || !c.isConnected()) return false
    c.action(target, text)
    return true
  }
```

- [ ] **Step 4: Route in `ws.ts`**

In `ws.ts`, change the `chat:send` case to honor the `action` flag:
```ts
        case 'chat:send': {
          const ok = msg.action
            ? ircManager.sendAction(userId, msg.networkId, msg.target, msg.text)
            : ircManager.say(userId, msg.networkId, msg.target, msg.text, msg.replyTo)
          if (!ok) send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        }
```

Add these cases alongside the other IRC cases (after `chan:part`):
```ts
        case 'user:nick':
          if (!ircManager.setNick(userId, msg.networkId, msg.nick))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:topic:set':
          if (!ircManager.setTopic(userId, msg.networkId, msg.channel, msg.topic))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:kick':
          if (!ircManager.kick(userId, msg.networkId, msg.channel, msg.nick, msg.reason))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:mode':
          if (!ircManager.setMode(userId, msg.networkId, msg.target, msg.modes, msg.args))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'user:whois':
          if (!ircManager.whois(userId, msg.networkId, msg.nick))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
        case 'chan:list':
          if (!ircManager.listChannels(userId, msg.networkId, msg.filter))
            send({ type: 'net:error', networkId: msg.networkId, message: 'not connected' })
          break
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @bool/server test src/irc/manager.test.ts`
Expected: PASS.
Run: `pnpm --filter @bool/server typecheck`
Expected: no errors (the `switch` now handles the new message types exhaustively).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/irc/manager.ts packages/server/src/ws.ts packages/server/src/irc/manager.test.ts
git commit -m "feat(server): route slash-command messages through the manager"
```

---

### Task 6: Client store — new actions + `'status'` target kind

**Files:**
- Modify: `packages/client/src/store/types.ts`
- Modify: `packages/client/src/store/chat-store.ts`
- Test: `packages/client/src/store/chat-store.test.ts` (append)

**Interfaces:**
- Produces on the store (added to `ChatActions`):
  ```ts
  sendAction(text: string): void
  setNick(networkId: number, nick: string): void
  setTopic(networkId: number, channel: string, topic: string): void
  whois(networkId: number, nick: string): void
  kick(networkId: number, channel: string, nick: string, reason?: string): void
  setMode(networkId: number, target: string, modes: string, args?: string): void
  listChannels(networkId: number, filter?: string): void
  messageUser(networkId: number, nick: string, text: string): void
  ```
- `TargetKind` gains `'status'`; a `chat:msg` to target `'*'` is classified `'status'`.

- [ ] **Step 1: Write the failing tests (append to `chat-store.test.ts`)**

```ts
  it('classifies the * target as a status buffer', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'chat:msg', networkId: 1, target: '*', from: '*', kind: 'notice', text: 'MOTD line', self: false, time: 1 })
    const key = targetKey(1, '*')
    expect(useChat.getState().targets[key]!.kind).toBe('status')
  })

  it('sendAction posts chat:send with action:true for the selected target', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().select(targetKey(2, '#dev'))
    useChat.getState().sendAction('waves')
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat:send', networkId: 2, target: '#dev', text: 'waves', action: true }))
  })

  it('command actions post their messages', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().setNick(1, 'neo')
    useChat.getState().setTopic(1, '#x', 't')
    useChat.getState().whois(1, 'bob')
    useChat.getState().kick(1, '#x', 'bob', 'spam')
    useChat.getState().setMode(1, '#x', '+o', 'bob')
    useChat.getState().listChannels(1, '*rust*')
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'user:nick', networkId: 1, nick: 'neo' }))
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:topic:set', networkId: 1, channel: '#x', topic: 't' }))
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'user:whois', networkId: 1, nick: 'bob' }))
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:kick', networkId: 1, channel: '#x', nick: 'bob', reason: 'spam' }))
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:mode', networkId: 1, target: '#x', modes: '+o', args: 'bob' }))
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:list', networkId: 1, filter: '*rust*' }))
  })

  it('messageUser opens/selects a PM and sends', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().messageUser(1, 'bob', 'hey')
    const key = targetKey(1, 'bob')
    expect(useChat.getState().targets[key]!.kind).toBe('pm')
    expect(useChat.getState().selected).toBe(key)
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat:send', networkId: 1, target: 'bob', text: 'hey' }))
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/store/chat-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `types.ts`**

Change:
```ts
export type TargetKind = 'channel' | 'pm' | 'status'
```

Add to the `ChatActions` interface (after `part(...)`):
```ts
  sendAction(text: string): void
  setNick(networkId: number, nick: string): void
  setTopic(networkId: number, channel: string, topic: string): void
  whois(networkId: number, nick: string): void
  kick(networkId: number, channel: string, nick: string, reason?: string): void
  setMode(networkId: number, target: string, modes: string, args?: string): void
  listChannels(networkId: number, filter?: string): void
  /** Create/select a PM with `nick` on `networkId` and send `text`. */
  messageUser(networkId: number, nick: string, text: string): void
```

- [ ] **Step 4: Update `chat-store.ts`**

Change `inferKind` to recognize the status buffer:
```ts
function inferKind(target: string): TargetKind {
  if (target === '*') return 'status'
  return target.startsWith('#') || target.startsWith('&') ? 'channel' : 'pm'
}
```

Add these actions inside `createActions` (after the existing `part(...)` action):
```ts
    sendAction(text: string) {
      const { selected } = get()
      if (!selected) return
      const colonIdx = selected.indexOf(':')
      if (colonIdx === -1) return
      const networkId = Number(selected.slice(0, colonIdx))
      const target = selected.slice(colonIdx + 1)
      _send?.({ type: 'chat:send', networkId, target, text, action: true })
    },

    setNick(networkId: number, nick: string) {
      _send?.({ type: 'user:nick', networkId, nick })
    },

    setTopic(networkId: number, channel: string, topic: string) {
      _send?.({ type: 'chan:topic:set', networkId, channel, topic })
    },

    whois(networkId: number, nick: string) {
      _send?.({ type: 'user:whois', networkId, nick })
    },

    kick(networkId: number, channel: string, nick: string, reason?: string) {
      _send?.({ type: 'chan:kick', networkId, channel, nick, ...(reason ? { reason } : {}) })
    },

    setMode(networkId: number, target: string, modes: string, args?: string) {
      _send?.({ type: 'chan:mode', networkId, target, modes, ...(args ? { args } : {}) })
    },

    listChannels(networkId: number, filter?: string) {
      _send?.({ type: 'chan:list', networkId, ...(filter ? { filter } : {}) })
    },

    messageUser(networkId: number, nick: string, text: string) {
      const key = targetKey(networkId, nick)
      set((state) => ({
        selected: key,
        targets: {
          ...state.targets,
          [key]: state.targets[key] ?? { networkId, target: nick, kind: 'pm', unread: 0 },
        },
      }))
      _send?.({ type: 'chat:send', networkId, target: nick, text })
    },
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @bool/client test src/store/chat-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/store/types.ts packages/client/src/store/chat-store.ts packages/client/src/store/chat-store.test.ts
git commit -m "feat(client): store actions for slash commands + status target kind"
```

---

### Task 7: Composer — dispatch parsed commands + inline errors

**Files:**
- Modify: `packages/client/src/components/Composer.tsx`
- Test: `packages/client/src/components/Composer.test.tsx` (append)

**Interfaces:**
- Consumes: `parseCommand` (Task 1), store command actions (Task 6).

- [ ] **Step 1: Write the failing tests (append to `Composer.test.tsx`)**

Match the existing render/setup helpers already used in `Composer.test.tsx` (it renders `<Composer onSend={...} />` with a selected target in the store). Add:
```ts
  it('/join dispatches store.join instead of sending literal text', async () => {
    // Arrange: store has a selected channel target on network 1 (reuse file's setup).
    const onSend = vi.fn()
    renderComposer(onSend) // existing helper in this file
    const box = screen.getByRole('textbox', { name: /message input/i })
    await userEvent.type(box, '/join #newchan{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    // join() sends a chan:join over the socket — assert via the store spy the file already sets up,
    // or assert the composer cleared the input:
    expect((box as HTMLTextAreaElement).value).toBe('')
  })

  it('shows an inline error for a bad command and keeps the text', async () => {
    renderComposer(vi.fn())
    const box = screen.getByRole('textbox', { name: /message input/i })
    await userEvent.type(box, '/frobnicate{Enter}')
    expect(screen.getByText(/unknown command/i)).toBeInTheDocument()
    expect((box as HTMLTextAreaElement).value).toBe('/frobnicate')
  })
```

> If `Composer.test.tsx` has no `renderComposer`/store-setup helper, model it on the existing tests in that file (they already select a target and render the component).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/components/Composer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement dispatch in `Composer.tsx`**

Add imports:
```ts
import { parseCommand } from '../commands.js'
```

Add store selectors and error state near the other hooks (after the `messages` selector):
```ts
  const targets = useChat((s) => s.targets)
  const [cmdError, setCmdError] = useState<string | null>(null)
```

Add a dispatch helper inside the component (above `handleKeyDown`):
```ts
  function dispatchInput(text: string): boolean {
    // returns true if the input was consumed (clear the box), false to keep it
    const isChannel = selected != null && targets[selected]?.kind === 'channel'
    const parsed = parseCommand(text, { activeTarget: selected, isChannel })
    const store = useChat.getState()
    const nid = selected != null ? Number(selected.slice(0, selected.indexOf(':'))) : null
    const curTarget = selected != null ? selected.slice(selected.indexOf(':') + 1) : null

    if (parsed.kind !== 'text' && nid == null) {
      setCmdError('Select a channel or DM first')
      return false
    }
    switch (parsed.kind) {
      case 'text': onSend(parsed.text); return true
      case 'action': store.sendAction(parsed.text); return true
      case 'join': store.join(nid!, parsed.channel); return true
      case 'part': store.part(nid!, curTarget!); return true
      case 'msg': store.messageUser(nid!, parsed.nick, parsed.text); return true
      case 'nick': store.setNick(nid!, parsed.nick); return true
      case 'topic': store.setTopic(nid!, curTarget!, parsed.topic); return true
      case 'whois': store.whois(nid!, parsed.nick); return true
      case 'kick': store.kick(nid!, curTarget!, parsed.nick, parsed.reason); return true
      case 'mode': store.setMode(nid!, curTarget!, parsed.modes, parsed.args); return true
      case 'list': store.listChannels(nid!, parsed.filter); return true
      case 'error': setCmdError(parsed.message); return false
    }
  }
```

Replace the non-reply send branch in `handleKeyDown` (the `else { onSend(trimmed) }` block) with:
```ts
      if (replyingTo) {
        sendReply(trimmed, replyingTo)
        setReplyTarget(null)
      } else {
        const consumed = dispatchInput(trimmed)
        if (!consumed) return // keep the text + show the error; don't clear or reset typing
      }
      setCmdError(null)
```

Render the error above the input (right before the `<div className="input-wrap">`):
```tsx
      {cmdError && (
        <div className="composer-error" role="alert" style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11, padding: '2px 8px' }}>
          {cmdError}
        </div>
      )}
```

Clear the error when the user edits (in the `onChange` handler, after `setValue(...)`):
```ts
            if (cmdError) setCmdError(null)
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @bool/client test src/components/Composer.test.tsx`
Expected: PASS.
Run: `pnpm --filter @bool/client typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/Composer.tsx packages/client/src/components/Composer.test.tsx
git commit -m "feat(client): dispatch slash commands from the composer"
```

---

### Task 8: Sidebar — channel-join affordance + Server (status) group

**Files:**
- Modify: `packages/client/src/components/Sidebar.tsx`
- Test: `packages/client/src/components/Sidebar.test.tsx` (append)

**Interfaces:**
- Consumes: `normalizeChannel` (Task 1), `store.join` (existing), `'status'` kind (Task 6).

- [ ] **Step 1: Write the failing tests (append to `Sidebar.test.tsx`)**

```ts
  it('joins a channel from the sidebar + affordance', async () => {
    // Reuse the file's store setup that renders a network with a selected channel on network 1.
    renderSidebar() // existing helper/pattern in the file
    await userEvent.click(screen.getByRole('button', { name: /join a channel/i }))
    const input = screen.getByRole('textbox', { name: /channel to join/i })
    await userEvent.type(input, 'newchan{Enter}')
    // join() normalizes to #newchan and sends chan:join — assert via the socket spy the file uses.
    expect(sockSend).toHaveBeenCalledWith(JSON.stringify({ type: 'chan:join', networkId: 1, channel: '#newchan' }))
  })

  it('renders a Server group for the * status target', () => {
    // Setup: emit a chat:msg to target '*' on network 1 before render (or via store).
    renderSidebar()
    expect(screen.getByText(/server/i)).toBeInTheDocument()
  })
```

> Model `renderSidebar`/`sockSend` on the existing setup in `Sidebar.test.tsx`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/components/Sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `Sidebar.tsx`, add imports + state:
```ts
import { useState } from 'react'
import { normalizeChannel } from '../commands.js'
```

Extend `NetworkGroup` to also render status targets and a join affordance. Add a `status` filter alongside `channels`/`dms`:
```ts
  const statusTargets = targets.filter((t) => t.kind === 'status')
```

Add local join-input state inside `NetworkGroup` (top of the component body):
```ts
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinValue, setJoinValue] = useState('')
  const join = useChat((s) => s.join)

  function submitJoin() {
    const v = joinValue.trim()
    if (v) join(network.id, normalizeChannel(v))
    setJoinValue('')
    setJoinOpen(false)
  }
```

In the "Channels" group header, add a `+` button after the count:
```tsx
            <div className="grp-h">
              Channels
              <span className="count">{channels.length}</span>
              <button
                type="button"
                className="grp-add"
                aria-label="Join a channel"
                title="Join a channel"
                onClick={() => setJoinOpen((v) => !v)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer' }}
              >
                +
              </button>
            </div>
            {joinOpen && (
              <input
                className="join-input"
                aria-label="Channel to join"
                placeholder="#channel — Enter to join"
                autoFocus
                value={joinValue}
                onChange={(e) => setJoinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitJoin() }
                  if (e.key === 'Escape') { setJoinValue(''); setJoinOpen(false) }
                }}
              />
            )}
```

> The "Channels" group currently only renders when `channels.length > 0`. Change that guard so the header (and the `+`) always shows for the active network — replace `{channels.length > 0 && (` around the Channels group with `{(` … keep the channel `.map` inside guarded by `channels.length > 0`.

Add a Server group after the DMs group:
```tsx
        {statusTargets.length > 0 && (
          <div className="grp">
            <div className="grp-h">Server</div>
            {statusTargets.map((t) => {
              const key = targetKey(t.networkId, t.target)
              return (
                <button
                  key={key}
                  type="button"
                  className={`chan${selected === key ? ' active' : ''}`}
                  onClick={() => onSelect(key)}
                  title={network.name}
                >
                  <span className="hash">*</span>
                  <span className="name">{network.name}</span>
                </button>
              )
            })}
          </div>
        )}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @bool/client test src/components/Sidebar.test.tsx`
Expected: PASS.
Run: `pnpm --filter @bool/client typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/Sidebar.tsx packages/client/src/components/Sidebar.test.tsx
git commit -m "feat(client): sidebar channel-join affordance + server status group"
```

---

### Task 9: Command palette — "Join channel…" + "Sign out"

**Files:**
- Modify: `packages/client/src/components/CommandPalette.tsx`
- Test: `packages/client/src/components/CommandPalette.test.tsx` (append)

**Interfaces:**
- Consumes: `store.join`, `normalizeChannel` (Task 1), `signOut` from `auth-client.js`.

- [ ] **Step 1: Write the failing tests (append to `CommandPalette.test.tsx`)**

```ts
  it('shows a Join channel action', () => {
    renderPalette({ open: true }) // existing helper/pattern
    expect(screen.getByText(/join channel/i)).toBeInTheDocument()
  })

  it('shows a Sign out action', () => {
    renderPalette({ open: true })
    expect(screen.getByText(/sign out/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/components/CommandPalette.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add import:
```ts
import { signOut } from '../auth-client.js'
import { normalizeChannel } from '../commands.js'
```

In the "Actions & Commands" `CommandGroup`, add a Join item (use the active network derived from `Object.values(networks)[0]` or the selected target). Add near the top of that group:
```tsx
              {Object.values(networks).length > 0 && (
                <CommandItem
                  value="join-channel"
                  onSelect={() => {
                    const net = Object.values(networks)[0]
                    if (!net) return
                    const chan = window.prompt('Join channel (e.g. #general):')?.trim()
                    if (chan) useChat.getState().join(net.id, normalizeChannel(chan))
                    onClose()
                  }}
                  className="cp-item"
                  keywords={['join', 'channel', 'add']}
                >
                  <span className="cp-icon cp-icon-act" aria-hidden><IconConnect /></span>
                  <span className="cp-main">
                    <span className="cp-name">Join channel…</span>
                    <span className="cp-sub">Join a channel on the active network</span>
                  </span>
                </CommandItem>
              )}
```

Add a Sign out item at the end of the same group:
```tsx
              <CommandItem
                value="sign-out"
                onSelect={() => { void signOut(); onClose() }}
                className="cp-item"
                keywords={['sign out', 'logout', 'log out', 'account']}
              >
                <span className="cp-icon cp-icon-act" aria-hidden><IconConnect /></span>
                <span className="cp-main">
                  <span className="cp-name">Sign out</span>
                  <span className="cp-sub">End your session</span>
                </span>
              </CommandItem>
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @bool/client test src/components/CommandPalette.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/CommandPalette.tsx packages/client/src/components/CommandPalette.test.tsx
git commit -m "feat(client): join-channel + sign-out in the command palette"
```

---

### Task 10: Appearance menu — Sign out row

**Files:**
- Modify: `packages/client/src/components/AppearanceMenu.tsx`
- Test: `packages/client/src/components/AppearanceMenu.test.tsx` (append)

**Interfaces:**
- Consumes: `signOut` from `auth-client.js`.

- [ ] **Step 1: Write the failing test (append)**

```ts
  it('renders a sign-out button that calls signOut', async () => {
    const spy = vi.spyOn(authClient, 'signOut').mockResolvedValue({} as any)
    render(<AppearanceMenu />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(spy).toHaveBeenCalled()
  })
```

> Import the auth client the same way the file/test already does. If `signOut` is a named export, spy via `import * as authClient from '../auth-client.js'` and `vi.spyOn(authClient, 'signOut')`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/components/AppearanceMenu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add import:
```ts
import { signOut } from '../auth-client.js'
```

Add a sign-out row at the bottom of the menu's returned JSX (before the closing wrapper element):
```tsx
      <button
        type="button"
        className="appearance-signout"
        onClick={() => void signOut()}
        style={{ marginTop: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--ink-1)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, padding: '6px 8px' }}
      >
        Sign out
      </button>
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @bool/client test src/components/AppearanceMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/AppearanceMenu.tsx packages/client/src/components/AppearanceMenu.test.tsx
git commit -m "feat(client): sign-out row in the appearance menu"
```

---

### Task 11: Render the connection indicator (ConnDot)

**Files:**
- Create: `packages/client/src/components/ConnDot.tsx`
- Modify: `packages/client/src/components/AppShell.tsx` (remove the unused local `ConnDot`)
- Modify: `packages/client/src/components/MainPane.tsx` (render it in the topbar)
- Test: `packages/client/src/components/MainPane.test.tsx` (create or append)

**Interfaces:**
- Produces: `export function ConnDot(): JSX.Element` reading `useChat(s => s.connection)`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/client/src/components/MainPane.test.tsx  (append if exists)
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MainPane } from './MainPane.js'
import { useChat } from '../store/chat-store.js'

beforeEach(() => useChat.setState(useChat.getInitialState?.() ?? {}, true) as any)

describe('MainPane connection indicator', () => {
  it('renders the ConnDot with a connection aria-label', () => {
    render(<MainPane />)
    expect(screen.getByLabelText(/connection:/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @bool/client test src/components/MainPane.test.tsx`
Expected: FAIL — no element with that label.

- [ ] **Step 3: Extract and render**

Create `packages/client/src/components/ConnDot.tsx`:
```tsx
import { useChat } from '../store/chat-store.js'

/** Connection status dot — driven by useChat().connection */
export function ConnDot() {
  const connection = useChat((s) => s.connection)
  return (
    <span
      className={`conn-dot${connection === 'open' ? ' open' : connection === 'connecting' ? ' connecting' : ''}`}
      title={connection}
      aria-label={`Connection: ${connection}`}
    />
  )
}
```

In `AppShell.tsx`, delete the local `ConnDot` function (lines defining `/** Connection status dot … */ function ConnDot() { … }`) — it is unused there.

In `MainPane.tsx`, add the import:
```ts
import { ConnDot } from './ConnDot.js'
```
and render it in the topbar, immediately before the appearance `<button ref={appearanceBtnRef} …>`:
```tsx
        <ConnDot />
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @bool/client test src/components/MainPane.test.tsx`
Expected: PASS.
Run: `pnpm --filter @bool/client typecheck`
Expected: no errors (AppShell no longer references the removed `ConnDot`).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ConnDot.tsx packages/client/src/components/AppShell.tsx packages/client/src/components/MainPane.tsx packages/client/src/components/MainPane.test.tsx
git commit -m "feat(client): render connection indicator in the topbar"
```

---

### Task 12: E2E — flip ConnDot fixme + join / sign-out specs

**Files:**
- Modify: `packages/client/e2e/app-shell.spec.ts` (un-fixme the ConnDot test)
- Create: `packages/client/e2e/commands.spec.ts`

**Interfaces:**
- Consumes: the running app (harness in `playwright.config.ts`).

- [ ] **Step 1: Un-fixme the ConnDot test**

In `app-shell.spec.ts`, find the `test.fixme(` for the connection indicator and change it to `test(`. Adjust the assertion to locate the dot by its label:
```ts
await expect(page.getByLabel(/connection:/i)).toBeVisible()
```

- [ ] **Step 2: Run it to confirm it now passes**

Run: `pnpm --filter @bool/client test:e2e app-shell`
Expected: the previously-fixme connection-indicator test PASSES.

- [ ] **Step 3: Add a commands/join/sign-out spec**

```ts
// packages/client/e2e/commands.spec.ts
import { test, expect } from '@playwright/test'
// Reuse the login/register + add-network helpers the other specs use
// (import from the shared helper module the suite already has, e.g. './helpers').

test('join a channel via the sidebar + affordance', async ({ page }) => {
  // register/login + add a network (reuse helpers), then:
  await page.getByRole('button', { name: /join a channel/i }).click()
  const input = page.getByRole('textbox', { name: /channel to join/i })
  await input.fill('#e2e-test')
  await input.press('Enter')
  // The channel row appears in the sidebar (join is optimistic on chan:join echo;
  // against the test IRC server it should render once joined).
  await expect(page.getByRole('button', { name: /e2e-test/i })).toBeVisible({ timeout: 15000 })
})

test('sign out returns to the login screen', async ({ page }) => {
  // register/login (reuse helper), then open the command palette and sign out:
  await page.keyboard.press('Meta+k')
  await page.getByText(/sign out/i).click()
  await expect(page.getByRole('button', { name: /sign in|register|log in/i })).toBeVisible({ timeout: 15000 })
})
```

> Inspect the existing specs (e.g. `auth.spec.ts`, `network-settings.spec.ts`) for the exact login/add-network helper names and reuse them — do not duplicate the flows inline.

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm --filter @bool/client test:e2e`
Expected: the new specs PASS and no previously-green test regresses. (Stop any local `pnpm dev` first — the harness needs its own ports.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/e2e/app-shell.spec.ts packages/client/e2e/commands.spec.ts
git commit -m "test(e2e): connection indicator, channel join, sign out"
```

---

### Task 13: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Rebuild shared + typecheck everything**

Run: `pnpm --filter @bool/shared build && pnpm typecheck`
Expected: no type errors across packages.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test:all`
Expected: all unit suites pass (client, server, shared).

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm --filter @bool/client test:e2e`
Expected: green (no remaining `test.fixme` for ConnDot).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Start dev, connect to a real network, and verify: `/join #libera` joins; `/me`, `/nick`, `/topic` work; `/whois <nick>` and `/list` output land in the network's Server (`*`) buffer; the topbar dot reflects connection state; sign-out returns to login.

- [ ] **Step 5: Commit any doc updates**

If you update `docs/audit/E2E-AUDIT.md` to reflect the fixed findings, commit it:
```bash
git add docs/audit/E2E-AUDIT.md
git commit -m "docs: mark audit findings #4b/#4c/#5/#6 as addressed"
```

---

## Notes for the implementer

- **Order matters:** Tasks 1–6 build the data/protocol spine; 7–11 are UI; 12–13 verify. Later tasks consume the exact signatures declared in the **Interfaces** blocks above.
- **Shared rebuild:** any time you touch `packages/shared`, run `pnpm --filter @bool/shared build` before typechecking dependents.
- **Test-helper reuse:** several UI tests say "reuse the file's existing setup." Read the top of each `*.test.tsx` before writing — the suites already have store/socket setup patterns; mirror them rather than inventing new ones.
- **`/list` volume:** on large networks LIST returns thousands of lines into the `*` buffer (capped by the store's 500-message window). This is acceptable for this milestone; a paged list UI is explicitly out of scope.
