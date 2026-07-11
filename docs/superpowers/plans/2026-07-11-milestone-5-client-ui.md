# bool — Milestone 5: Client UI Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real bool web client — the **Terminal-Modern (Direction A)** design brought to life as a React app that consumes the v4 WS protocol: networks/channels sidebar, virtualized message list, composer, Cmd-K palette, Slack-style search, and read-state — with B/C/shimmer selectable as themes and a compact/comfortable density toggle.

**Architecture:** A single Zustand store owns the WebSocket connection and all normalized client state (networks, targets, messages-by-target, read markers, selection, connection status), dispatching typed `ClientMessage`s and reducing `ServerMessage`s. React components subscribe to slices of that store. Visual fidelity comes from porting the exact tokens, colors, fonts, and layout from the approved mockup `design/direction-a/index.html` into a CSS-variable design system driven by `data-theme` / `data-density` on `<html>`. The whole app renders inside the existing `AuthGate` (Milestone 1). The client speaks ONLY the typed WS protocol — never IRC.

**Tech Stack (added):** `zustand` (state), `react-virtuoso` (virtualized message list), `cmdk` (command palette), `linkify-it` (URL detection). Existing: Vite 7, React 19, `@bool/shared`, `better-auth/react`.

## Global Constraints

- ENGLISH only (all UI copy). pnpm workspaces only. ESM. Node `>=20`.
- **The client speaks only the `@bool/shared` typed WS protocol** (v4) — no IRC, no re-defined message shapes. Reuse/extend the existing `createWsClient` (from Milestone 0) for the socket.
- **Visual source of truth = `design/direction-a/index.html`.** Port its exact CSS variables, palette, fonts (JetBrains Mono + IBM Plex Sans), layout, and component styling. Do not invent a different look. Direction A is the DEFAULT skin; B (Soft-Editorial), C (Neo-Aurora), and Shimmer are additional themes selectable at runtime (their token sets come from the sibling mockups `design/direction-b|c/index.html` and `design/direction-shimmer/index.html`).
- **Density**: compact is the default; a real toggle switches `data-density` between `compact`/`comfortable` (token-driven, per the mockup) — not a rewrite.
- **State is normalized and keyed for isolation**: everything is scoped to the logged-in user by the server; the client just renders what the socket delivers.
- **Store is testable without a server**: the socket is injected (fake in unit tests); reducers are pure and unit-tested. Components tested with `@testing-library/react`.
- Design tokens (exact, from the approved Direction A mockup):
  - Dark (default): `--bg-0:#0a0c0d --bg-1:#0e1113 --bg-2:#101416 --bg-3:#151a1d --bg-4:#1b2226 --line:#20282c --line-2:#2a343a --ink-0:#e6efe9 --ink-1:#9fb1ab --ink-2:#63756f --ink-3:#455049 --green:#39e08b --green-dim:#1f7a4c --amber:#ffb454 --cyan:#4fd6e0 --red:#ff6b6b`
  - mIRC palette: `--m-red:#f7768e --m-green:#9ece6a --m-yellow:#e0af68 --m-blue:#7aa2f7 --m-magenta:#bb9af7 --m-cyan:#7dcfff --m-orange:#ff9e64`
  - Fonts: `--mono:'JetBrains Mono' --sans:'IBM Plex Sans'`; radius 6/4px.
  - Density compact: `--row-py:2px --msg-fs:13px --msg-lh:1.45 --meta-fs:11px --side-row-h:24px`; comfortable: `--row-py:5px --msg-fs:14px --msg-lh:1.6 --meta-fs:12px --side-row-h:30px`.

---

### Task 1: Design system (tokens, themes, density, fonts, base layout)

**Files:**
- Create: `packages/client/src/styles/tokens.css` (all theme token sets + density blocks, ported from the mockups)
- Create: `packages/client/src/styles/base.css` (reset, fonts, scrollbars, app frame)
- Create: `packages/client/src/theme.ts` (theme + density store + `applyAppearance()` that sets `data-theme`/`data-density` on `<html>`, persisted to localStorage)
- Modify: `packages/client/index.html` (font `<link>`s), `packages/client/src/main.tsx` (import css + apply appearance)
- Test: `packages/client/src/theme.test.ts`

**Interfaces:**
- Produces: `useAppearance()` (zustand) with `{ theme: 'a'|'b'|'c'|'shimmer', density: 'compact'|'comfortable', setTheme, setDensity }`; `applyAppearance(theme, density)` writes the attributes on `document.documentElement`. Token CSS defines `:root` (Direction A dark), `[data-theme="light"]`, `[data-theme="b"]`, `[data-theme="c"]`, `[data-theme="shimmer"]`, and `[data-density="comfortable"]`.

- [ ] **Step 1: Add deps** — `pnpm add --filter @bool/client zustand react-virtuoso cmdk linkify-it` and `pnpm add -D --filter @bool/client @types/linkify-it`. Add the fonts `<link>` (JetBrains Mono + IBM Plex Sans) from `design/direction-a/index.html` head into `packages/client/index.html`.

- [ ] **Step 2: Write the failing test**

`packages/client/src/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { applyAppearance, useAppearance } from './theme.js'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-density')
  localStorage.clear()
  useAppearance.setState({ theme: 'a', density: 'compact' })
})

describe('appearance', () => {
  it('applies theme + density to <html>', () => {
    applyAppearance('c', 'comfortable')
    expect(document.documentElement.getAttribute('data-theme')).toBe('c')
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable')
  })
  it('setTheme updates the store and the DOM and persists', () => {
    useAppearance.getState().setTheme('shimmer')
    expect(useAppearance.getState().theme).toBe('shimmer')
    expect(document.documentElement.getAttribute('data-theme')).toBe('shimmer')
    expect(localStorage.getItem('bool.theme')).toBe('shimmer')
  })
  it('default theme "a" applies no data-theme attribute (it is :root)', () => {
    applyAppearance('a', 'compact')
    expect(document.documentElement.getAttribute('data-theme')).toBe(null)
  })
})
```

- [ ] **Step 3: Implement tokens.css, base.css, theme.ts**

`tokens.css`: `:root { … Direction A dark tokens (from Global Constraints) + compact density … }`, `[data-density="comfortable"] { … }`, `[data-theme="light"] { … }` (from the mockup), and `[data-theme="b"]`, `[data-theme="c"]`, `[data-theme="shimmer"]` blocks porting the palettes from `design/direction-b/index.html`, `design/direction-c/index.html`, `design/direction-shimmer/index.html` respectively (extract each mockup's `:root` variables and map them onto the SAME variable names used here). Theme `a` is `:root` (no attribute).

`base.css`: reset, `html,body{height:100%}`, `body{font-family:var(--sans);background:var(--bg-0);color:var(--ink-0);font-size:14px}`, custom scrollbar styling matching the mockup, and the app frame grid.

`theme.ts`:

```ts
import { create } from 'zustand'

export type ThemeId = 'a' | 'b' | 'c' | 'shimmer'
export type Density = 'compact' | 'comfortable'

export function applyAppearance(theme: ThemeId, density: Density): void {
  const el = document.documentElement
  if (theme === 'a') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme === 'b' || theme === 'c' || theme === 'shimmer' ? theme : 'a')
  el.setAttribute('data-density', density)
}

interface AppearanceState {
  theme: ThemeId
  density: Density
  setTheme: (t: ThemeId) => void
  setDensity: (d: Density) => void
}

const savedTheme = (localStorage.getItem('bool.theme') as ThemeId) ?? 'a'
const savedDensity = (localStorage.getItem('bool.density') as Density) ?? 'compact'

export const useAppearance = create<AppearanceState>((set, get) => ({
  theme: savedTheme,
  density: savedDensity,
  setTheme: (theme) => {
    localStorage.setItem('bool.theme', theme)
    applyAppearance(theme, get().density)
    set({ theme })
  },
  setDensity: (density) => {
    localStorage.setItem('bool.density', density)
    applyAppearance(get().theme, density)
    set({ density })
  },
}))
```

`main.tsx`: import `./styles/tokens.css` and `./styles/base.css`; call `applyAppearance(useAppearance.getState().theme, useAppearance.getState().density)` before render.

- [ ] **Step 4: Run it (GREEN)** → `pnpm --filter @bool/client test`. `pnpm --filter @bool/client typecheck` clean.

- [ ] **Step 5: Commit** — `feat(client): Terminal-Modern design system — tokens, themes, density`

---

### Task 2: WS client store (Zustand)

**Files:**
- Create: `packages/client/src/store/types.ts` (view-model types)
- Create: `packages/client/src/store/chat-store.ts`
- Test: `packages/client/src/store/chat-store.test.ts`

**Interfaces:**
- Produces `useChat` (zustand) holding:
  - `connection: 'connecting'|'open'|'closed'`
  - `networks: Record<number, { id, name, host, nick, connected }>`
  - `targets: Record<string, { networkId, target, kind:'channel'|'pm', unread:number, names?: {nick,modes}[], topic?:string }>` keyed `"${networkId}:${target}"`
  - `messages: Record<string, StoredMsg[]>` keyed the same (live + history merged, ascending by ts, de-duped by msgid/id)
  - `readMarkers: Record<string, number>` (targetKey → ts)
  - `selected: string | null` (targetKey)
  - `searchResults: { query: string; results: StoredMsg[] } | null`
  - Actions: `init(socketFactory?)` (opens the WS via `createWsClient`, sends `hello`), `addNetwork(input)`, `connectNetwork(id)`, `join(id, chan)`, `part(id, chan)`, `select(targetKey)`, `send(text)` (to the selected target), `search(query)`, `loadHistory(targetKey)`, `markRead(targetKey, ts)`.
  - It reduces every `ServerMessage`: `net:list`/`net:state` → networks; `chat:msg` → append to `messages[key]`, bump `unread` if not selected/older than read; `chan:names`/`chan:topic`/`chan:join`/`chan:part`/`presence:*` → target/name updates; `read:list`/`read:update` → readMarkers; `search:results` → searchResults; `history:batch` → prepend/merge into messages.
- `targetKey(networkId, target)` helper exported.

- [ ] **Step 1: Write the failing test** (fake socket; drive ServerMessages in, assert state; assert actions send the right ClientMessages)

`packages/client/src/store/chat-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChat, targetKey } from './chat-store.js'
import type { WebSocketLike } from '../ws-client.js'

function fakeSocket() {
  const listeners: Record<string, ((ev: unknown) => void)[]> = {}
  const sock: WebSocketLike = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (t, cb) => ((listeners[t] ??= []).push(cb as any)),
  }
  const emitServer = (msg: unknown) => (listeners['message'] ?? []).forEach((cb) => cb({ data: JSON.stringify(msg) }))
  const open = () => (listeners['open'] ?? []).forEach((cb) => cb({}))
  return { sock, emitServer, open }
}

beforeEach(() => useChat.setState(useChat.getInitialState?.() ?? {}, true) as any)

describe('chat store', () => {
  it('records networks from net:list and a live message', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'net:list', networks: [{ id: 1, name: 'Libera', host: 'h', port: 6697, tls: true, nick: 'me', connected: true }] })
    emitServer({ type: 'chat:msg', networkId: 1, target: '#x', from: 'bob', kind: 'privmsg', text: 'hi', self: false, ts: 5 })
    const key = targetKey(1, '#x')
    expect(useChat.getState().networks[1]!.name).toBe('Libera')
    expect(useChat.getState().messages[key]!.map((m) => m.body)).toEqual(['hi'])
  })

  it('send() posts a chat:send for the selected target', () => {
    const { sock, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    useChat.getState().select(targetKey(2, '#dev'))
    useChat.getState().send('hello there')
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chat:send', networkId: 2, target: '#dev', text: 'hello there' }))
  })

  it('bumps unread for a non-selected target and clears on markRead', () => {
    const { sock, emitServer, open } = fakeSocket()
    useChat.getState().init(() => sock)
    open()
    emitServer({ type: 'chat:msg', networkId: 1, target: '#y', from: 'z', kind: 'privmsg', text: 'yo', self: false, ts: 9 })
    const key = targetKey(1, '#y')
    expect(useChat.getState().targets[key]!.unread).toBe(1)
    useChat.getState().markRead(key, 9)
    expect(useChat.getState().targets[key]!.unread).toBe(0)
  })
})
```

- [ ] **Step 2–4:** RED → implement `chat-store.ts` (+ `types.ts`) reducing every ServerMessage and sending typed ClientMessages via `createWsClient` → GREEN. Merge `history:batch` ascending, de-dupe by `id`/`msgid`. `send()`/`search()`/`loadHistory()` serialize the exact v4 ClientMessages. Typecheck clean.

- [ ] **Step 5: Commit** — `feat(client): Zustand chat store over the v4 WS protocol`

---

### Task 3: App shell + three-pane layout (visible running app)

**Files:**
- Create: `packages/client/src/components/AppShell.tsx`, `Sidebar.tsx`, `MainPane.tsx`
- Create: `packages/client/src/components/*.module.css` (or a shared `app.css`) porting Direction A layout
- Modify: `packages/client/src/App.tsx` (render `<AppShell/>` inside `AuthGate`; call `useChat.init()` on mount)
- Test: `packages/client/src/components/Sidebar.test.tsx`

**Interfaces:** `AppShell` renders the Direction A frame (top bar with wordmark + connection dot + density/theme toggles; left `Sidebar`; center `MainPane`; optional right member pane). `Sidebar` lists networks → channels/PMs from `useChat` with unread badges and mention highlights, calls `select(key)` on click and shows the active row. Visual markup/classes ported from `design/direction-a/index.html`.

- [ ] Steps: component test (Sidebar renders networks+channels from a seeded store, click selects) → RED → implement shell/sidebar/main + CSS ported from the mockup, wire `init()` → GREEN. Commit — `feat(client): app shell + three-pane sidebar (Direction A)`.

---

### Task 4: Message list + composer

**Files:**
- Create: `packages/client/src/components/MessageList.tsx`, `MessageRow.tsx`, `Composer.tsx`, `irc-format.ts` (mIRC color/format → spans; linkify URLs)
- Test: `packages/client/src/components/irc-format.test.ts`, `Composer.test.tsx`

**Interfaces:** `MessageList` uses `react-virtuoso` (`Virtuoso`/`VirtuosoMessageList`) over `messages[selectedKey]`, sticks to bottom, loads older history on scroll-to-top (`loadHistory`). `MessageRow` renders nick (deterministic mIRC color by nick hash), timestamp (`--meta-fs`), body via `irc-format.ts` (parse `\x03` color codes + bold/underline, linkify URLs), consecutive-sender grouping. `Composer` is a textarea: Enter sends (`useChat.send`), Shift+Enter newline, a `/` shows a slash-command hint list. On selecting a target, call `loadHistory` + `markRead` at the newest ts.

- [ ] Steps: `irc-format.test.ts` (parses a mIRC color code + linkifies a URL, escapes HTML) + `Composer.test.tsx` (Enter calls send, empty is ignored) → RED → implement → GREEN. Visual styling ported from the mockup's message rows/composer. Commit — `feat(client): virtualized message list + composer with mIRC formatting`.

---

### Task 5: Cmd-K command palette

**Files:**
- Create: `packages/client/src/components/CommandPalette.tsx`
- Modify: `AppShell.tsx` (mount palette; global Cmd/Ctrl-K handler)
- Test: `packages/client/src/components/CommandPalette.test.tsx`

**Interfaces:** a `cmdk`-based palette opened with Cmd/Ctrl-K. Sources: jump to any channel/PM/network (calls `select`), plus actions (Connect network, Search, Toggle density, Switch theme, Join channel…). Fuzzy match, keyboard-driven, styled per `design/overlay-command-palette.html`. Shows the shortcut hints.

- [ ] Steps: test (palette opens on ctrl+k, typing filters to a channel, Enter selects it) → RED → implement → GREEN. Commit — `feat(client): Cmd-K command palette`.

---

### Task 6: Search UI

**Files:**
- Create: `packages/client/src/components/SearchPanel.tsx`
- Modify: `AppShell.tsx` (open search; e.g. Cmd/Ctrl-Shift-F and a palette action)
- Test: `packages/client/src/components/SearchPanel.test.tsx`

**Interfaces:** a Slack-style search overlay: an input (supports `in:#channel` / `from:user` tokens visually), dispatches `useChat.search(query)`, renders `searchResults` grouped with context (sender, target, timestamp), each result clickable to `select` its target (+ `loadHistory`). Styled per `design/overlay-search.html`.

- [ ] Steps: test (typing a query + submit calls `search`; rendering `searchResults` shows the rows; clicking a result selects its target) → RED → implement → GREEN. Commit — `feat(client): Slack-style search panel`.

---

### Task 7: Read-state, member list, appearance controls, polish

**Files:**
- Create: `packages/client/src/components/MemberList.tsx`, `AppearanceMenu.tsx`
- Modify: `Sidebar.tsx` (unread/mention badges from `readMarkers` vs latest ts), `MainPane.tsx` (channel header with topic + member toggle), `AppShell.tsx` (density/theme controls)
- Test: `packages/client/src/components/AppearanceMenu.test.tsx`

**Interfaces:** unread counts/mention dots derived from `readMarkers[key]` vs the target's latest message ts; opening a target marks it read (fans via `read:set`). `MemberList` renders `targets[key].names` grouped by op/voice/regular. `AppearanceMenu` toggles theme (A/B/C/shimmer) and density (compact/comfortable) via `useAppearance`. Final visual pass against Direction A.

- [ ] Steps: test (AppearanceMenu switches theme+density via the store, DOM attributes change) → RED → implement → GREEN. Run `pnpm -r test` + `pnpm -r typecheck`. Commit — `feat(client): read-state badges, member list, appearance controls`.

---

## Self-Review

**Spec coverage (Milestone 5 = "Client UI core: Direction A + themes"):** Direction A design system ✓ Task 1; WS store over v4 ✓ Task 2; three-pane shell + sidebar ✓ Task 3; virtualized message list + composer + mIRC formatting ✓ Task 4; Cmd-K ✓ Task 5; Slack-style search ✓ Task 6; read-state + member list + theme/density controls ✓ Task 7. B/C/shimmer as runtime themes ✓ Tasks 1, 7. Consumes fan-out/history/search/read-state from M2–M4.

**Placeholder scan:** foundational tasks (1–2) have complete code; component tasks (3–7) specify the contract, the test to write, and point to the exact mockup file to port for visual fidelity (not a vague "make it look good" — the pixels come from `design/direction-a/index.html`).

**Type consistency:** `useAppearance`/`applyAppearance`/`ThemeId`/`Density` (Task 1); `useChat`/`targetKey`/store shape (Task 2) are the contracts every component (Tasks 3–7) consumes. Store actions serialize the exact v4 `ClientMessage`s from `@bool/shared`.

**Known risks (call out during execution):** (1) visual fidelity — implementers must port the mockup CSS, not approximate it; the controller will screenshot and compare; (2) react-virtuoso stick-to-bottom + reverse-history-load interaction; (3) end-to-end run needs the server (`pnpm --filter @bool/server dev`) + client dev with the Vite proxy — the controller verifies with a real sign-up + screenshots at the end.

## Execution Handoff

Executed subagent-driven like Milestones 0–4. Store/format/appearance are unit-testable without a server; components via testing-library; final verification is a real end-to-end run (server + client) with screenshots of the Terminal-Modern UI (dark + light + a second theme, compact + comfortable). After this: Milestone 6 (rich features — reactions/replies/typing/media), 7 (push/PWA), 8 (Electron).
