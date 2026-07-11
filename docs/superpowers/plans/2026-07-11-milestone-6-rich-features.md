# bool — Milestone 6: Rich Features (typing / reactions / replies + add-network) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IRCv3 "modern chat" affordances — typing indicators, emoji reactions, and threaded replies — as progressive enhancements that degrade cleanly where a network doesn't support them, and ship the missing **add-network UI** so a user can actually configure and connect their first network end-to-end.

**Architecture:** These features ride IRCv3 client-only tags on the existing IRC connection. The server's `IrcConnection` sends `TAGMSG`/`PRIVMSG` with `+typing`, `+draft/react`, `+draft/reply` tags **only when the network advertises `message-tags`**, and maps the matching inbound events to new protocol messages; everything is fanned through the existing Hub and (for replies) persisted via the message store's `msgid` anchor. The client store reduces the new messages into ephemeral typing state and per-message reaction/reply state; the UI renders typing lines, reaction pills + an emoji picker, and reply affordances with quoted context. A new settings surface lets the user add/remove networks (`net:add`/`net:remove`) and connect them. Media (uploads, link previews) is explicitly out of scope — a later milestone.

**Tech Stack (added):** `emoji-mart` (`@emoji-mart/react` + `@emoji-mart/data`) for the reaction picker. No new server deps.

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM. Node `>=20`.
- **Protocol source of truth is `@bool/shared`** — new typing/reaction/reply messages defined there (types + zod), `PROTOCOL_VERSION` bumped to `5`.
- **Progressive enhancement / graceful degradation:** every rich feature checks `client.network.cap.isEnabled('message-tags')` (and the specific draft cap where relevant) before emitting a tag. If unsupported: typing is simply not sent; a reaction falls back to nothing sent (UI shows it locally only if we choose, but default = no-op); a reply falls back to a plain-text quote prefix in the message body. The UI must never break when a peer/network lacks a cap.
- **Per-user isolation** stays intact — all new WS handlers use `session.user.id`; reactions/typing fan only to the user's own sockets via the Hub.
- **Reactions/typing are live-only** in this milestone (not persisted); replies persist naturally because they are normal messages carrying a `replyTo` msgid. (Reaction persistence is a later concern — note it, don't silently drop.)
- Fold in two cheap Milestone-5 `TODO(m6)` items: a shared **focus-trap + focus-restore** for the palette/search/settings dialogs, and making the sidebar network-rail rows native `<button>`s.

---

### Task 1: Protocol v5 — typing / reaction / reply messages

**Files:** Modify `packages/shared/src/protocol.ts`; Test `packages/shared/src/protocol-rich.test.ts`; update the `PROTOCOL_VERSION` assertions in the other protocol tests to 5.

**Interfaces (produces):**
- Client→server: `{ type:'typing:set', networkId, target, state:'active'|'done' }`; `{ type:'react:add', networkId, target, msgid, emoji }`; `{ type:'react:remove', networkId, target, msgid, emoji }`. Extend `chatSendSchema` with optional `replyTo?: string`.
- Server→client: `{ type:'typing:update', networkId, target, nick, state:'active'|'done' }`; `{ type:'react:update', networkId, target, msgid, emoji, nick, action:'add'|'remove' }`. Extend `chatMsgSchema` and `storedMsgSchema` with optional `replyTo?: string`.
- `PROTOCOL_VERSION = 5`.

- [ ] **Step 1: failing test** `protocol-rich.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseClientMessage, parseServerMessage, PROTOCOL_VERSION } from './index.js'

describe('rich protocol v5', () => {
  it('is version 5', () => expect(PROTOCOL_VERSION).toBe(5))
  it('parses typing/react client messages', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'typing:set', networkId: 1, target: '#x', state: 'active' })).type).toBe('typing:set')
    expect(parseClientMessage(JSON.stringify({ type: 'react:add', networkId: 1, target: '#x', msgid: 'm1', emoji: '👍' })).type).toBe('react:add')
  })
  it('chat:send accepts optional replyTo', () => {
    const m = parseClientMessage(JSON.stringify({ type: 'chat:send', networkId: 1, target: '#x', text: 'hi', replyTo: 'm1' }))
    expect(m).toMatchObject({ type: 'chat:send', replyTo: 'm1' })
  })
  it('parses typing/react server updates and chat:msg replyTo', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'typing:update', networkId: 1, target: '#x', nick: 'bob', state: 'active' })).type).toBe('typing:update')
    expect(parseServerMessage(JSON.stringify({ type: 'react:update', networkId: 1, target: '#x', msgid: 'm1', emoji: '👍', nick: 'bob', action: 'add' })).type).toBe('react:update')
    const cm = parseServerMessage(JSON.stringify({ type: 'chat:msg', networkId: 1, target: '#x', from: 'a', kind: 'privmsg', text: 'yo', self: false, replyTo: 'm1' }))
    expect(cm).toMatchObject({ type: 'chat:msg', replyTo: 'm1' })
  })
})
```

- [ ] **Step 2: RED** → `pnpm --filter @bool/shared test` fails.
- [ ] **Step 3:** bump `PROTOCOL_VERSION` to `5`; add `typingSetSchema`, `reactAddSchema`, `reactRemoveSchema` (client) and `typingUpdateSchema`, `reactUpdateSchema` (server); add `replyTo: z.string().optional()` to `chatSendSchema`, `chatMsgSchema`, and `storedMsgSchema`; extend the two unions. Update the version assertions in `protocol-history.test.ts`, `protocol-irc.test.ts`, `protocol-read.test.ts` to 5.
- [ ] **Step 4: GREEN** + typecheck.
- [ ] **Step 5: commit** `feat(shared): protocol v5 — typing, reactions, reply metadata`

---

### Task 2: Server — IRCv3 tag send/receive in IrcConnection + WS routing

**Files:** Modify `packages/server/src/irc/connection.ts` (send helpers + inbound tag mapping), `packages/server/src/irc/manager.ts` (pass-through methods + persist replyTo), `packages/server/src/ws.ts` (route new client messages); Test `packages/server/src/irc/connection-tags.test.ts`, `packages/server/src/ws-rich.test.ts`.

**Interfaces (produces):**
- `IrcConnection`: `sendTyping(target, state)`, `sendReaction(target, msgid, emoji, add)`, and `say(target, text, replyTo?)` extended to attach `+draft/reply` when `replyTo` is set. All gated on `this.client.network.cap.isEnabled('message-tags')` — if absent, typing/reaction are no-ops and a reply degrades to `say(target, '> (reply) ' + text)` (a plain-text quote). Inbound: a `tagmsg` with `+typing` → `sink(typing:update)`; a `tagmsg` with `+draft/react` (+ `+draft/reply` msgid) → `sink(react:update)`; a `privmsg`/`message` whose tags include `+draft/reply` → the emitted `chat:msg` carries `replyTo`.
- `IrcManager`: `setTyping(userId, networkId, target, state)`, `react(userId, networkId, target, msgid, emoji, add)`, and `say(userId, networkId, target, text, replyTo?)` delegating to the connection.
- `ws.ts` switch: `typing:set` → `ircManager.setTyping(...)`; `react:add`/`react:remove` → `ircManager.react(...)` then also `hub.publish` a local `react:update` (so the user's own devices reflect it immediately); `chat:send` passes `msg.replyTo`. Persist: when the manager's persisting sink stores a `chat:msg` with `replyTo`, include it in `storeMessage`.

- [ ] Steps: `connection-tags.test.ts` (fake client with `cap.isEnabled` toggled true → `sendTyping` calls `client.tagmsg(target, {'+typing':'active'})`; with cap false → no call; inbound `tagmsg` with `+typing` → sink emits `typing:update`; inbound `+draft/react` tagmsg → `react:update`; a reply with cap-false degrades to a quoted `say`) and `ws-rich.test.ts` (authenticated socket + injected fake: `typing:set` reaches the client tagmsg; `react:add` fans a `react:update` to the user's socket) → RED → implement → GREEN. Keep all prior server tests green. Commit `feat(server): IRCv3 typing/reaction/reply tags with graceful degradation`.

> Implementer note: verify the real irc-framework `tagmsg` signature and the inbound `tagmsg` event payload shape (tags object keyed by name). Client-only tags require `message-tags`; check `isEnabled('message-tags')`. Reactions per the IRCv3 draft are a `TAGMSG` carrying `+draft/react` (emoji) and `+draft/reply` (the target msgid).

---

### Task 3: Client store — reduce typing / reactions / replies

**Files:** Modify `packages/client/src/store/chat-store.ts`, `packages/client/src/store/types.ts`; Test extend `chat-store.test.ts`.

**Interfaces (produces):**
- State: `typing: Record<string, Record<string, number>>` (targetKey → nick → expiry-ts; entries auto-considered stale after ~6s — the reducer stamps a client-side expiry using an injected clock or `performance.now()` is avoided; use a monotonic counter or store `Date.now()` guarded via an injected `now()` so tests are deterministic — simplest: store the raw last-active and let the UI filter by age with a passed `now`). `reactions: Record<string, Record<string, string[]>>` (msgid → emoji → nicks). Messages already carry optional `replyTo`.
- Actions: `setTyping(targetKey, state)` (sends `typing:set` and locally no-ops on own typing display), `react(msgid, emoji, add)` (finds the target from the message, sends `react:add`/`react:remove`), `sendReply(text, replyToMsgid)` (sends `chat:send` with `replyTo`). Reducer: `typing:update` → set/clear the nick under the target; `react:update` → add/remove the nick under `reactions[msgid][emoji]` (drop empty emoji buckets); `chat:msg` with `replyTo` already stored.

- [ ] Steps: store tests (a `typing:update active` adds the nick, `done` removes it; `react:update add` then `remove` leaves the emoji bucket empty/removed; `react(msgid,'👍',true)` sends the right `react:add`) → RED → implement → GREEN + typecheck. Commit `feat(client): store reduces typing, reactions, replies`.

---

### Task 4: Add-network settings UI (net:add / net:remove / connect)

**Files:** Create `packages/client/src/components/NetworkSettings.tsx`, `packages/client/src/components/Dialog.tsx` (a shared modal with focus-trap + focus-restore — the M5 `TODO(m6)`); Modify `AppShell.tsx`/`Sidebar.tsx` (an "Add network" affordance — a `+` on the network rail) and refactor `CommandPalette.tsx`/`SearchPanel.tsx` to use the shared `Dialog` focus-trap; Test `NetworkSettings.test.tsx`, `Dialog.test.tsx`.

**Interfaces (produces):**
- `Dialog` — an accessible modal (`role="dialog" aria-modal`, Esc to close, click-scrim to close, **focus trapped within, focus restored to the opener on close**). Palette + Search adopt it (closes their M5 focus TODO).
- `NetworkSettings` — a form (name, host, port [default 6697], TLS [default on], nick, optional username/realname, optional SASL account/password) that calls `useChat.addNetwork(input)` then can connect it; lists existing networks with a Remove button (`removeNetwork` → `net:remove`) and a Connect/Disconnect toggle. Opened from a `+` button on the sidebar network rail.
- The sidebar network-rail rows become native `<button>`s (the other M5 `TODO(m6)`).

- [ ] Steps: `Dialog.test.tsx` (opens focused, Esc closes, focus returns to opener) + `NetworkSettings.test.tsx` (fill the form + submit → `useChat.getState()` sent a `net:add` with the right fields [spy the store action or the socket send]; a seeded network lists with Remove; Remove calls `removeNetwork`) → RED → implement → GREEN. Keep existing tests green. Commit `feat(client): add-network settings dialog + shared focus-trapped Dialog`.

---

### Task 5: Client UI — typing indicators + reactions

**Files:** Create `packages/client/src/components/TypingLine.tsx`, `packages/client/src/components/Reactions.tsx`, `packages/client/src/components/EmojiPicker.tsx` (thin wrapper over `@emoji-mart/react`); Modify `MessageRow.tsx` (reaction pills + a react button on hover), `MainPane.tsx`/`Composer.tsx` (typing line above the composer; composer dispatches `typing:set active` on input, `done` on send/idle), `MessageList.tsx`; Test `Reactions.test.tsx`, `TypingLine.test.tsx`.

**Interfaces (produces):**
- `TypingLine` — reads `typing[selectedKey]`, filters to currently-active nicks (age < ~6s using a `now` from a 1s ticker), renders "alice is typing…" / "alice and bob are typing…" / "several people are typing…". Never shows the current user.
- `Reactions` — for a message with `msgid`, renders `reactions[msgid]` as pills (emoji + count, highlighted if the current user reacted); clicking a pill toggles the user's reaction (`react(msgid, emoji, !mine)`); a `+` opens the `EmojiPicker` to add a new one.
- Composer: on input change, throttled `setTyping(key,'active')`; on send or ~5s idle, `setTyping(key,'done')`.
- `@emoji-mart/react` + `@emoji-mart/data` installed.

- [ ] Steps: `TypingLine.test.tsx` (seed typing state → renders the names; excludes self; stale entries excluded given a `now`) + `Reactions.test.tsx` (seed `reactions[msgid]` → pills render with counts; clicking a pill calls `react` with toggled value) → RED → implement → GREEN. Commit `feat(client): typing indicators + emoji reactions`.

---

### Task 6: Client UI — replies

**Files:** Create `packages/client/src/components/ReplyContext.tsx`; Modify `MessageRow.tsx` (a "Reply" action on hover; render a quoted `ReplyContext` above a message that has `replyTo`), `Composer.tsx` (a "replying to …" chip that sets a pending `replyTo`, cleared on send/cancel), `store/chat-store.ts` (a `replyingTo` UI field + `setReplyTarget(msgid|null)`); Test `ReplyContext.test.tsx`.

**Interfaces (produces):**
- Reply affordance: clicking "Reply" on a message sets `replyingTo = msgid`; the composer shows a cancellable "Replying to <sender>: <snippet>" chip; sending calls `sendReply(text, replyingTo)` (which sends `chat:send` with `replyTo`) and clears it.
- `ReplyContext` — for a rendered message with `replyTo`, looks up the referenced message in the store (`messages[selectedKey]` by msgid) and renders a compact quoted line ("↳ <sender>: <snippet>"); if not found, renders a muted "↳ (message)".
- Degradation: if the network lacks the reply cap, the server already sent a plain-text quote — the client still renders it as a normal message (no `replyTo`), which is fine.

- [ ] Steps: `ReplyContext.test.tsx` (a message with `replyTo` pointing at a seeded message renders the quoted sender+snippet; a dangling `replyTo` renders the muted fallback) + a store test for `setReplyTarget`/`sendReply` sending `chat:send` with `replyTo` → RED → implement → GREEN. Run `pnpm -r test` + `pnpm -r typecheck` green. Commit `feat(client): threaded replies with quoted context`.

---

## Self-Review

**Spec coverage (Milestone 6 = "rich features: reactions/replies/typing + media"):** typing ✓ Tasks 1–3, 5; reactions ✓ Tasks 1–3, 5; replies ✓ Tasks 1–3, 6; graceful degradation on every feature ✓ Task 2 (cap checks) + client tolerance. **Media (uploads, link previews) is explicitly deferred to a dedicated later milestone** — called out, not silently dropped. M5 `TODO(m6)` folded: focus-trap/restore + native rail buttons ✓ Task 4. The add-network UI (a real usability gap) ✓ Task 4.

**Placeholder scan:** foundational tasks (1–3) carry complete code/tests; UI tasks (4–6) specify the component contract + the test to write + the mockup/overlay to match. No TBDs.

**Type consistency:** protocol v5 shapes (Task 1) are the contract for the server tag mapping (Task 2), the store reducers/actions (Task 3), and the UI (Tasks 5–6). `addNetwork`/`removeNetwork`/`setTyping`/`react`/`sendReply`/`setReplyTarget` store actions (Tasks 3, 4, 6) are consumed by the components with identical signatures.

**Known risks (call out during execution):** (1) reactions/typing/replies barely exist on public networks (Libera has `+typing` but not react/reply) — they light up between bool clients / on Ergo and degrade to no-op/quote elsewhere; the tests use a fake client with caps toggled, so both paths are covered. (2) typing-state staleness needs a deterministic clock in tests (inject `now`). (3) reactions are live-only this milestone (not persisted) — a reaction made while a device is offline is missed; note it for a future persistence pass.

## Execution Handoff

Executed subagent-driven like Milestones 0–5. After this: a **Media milestone** (server upload service + SSRF-guarded link-preview fetcher + client inline images/preview cards/upload), then Milestone 7 (push/PWA — iOS Web Push), Milestone 8 (Electron). A real end-to-end pass (add a network via the new UI, connect to Libera, chat) becomes possible after Task 4 and is worth a manual verification.
