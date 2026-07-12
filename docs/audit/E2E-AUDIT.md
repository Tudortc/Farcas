# bool — End-to-End Audit (flows + UX)

**Date:** 2026-07-12
**Target:** the running web client at `http://localhost:5174/` (Vite dev) backed by the Fastify/IRC server on `:3030`
**Method:** Playwright (Chromium) driving the real app + Chrome DevTools inspection of live flows, network, and console. A committed, self-contained Playwright suite was added (`packages/client/e2e/`, 33 tests) that boots its own server + client on a throwaway database.

> Scope note: this pass **reports** issues and **adds tests**; it does not change application behaviour. Two bugs are pinned as `test.fixme` in the suite so they flip green the day they're fixed. Nothing in `packages/*/src` was modified except the necessary test-config (Vitest `exclude`) so unit and e2e suites can coexist.

---

## TL;DR

The **authenticated app is genuinely polished** (command palette, theming, dense layout — see screenshots). The problems cluster at the **edges**: the front door (login), backend-failure UX, and a few state-sync / dead-code gaps.

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | 🔴 Critical (env-dependent) | Auth / config | Auth silently breaks when Vite isn't on `:5173` (`trustedOrigins` hardcoded); surfaces as generic "Authentication failed" |
| 2 | 🟠 High | Dev reliability | Backend crash isn't recovered; every request becomes an opaque proxy `500` with empty body |
| 3 | 🟠 High | Error UX | Backend-unavailable / non-JSON errors collapse to "Authentication failed" — indistinguishable from a wrong password |
| 4 | 🟠 High | State sync | Removing a network doesn't update the live UI (lingers until reload) |
| 5 | 🟡 Medium | Feature gap | Connection-status indicator (`ConnDot`) is defined but never rendered |
| 6 | 🟡 Medium | Feature gap | No sign-out / logout control exists anywhere in the UI |
| 4b | 🟠 High | Feature gap | **No UI to join a channel** — nothing calls `store.join()`; joining only works via the WS protocol directly |
| 4c | 🟠 High | Feature gap | **Slash commands are cosmetic** — `/join`, `/list`, `/msg`, `/me`, … show autocomplete but send as literal text (neither client `send()` nor server `say()` parses them) |
| 7 | 🟡 Medium | Design / a11y | Login/Register screen is completely unstyled + missing autocomplete/name attributes |
| 8 | 🟡 Medium | Design | Notifications toggle references CSS classes that don't exist → renders as a raw button |
| 9 | 🟢 Low | Polish | No favicon → `/favicon.ico` 404 on every load |
| 10 | 🟢 Low | Self-hosting | Fonts loaded from Google Fonts CDN (privacy/offline concern for a self-hosted product) |
| 11 | 🟢 Low | Onboarding | Fresh-account empty state has no call-to-action to add a first network |
| 12 | ℹ️ Info | Config | `BETTER_AUTH_URL`/secret unset by default (Better Auth warns); no root `.env` |

---

## Findings

### 1. 🔴 Auth breaks when Vite runs on a port other than 5173
**What I saw:** Registration and sign-in from `http://localhost:5174/` failed with a generic **"Authentication failed"**. The network tab showed `POST /api/auth/sign-up/email → 500` (empty body).

**Root cause:** the server pins trusted origins to the default port:
- `packages/server/src/auth.ts` → `trustedOrigins` defaults to `http://localhost:5173`.
- `packages/client/vite.config.ts` does **not** set `server.port` / `strictPort`, so when `5173` is occupied Vite silently falls back to `5174`, `5175`, …

Reproduced directly against the server: an `Origin: http://localhost:5174` request returns `403 {"code":"INVALID_ORIGIN"}` and logs `Invalid origin: http://localhost:5174`. Starting the server with `BOOL_TRUSTED_ORIGINS=http://localhost:5174` makes the entire register→app→session→login flow pass (see the passing `auth.spec.ts`).

**Recommendation:**
- Pin the dev client: `server: { port: 5173, strictPort: true }` in `vite.config.ts`, **and/or**
- Make the server tolerant: include the actual dev origin(s), or derive trusted origins from `BETTER_AUTH_URL` + a documented `BOOL_TRUSTED_ORIGINS`.
- Document `BOOL_TRUSTED_ORIGINS` prominently — this is the #1 self-hoster foot-gun.

### 2. 🟠 Backend crash isn't recovered; failures are opaque
During the audit the dev server (`pnpm dev`) had **crashed and stayed down** — `tsx watch` only restarts on *file changes*, not on process exit. With nothing on `:3030`, the Vite proxy returns `500` with an **empty body** for `/health`, `/api/*`, everything. From the browser this is indistinguishable from an app bug.

**Recommendation:** run the dev server under a crash-restarting supervisor (e.g. `tsx watch` already re-runs on save, but add restart-on-crash), and have the client detect "backend unreachable" (health probe / WS state) and show a real banner instead of failing silently.

### 3. 🟠 Backend-unavailable collapses to "Authentication failed"
`LoginForm.tsx` renders `res.error.message ?? 'Authentication failed'`. A wrong password *does* show a specific message ("Invalid username or password" — verified in `auth.spec.ts`). But a proxy `500` / crashed backend / non-JSON response has no `error.message`, so the user sees the same generic "Authentication failed" — no hint that the **server** is the problem.

**Recommendation:** distinguish transport/5xx failures ("Can't reach the server — try again") from credential failures, and surface `INVALID_ORIGIN` as an actionable config error in dev.

### 4. 🟠 Removing a network doesn't update the live UI
**Repro:** add a network → remove it → it stays in the sidebar/settings until a full page reload. Server-side removal is correct (`net:remove` → `removeNetwork` → `sendNetList`), verified by the after-reload test.

**Root cause:** `packages/client/src/store/chat-store.ts` (`net:list` reducer) merges the authoritative list into existing state and **never prunes** networks the server dropped:
```ts
const networks = { ...state.networks }        // keeps everything already known
for (const net of msg.networks) networks[net.id] = { ... }   // only adds/updates
return { networks }
```
It should rebuild from the incoming list (and drop stale `targets`/`messages` for removed networks).

**Tests:** `network-settings.spec.ts` — "removing a network takes effect (verified after reload)" passes; "removing a network updates the live UI without reload" is `test.fixme` documenting the bug.

### 5. 🟡 Connection-status indicator is dead code
`ConnDot` in `components/AppShell.tsx` is fully implemented and styled (`.conn-dot` in `app.css`, `aria-label="Connection: <state>"`) but **never rendered** anywhere. Users have no live WebSocket connection indicator. Pinned as `test.fixme` in `app-shell.spec.ts`.

### 6. 🟡 No sign-out / logout anywhere
`signOut` is exported from `auth-client.ts` but wired to **no** UI control (only referenced in a test mock). Once authenticated, a user cannot log out from the app. Recommend adding it to the command palette and/or the appearance/account menu.

### 7. 🟡 Login/Register screen is unstyled (+ a11y gaps)
The literal front door renders **raw browser-default** inputs and buttons with no layout or centering (`01-login.png`) — a jarring contrast with the polished authenticated UI. `LoginForm.tsx` has no styling hooks. Console also flags:
- inputs lack `autocomplete` (`username`, `email`, `current-password`, `new-password`),
- form fields have no `id`/`name` attributes.

**Recommendation:** style the auth screen to the design system; add `autocomplete`/`name` for password-manager and a11y support.

### 8. 🟡 Notifications toggle renders unstyled
`NotificationsToggle.tsx` uses classes `notifications-toggle`, `notifications-toggle__btn`, etc., but **none of those classes exist** in any stylesheet (`grep` in `styles/*.css` → 0 hits). Inside the otherwise-polished appearance menu it shows as a raw white/black button (`04-theme-b-appearance.png`). Add the missing CSS (or reuse existing button tokens).

### 9. 🟢 Missing favicon
No `<link rel="icon">` in `index.html` and no `favicon.ico`, so every load emits a `404` for `/favicon.ico`. PWA icons exist in `public/` — wire one up as the favicon.

### 10. 🟢 Fonts loaded from Google Fonts CDN
`index.html` pulls JetBrains Mono / IBM Plex Sans from `fonts.googleapis.com`. For an explicitly **self-hosted** product this is a privacy leak and an offline-breakage risk. Consider self-hosting the fonts.

### 11. 🟢 Weak first-run onboarding
A fresh account lands on "No network connected" / "Select a channel" with only a subtle dashed **`+`** (ink-3) to add a network (`02-app-empty.png`). New users get no call-to-action. Consider an explicit "Add your first network" prompt in the empty state.

### 12. ℹ️ Dev config hygiene
Server logs `[Better Auth]: Base URL is not set` — `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` are unset and there's no root `.env`. Cross-port `localhost` cookie pollution (PostHog, a Next.js `better-auth.session_token`) from other dev apps was also observed hitting the API. Document a dev `.env` and set `BETTER_AUTH_URL`.

---

## Live IRC verification (Libera.Chat)

I connected the running app to **irc.libera.chat:6697 (TLS)** and drove the real flow end-to-end:

1. **Connect** → network shows a green "connected" dot; server MOTD/notices arrive in a `*` buffer (`05-irc-connected.png`).
2. **Join `#libera`** → the real channel **topic** ("Welcome to Libera.Chat support | Happy Pride! …") and **`1703 online`** count render in the topbar (`06-irc-channel.png`).
3. **Member list** works (`Ops · 1`, `@boolqa8231`) — though it's `display:none` at ≤1024px viewport width (responsive collapse; data is present).
4. **Send a message** → round-trips through IRC and renders with timestamp, colored nick, emoji, and **Add reaction / Reply** affordances (`07-irc-message-sent.png`).

**But**: joining and sending commands had to be issued over the WebSocket protocol directly (`chan:join`), because — as noted in **#4b / #4c** — there is **no channel-join UI** and the composer's slash commands are **not wired**. So today a user who connects to a network has no in-app way to actually join a channel or run `/list`. This matches the README ("the end-user chat UI is the next milestone"), but it's the highest-impact gap for making the client usable.

**`/list` specifically:** not implemented (no client command routing, no list UI, and Libera's full LIST is thousands of channels — it would need paging/rendering anyway).

## What works well ✅
- **Full auth flow** (register → app shell → session persistence across reload → re-login) once the origin is correct.
- **Command palette** (`Cmd/Ctrl-K`): cmdk-powered, scoped chips, channel/DM/action groups, keyboard hints — polished (`03-command-palette.png`).
- **Search panel** (`Cmd/Ctrl-Shift-F`) with `in:/from:/before:/after:/has:` syntax hints.
- **Theming + density**: switching writes `data-theme`/`data-density` and **persists across reload**; correct `aria-pressed` state.
- **Dialog a11y**: real focus trap, focus restore, Escape + scrim close, `aria-modal`, labelled by title.
- **Adding a network** persists and appears immediately.
- No uncaught JS exceptions on the login screen or in the authenticated app.

---

## Test suite added

`packages/client/e2e/` — 33 Playwright tests (31 pass, 2 `fixme` documenting bugs #4 and #5).

| Spec | Covers |
|------|--------|
| `auth.spec.ts` | login render, sign-in/register toggle, register→shell, session persistence, wrong creds, re-login, duplicate username |
| `app-shell.spec.ts` | three-pane layout, empty state, add-network affordance, appearance control, (fixme) connection indicator |
| `command-palette.spec.ts` | open/close (Cmd-K, Esc, scrim), scope chips, empty state, actions |
| `search.spec.ts` | open (Cmd-Shift-F), syntax hints, Esc close, launch from palette |
| `appearance.spec.ts` | theme → `data-theme`, density → `data-density`, persistence across reload, `aria-pressed` |
| `network-settings.spec.ts` | dialog fields, close paths, required validation, add + sidebar reflect, remove-after-reload, (fixme) live remove |
| `console-audit.spec.ts` | no uncaught JS errors on login + authenticated app |

**Harness** (`playwright.config.ts`): boots the API server (fresh throwaway SQLite DB + media dir, correct `trustedOrigins`) and the Vite client itself on dedicated ports — fully reproducible, never touches the real `bool.db`.

### Run it
```bash
cd packages/client
pnpm test:e2e            # headless
pnpm test:e2e:ui         # interactive UI mode
pnpm test:e2e:report     # open last HTML report
```
Stop any local `pnpm dev` first (the harness needs `:3030` and `:5175`).

## Screenshots
`docs/audit/01-login.png` · `02-app-empty.png` · `03-command-palette.png` · `04-theme-b-appearance.png`
