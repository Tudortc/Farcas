# Design: Wire up the missing chat features

**Date:** 2026-07-12
**Status:** Approved (brainstorming)
**Source:** `docs/audit/E2E-AUDIT.md` findings #4b, #4c, #5, #6

## Goal

Make the connected client actually usable for chatting. Today a user who
connects to a network has no in-app way to join a channel, the composer's
slash commands are cosmetic (sent as literal text), there is no sign-out
control, and the connection-status indicator is dead code. This spec closes
those four gaps.

## Scope

**In scope**

- Full slash-command wiring (`/join /part /msg /me /nick /topic /whois /kick
  /mode /list`), including the shared-protocol and server IRC changes the
  response-producing commands require.
- A channel-join UI (sidebar affordance + command-palette action + `/join`).
- A sign-out control (command palette + appearance popup).
- Rendering the existing `ConnDot` connection indicator.

**Out of scope**

- Structured whois/list UI. Responses surface as text in a per-network status
  buffer instead.
- `/list` result paging / filtering UI beyond passing an optional filter.
- Non-feature audit items: #1 (auth trusted-origins), #3 (error UX), #7–#12
  (auth-screen styling, notifications-toggle CSS, favicon, fonts, onboarding,
  dev config).

## Current state (verified)

- `store/chat-store.ts` already has `join`, `part`, `send`, `connectNetwork`
  actions. The gaps are UI wiring, not missing store plumbing — **except**
  slash commands.
- The client protocol (`packages/shared/src/protocol.ts`, `PROTOCOL_VERSION 6`)
  supports `chan:join`, `chan:part`, `chat:send`, but has **no** message for
  `/me` (ACTION), `/nick`, `/topic`, `/mode`, `/whois`, `/kick`, or `/list`.
- `Composer.tsx` renders slash-command autocomplete but `onSend` calls
  `store.send()` which sends `chat:send` with the literal text.
- `signOut` is exported from `auth-client.ts` but wired to no UI control.
- `ConnDot` is defined in `AppShell.tsx` (with `.conn-dot` CSS and an
  `aria-label`) but never rendered.
- The server (`irc/connection.ts`) routes only `privmsg`/`notice`/`action`
  events into `chat:msg`; IRC numeric replies (whois/list/mode) are dropped.
- `irc-framework` exposes `raw(...)`, `changeNick`, `join`, `part`, `say`,
  `notice`, `tagmsg`, `quit` (see `types/irc-framework.d.ts`).

---

## A. Slash commands (full set)

### A1. Pure parser — `packages/client/src/commands.ts`

Export `parseCommand(input: string, ctx: { activeTarget: string | null; isChannel: boolean }): ParsedCommand`.

`ParsedCommand` is a discriminated union on `kind`:

| kind     | fields              | trigger / notes |
|----------|---------------------|-----------------|
| `text`   | `text`              | no leading `/`, or `//…` escape → literal (leading `/` stripped once) |
| `action` | `text`              | `/me <action>` |
| `join`   | `channel`           | `/join <channel>` — normalize `foo` → `#foo` |
| `part`   | `reason?`           | `/part [reason]` — targets the active channel |
| `msg`    | `nick`, `text`      | `/msg <nick> <text>` (alias `/query`) |
| `nick`   | `nick`              | `/nick <newnick>` |
| `topic`  | `topic`             | `/topic <text>` — targets active channel |
| `whois`  | `nick`              | `/whois <nick>` |
| `kick`   | `nick`, `reason?`   | `/kick <nick> [reason]` — active channel |
| `mode`   | `modes`, `args?`    | `/mode <flags> [args]` — active channel/target |
| `list`   | `filter?`           | `/list [filter]` |
| `error`  | `message`           | unknown command or missing required args |

- Pure: no React, no store, no network. Fully unit-tested (TDD).
- `error` results are shown inline in the composer (reuse the autocomplete
  panel area) and **not** sent.
- Commands needing a channel context (`/part`, `/topic`, `/kick`, `/mode`
  without explicit target) return `error` when `ctx.isChannel` is false.

### A2. Protocol additions — `packages/shared/src/protocol.ts`

Explicit semantic messages (not a generic raw passthrough — server stays in
control, validation preserved, matches existing one-schema-per-action style):

- Extend `chatSendSchema` with `action: z.boolean().optional()` (for `/me`).
- New client→server schemas, added to `clientMessageSchema`:
  - `userNickSchema` — `{ type: 'user:nick', networkId, nick }`
  - `chanTopicSetSchema` — `{ type: 'chan:topic:set', networkId, channel, topic }`
    (distinct from the existing server→client `chan:topic` event)
  - `chanKickSchema` — `{ type: 'chan:kick', networkId, channel, nick, reason? }`
  - `chanModeSchema` — `{ type: 'chan:mode', networkId, target, modes, args? }`
  - `userWhoisSchema` — `{ type: 'user:whois', networkId, nick }`
  - `chanListSchema` — `{ type: 'chan:list', networkId, filter? }`
- Bump `PROTOCOL_VERSION` 6 → 7.
- Add protocol round-trip tests for each new schema.

### A3. Server handling — `irc/connection.ts`, `irc/manager.ts`, `ws.ts`

- Add methods to the `IrcConnection`/manager surface for each command, mapping
  to the library:
  - `user:nick` → `client.changeNick(nick)`
  - `chan:topic:set` → `client.raw('TOPIC', channel, ':' + topic)`
  - `chan:kick` → `client.raw('KICK', channel, nick, reason ? ':' + reason : undefined)`
  - `chan:mode` → `client.raw('MODE', target, modes, ...args)`
  - `user:whois` → `client.raw('WHOIS', nick)`
  - `chan:list` → `client.raw('LIST', filter?)`
  - `/me` (chat:send with `action: true`) → CTCP ACTION via
    `say(target, '\x01ACTION ' + text + '\x01')` (or `client.action` if added
    to the stub).
- `ws.ts` routes each new `ClientMessage` type to the matching manager method,
  following the existing `chat:send`/`react:*` handler pattern.
- Update `types/irc-framework.d.ts` if a method (e.g. `action`) is used that is
  not yet declared.

### A4. Status buffer (numeric-reply capture)

- In `connection.ts`, subscribe to the library `raw` event (server-originated
  lines). Filter to numeric replies (3-digit commands) that are **not** already
  handled elsewhere, plus unhandled server notices. Format each into a readable
  text line and emit as `chat:msg` with `target: '*'`, `from: '*'`,
  `kind: 'notice'`.
- Client store: add `TargetKind = 'channel' | 'pm' | 'status'` (`store/types.ts`).
  `inferKind` (or the `chat:msg` reducer) classifies `target === '*'` as
  `'status'`.
- Sidebar renders `'status'` targets under a "Server" group; the row label and
  the topbar show the **network name** rather than `#*` / `*`.
- One general mechanism serves every response-producing command
  (`/whois`, `/list`, `/mode` query, error numerics).

---

## B. Channel-join UI (#4b)

All three entry points funnel into the existing `store.join(networkId, channel)`:

- **Sidebar:** a `+` button in the "Channels" group header (mirrors the rail's
  "+ add network" affordance). Clicking reveals an inline text input; Enter
  joins on the active network, normalizing `foo` → `#foo`; Escape cancels.
- **Command palette:** a "Join channel…" item in the Actions group (prompts for
  a channel, then joins on the active network).
- **Slash:** `/join` from part A.

## C. Sign out (#6)

Wire the already-exported `signOut`:

- **Command palette:** "Sign out" item in the Actions group.
- **Appearance popup:** a "Sign out" row at the bottom of `AppearanceMenu`.
- On success `signOut` clears the Better Auth session, which should cause
  `AuthGate` to re-render to the login screen. Verify `AuthGate` reacts to
  `useSession` invalidation; if it does not, fall back to `window.location`
  reload after sign-out.

## D. Connection indicator (#5)

- Extract `ConnDot` from `AppShell.tsx` into its own small component
  (`components/ConnDot.tsx` or exported from a shared spot).
- Render it in the **MainPane topbar**, left of the appearance button.
- Keeps the existing `.conn-dot` CSS and `aria-label="Connection: <state>"`.

---

## Testing

- **Parser** (`commands.ts`): unit tests covering every `kind`, the `//`
  escape, whitespace/edge cases, and `error` paths (missing args, channel-only
  commands off-channel). TDD.
- **Store** (`chat-store.test.ts`): new action dispatches (nick/topic/whois/
  kick/mode/list/action) send the right `ClientMessage`; status-buffer reducer
  classifies `*` as `'status'`.
- **Shared** protocol tests: round-trip parse for each new schema; version bump.
- **Server**: unit tests for each new `ws.ts` handler → manager/connection call;
  numeric-reply → `chat:msg('*')` mapping.
- **E2E** (`packages/client/e2e/`): flip the `ConnDot` `test.fixme` green; add
  specs for the sidebar join flow, `/join`, and sign-out.

## Implementation order

1. Parser (`commands.ts`) + tests.
2. Shared protocol schemas + version bump + tests.
3. Server handlers + status-buffer capture + tests.
4. Client store actions + `'status'` kind + tests.
5. Composer wiring (parser → dispatch) + inline error display.
6. Channel-join UI (sidebar + palette).
7. Sign out (palette + appearance).
8. ConnDot render.
9. E2E updates.
