# bool — Modern Self-Hosted Web IRC Client — Design

**Status:** Approved design, pre-implementation
**Date:** 2026-07-11
**Name:** bool

## 1. Vision & Positioning

bool is a modern, beautiful, fast web IRC client with an always-on server
component that a community admin self-hosts for their whole community. It
delivers the IRCCloud experience — always online, full history everywhere,
working mobile push, rich media — but **open-source, self-hostable, and
IRCv3-native**.

**The wedge (from market research):** every recurring pain point in the
self-hosted IRC space converges on one unmet need — an "open-source IRCCloud."
The Lounge (the market leader, MIT) cannot do iOS push and has no history
search; soju/gamja are powerful but spartan and expert-only; IRCCloud nails UX
but is closed, paid, and "spies on chats into Splunk." bool takes The Lounge's
audience and beats it on the exact points people complain about.

**Positioning that defuses the "that's not IRC" reaction:** every rich feature
is *progressive enhancement*. Old-school clients still see clean, standard IRC
text. Nobody is forced into modern affordances.

### Target user
Self-hosted **community** operators: an admin runs one bool instance for many
members. Each member has their own account, their own IRC network connections,
and their own isolated history (the soju model, with top-tier UX).

### Language
The application, UI, and code are in **English**.

## 2. Scope

### In scope (v1)
- Multi-user with authentication + minimal admin panel (add/remove users, retention)
- Always-on bouncer: connects to external IRC networks (Libera, OFTC, EFNet, …),
  SASL, robust reconnect, IRCv3 capability negotiation
- Persistent history + **fast full-text search ("like Slack")**
- Multi-device sync + cross-device read-state sync
- **Web Push, including iOS (via installed PWA)**
- Impeccable UI: compact-by-default density with a real density toggle,
  dark/light themes, custom themes
- **Cmd-K command palette** + quick switcher
- **Rich media:** inline images, link previews (fetched server-side), file upload
- **Reactions / replies / typing** with graceful degradation
- **Self-documenting slash commands** with autocomplete
- PWA + optional Electron desktop wrapper (tray, native notifications, auto-start)

### Roadmap (post-v1)
Zulip-style topic threading · non-IRC bridging (Matrix/Discord) · voice ·
public plugin API · in-channel widgets · hosted tier · optional embedded Ergo
"managed network" mode.

### Non-goals (v1, YAGNI)
No WebRTC video (scope creep — cf. Convos) · no E2EE · no bridging · no own ircd
(pure bouncer only; Ergo mode is roadmap).

## 3. Architecture

Three layers with clean boundaries. **The browser never speaks IRC directly** —
the server is an always-on bouncer that owns all IRC connections and syncs state
to every device over a typed WebSocket protocol.

```
BROWSER / ELECTRON (React SPA / PWA)
   UI · virtualized message list · Cmd-K · search UI · media
        │  WebSocket (own JSON protocol) + REST (auth, upload, media)
SERVER (Node headless — the product's core)
   Auth & Users │ IRC Engine │ Sync Gateway │ History Store │ Push │ Media
        │  TCP/TLS (IRC + IRCv3 caps)
EXTERNAL NETWORKS (Libera, OFTC, EFNet, …)
```

### Deployment shape
**Web-first.** The core is a headless Node server (Docker image / single binary)
run on a VPS or home server. Accessed from a browser on any device. Electron is
an **optional** desktop wrapper. The server serves the built client as static
files.

### Module boundaries (each independently testable)
- **Auth & Users** — accounts, sessions, roles (admin/user), strict per-user isolation
- **IRC Engine** — one IRC session per user per network; IRCv3 cap negotiation;
  SASL; robust reconnect; correct nick-in-use handling
- **History Store** — single SQLite DB with FTS5 full-text search; strict
  per-user isolation via `user_id` on every query
- **Sync Gateway** — WebSocket hub; fan-out to a user's devices; read-state sync
- **Push Service** — Web Push (VAPID); works on iOS 16.4+ as an installed PWA
- **Media/Upload** — file upload, thumbnail generation, server-side link-preview
  fetching (never leaks the client's IP)

## 4. Technology Stack

Decided (rationale: matches every existing client's static-frontend +
dedicated-server shape; TypeScript end-to-end; no framework fight).

- **Monorepo:** pnpm workspaces — `packages/server`, `packages/client`,
  `packages/shared` (shared TypeScript types = single source of truth for the
  WS protocol)
- **Client:** Vite + React 19 + TypeScript, built as a PWA
  - Message list: **react-virtuoso** (`VirtuosoMessageList`, purpose-built for chat)
  - State: **Zustand**
  - Rendering: **irc-formatting** + **irc-colors** (mIRC codes), **linkify-it**
    (URLs), **emoji-mart** (picker/shortcodes), **Shiki** (code blocks)
  - Command palette: `cmdk`
- **Server:** **Fastify** + TypeScript
  - IRC: **irc-framework** (MIT, most complete IRCv3 surface)
  - Storage: **better-sqlite3** (synchronous, fast, zero-config) + FTS5
  - Push: Web Push (VAPID)
- **Desktop:** Electron wrapper (optional)

**Explicitly NOT Next.js:** the server is a long-lived stateful process holding
persistent TCP sockets and a WebSocket hub (anti-pattern for Next's
request/response, serverless-leaning model), and the client is a private,
real-time, personalized SPA where SSR/SEO add nothing.

**Licensing:** all chosen dependencies are MIT/Apache/ISC (permissive). Avoid
soju (AGPL, archived Apr 2026), gamja (AGPL), ObsidianIRC (GPL-3) as code bases —
study only. The Lounge (MIT) and Kiwi IRC (Apache-2.0) are safe references.

## 5. Data Model

SQLite (`beacon.db`) via better-sqlite3, with FTS5. Every query filters by
`user_id`; users are fully isolated.

```
users        (id, username, password_hash, role, created_at, settings_json)
networks     (id, user_id, name, host, port, tls, sasl_*, nick, enabled)
channels     (id, network_id, name, joined, last_read_msgid, notify_level)
messages     (id, network_id, target, msgid, sender, type, body, tags_json, ts)
             └─ FTS5 virtual table over (body, sender, target) for search
attachments  (id, message_id, url, mime, thumb_url, meta_json)
reactions    (id, message_id, emoji, sender, ts)          # IRCv3 +draft/react
push_subs    (id, user_id, endpoint, keys_json, device_label)
sessions     (id, user_id, token_hash, device, last_seen)
```

Full history retained, with admin-configurable retention.

## 6. Message Flows

### Incoming message
```
1. IRC Engine receives PRIVMSG (IRCv3 tags: msgid, server-time, account)
2. Normalize → internal Message (parse mIRC codes via irc-formatting)
3. History Store: INSERT into messages + FTS index (persisted immediately)
4. Sync Gateway: fan-out "message" event to all of the user's active devices (WS)
5. If no active device OR it's a highlight/mention/DM:
      → Push Service sends Web Push (VAPID) → phone notification
6. Client: react-virtuoso appends; auto-scroll if pinned to bottom
```

### Outgoing message (optimistic echo)
```
1. Enter → client shows the message INSTANTLY (pending, greyed)
2. WS → server → IRC Engine sends PRIVMSG with label (labeled-response)
3. echo-message returns the message with its real msgid
4. Confirm to client → "delivered" (msgid anchored for replies/reactions)
5. On failure → "failed" marker with retry (never silently lose a message)
```

### WebSocket protocol
Typed events shared in `packages/shared`: `message`, `presence`, `typing`,
`reaction`, `read`, `history_batch`, `network_state`, `error`. One TypeScript
source of truth for both ends.

### Read-state
Read markers sync cross-device: opening a channel on the phone marks it read on
the laptop too. This is the "modern feel" missing across current clients.

## 7. Push & iOS Strategy

The #1 unmet market need. iOS supports Web Push **only on 16.4+ and only for an
installed ("Add to Home Screen") PWA** — hence the client is a PWA from the
ground up, not optionally.

Flow: user installs bool to home screen → grants permission → client registers
a VAPID `push_subscription` with the server → server pushes on mention/DM when no
device is active. This is exactly what The Lounge cannot do, and the top reason
people pay for IRCCloud. Electron desktop uses native notifications separately.

## 8. IRCv3 Capabilities & Graceful Degradation

| Category | Caps | Strategy |
|---|---|---|
| Foundation (stable) | `message-tags`, `server-time`, `msgid`, `batch`, `labeled-response`, `echo-message`, `account-tag`, `away-notify`, `SASL` | Always request. All supported on Libera. |
| History | `draft/chathistory` | Request if offered, but **assume absent** (Libera doesn't serve it) → history comes from **our** store. |
| Rich UX (draft) | `+typing`, `+draft/react`, `+draft/reply`, `draft/message-redaction`, `draft/multiline` | Render natively where supported; degrade cleanly where not. |

**Golden rule — graceful degradation.** Every modern feature checks support first:
- **Reactions:** native emoji if `+draft/react`; else fall back to a normal message.
- **Typing:** if `+typing` not advertised, simply don't show the indicator (no error).
- **Replies:** anchored on `msgid`; if absent, degrade to a text quote.
- **mIRC formatting:** always parsed; user can toggle to plain text.

**Resilience:** reconnect with exponential backoff, cap re-negotiation, SASL
re-auth, replay from store on reconnect, correct nick-in-use handling (avoid The
Lounge's nick-counter/client-cert bug).

## 9. UX / Design Study (Priority #1)

Design quality is the top priority. Before serious UI implementation, produce a
distinctive design system (avoiding generic "AI aesthetic") using the
frontend-design skill. The study covers:

- **Density:** compact by default (fixes the #1 The Lounge complaint about wasted
  whitespace) with a genuine density toggle (Comfortable/Compact) — not hidden
  CSS hacking.
- **Layout:** three-pane (network/channel sidebar · message list · optional
  member/context pane), collapsible, responsive down to mobile.
- **Design language:** own identity, fluid Telegram-grade motion (animation that
  communicates state, not decoration), dark + light + custom themes.
- **Cmd-K palette:** unifies channel/network/DM jumping + all actions +
  `/commands`, with inline teachable shortcuts.
- **Search UI ("like Slack"):** global search bar, results with context, filters
  (`in:#channel`, `from:user`, before/after), jump-to-message with permalink.
- **Deliverable:** mockups of key components + design tokens, visually reviewed
  before full implementation.

## 10. Testing Strategy

TDD where it fits.
- **Server:** unit tests for IRC Engine (parsing, cap negotiation, reconnect),
  History Store (insert/search/retention), Sync fan-out, Push. Integration tests
  against a test ircd (Ergo in Docker) — real connect, SASL, chathistory.
- **Shared:** contract tests on the WS protocol types.
- **Client:** unit tests on Zustand stores, component tests on message rendering
  (mIRC codes, media, reactions), and Playwright e2e on critical flows: login →
  connect → join → send → search.

## 11. Security

The instance is internet-facing and multi-user, so security is a first-class
concern, not an afterthought.

- **Passwords:** hashed with **argon2id** (never plaintext/fast hashes).
- **Login hardening:** rate limiting + exponential backoff on failed logins;
  optional lockout; generic error messages (no user-enumeration).
- **Sessions:** `httpOnly` + `Secure` + `SameSite` cookies (or short-lived
  tokens with rotation); server-side session revocation; per-device sessions.
- **Secrets at rest:** IRC/SASL/network passwords and push keys stored
  **encrypted at rest** (key from env/keyfile, not in the DB in plaintext).
- **Transport:** TLS everywhere; enforce HTTPS; secure WebSocket (`wss://`).
  Ship guidance for a reverse proxy (Caddy/nginx) with automatic certs.
- **Web hardening:** strict CSP, CSRF protection on state-changing REST calls,
  security headers (HSTS, X-Content-Type-Options, etc.).
- **Per-user isolation:** every query and every WS event is scoped to the
  authenticated `user_id`; no cross-user data leakage. Admin actions gated by role.
- **Upload safety:** validate MIME/size, strip EXIF, isolate served media,
  never execute uploads; server-side link-preview fetch avoids leaking client IPs
  and guards against SSRF (block internal address ranges).
- **First-run:** no default credentials; admin account created on first launch;
  optional invite-only registration.

## 12. Key Risks

- Draft IRCv3 specs (react/reply/redaction/multiline) may change → isolate behind
  our own abstraction; expect churn.
- Public networks (esp. Libera) cap how "rich" we can be: history, sync, push,
  and file hosting are deliverable there; reactions/typing/replies mostly are not
  yet. Be honest in-product about where features light up.
- Addressable market is a niche quality play (Libera ~131k registered, ~30k
  concurrent), not a mass-market land grab.
