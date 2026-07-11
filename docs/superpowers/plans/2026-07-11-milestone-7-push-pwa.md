# bool — Milestone 7: Push Notifications + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver **working Web Push** (VAPID) for mentions and DMs — the market's #1 unmet need and the actual wedge, since The Lounge is *already* an installable PWA but ships **no push pipeline** (its docs state iOS push is unsupported). The differentiator is the server-side push infrastructure (Tasks 1–2) + the subscribe flow (Task 4); the PWA shell (Task 3) is just table-stakes delivery plumbing — required because iOS 16.4+ only allows Web Push from an *installed* PWA, and bool is not yet installable (M5 shipped a plain SPA, no manifest/service worker).

**Architecture:** The client becomes an installable PWA (manifest + service worker via `vite-plugin-pwa` injectManifest). A user grants notification permission and subscribes via the browser `PushManager` with the server's VAPID public key; the subscription is POSTed to a session-gated REST endpoint and stored per user in a `push_subs` table. When the always-on server relays an IRC message that is a **mention** (the user's current nick, word-boundary) or a **DM** and the user has **no active WebSocket** (they're away), it sends a Web Push (via the `web-push` library) to that user's subscriptions; dead subscriptions (410/404) are pruned. The service worker shows the notification and, on click, focuses/opens the app at the relevant channel. Secrets (VAPID private key) live server-side only.

**Tech Stack (added):** `web-push` (server, VAPID + send), `vite-plugin-pwa` + `workbox-precaching` (client PWA/SW).

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM. Node `>=20`.
- **iOS reality:** Web Push on iOS works ONLY on 16.4+ and ONLY for an **installed** ("Add to Home Screen") PWA. So the PWA install path is not optional — it is the delivery mechanism. The UI should guide install where the platform requires it.
- **Secrets server-side only:** the VAPID **private** key is env-only, never sent to the client. The client gets only the VAPID **public** key.
- **Per-user isolation:** subscriptions are stored and queried by `session.user.id`; a push for a user goes only to that user's subscriptions.
- **Don't double-notify:** push for a mention/DM fires only when the user has **no active WebSocket** (checked via the Hub's `subscriberCount(userId) === 0`). An open app already shows the message live.
- **Graceful absence:** if VAPID keys are not configured, push is a no-op (logged once) and nothing breaks; the client hides the notifications toggle when the browser lacks push support.
- **Testability:** the server push sender is injectable (a fake in tests — no real network); the client push-subscription logic is tested against mocked `Notification`/`serviceWorker`/`PushManager`. Service-worker runtime code is not unit-tested (jsdom can't run it) — kept minimal and verified structurally.

---

### Task 1: Server — VAPID config, subscription store, REST endpoints

**Files:** Create `packages/server/src/push.ts`; Modify `packages/server/src/schema.ts` (push_subs table), `packages/server/src/app.ts`/a new `packages/server/src/push-routes.ts` (register routes), `packages/server/package.json` (add `web-push`), `packages/server/.env.example`; Test `packages/server/src/push.test.ts`, `packages/server/src/push-routes.test.ts`.

**Interfaces (produces):**
- `push_subs(id, user_id, endpoint UNIQUE, keys_json, created_at)` in `ensureAppSchema` (+ idempotent, per-user index).
- `push.ts`: `isPushConfigured(): boolean` (VAPID env present); `savePushSubscription(userId, sub)` (upsert by endpoint); `removePushSubscription(userId, endpoint)`; `sendPushToUser(userId, payload, sender?)` — loads the user's subs, sends each via the injectable `sender` (default: `web-push`.sendNotification with VAPID details), and **prunes** a subscription when the sender reports 404/410 (gone); returns the count sent. `vapidPublicKey(): string | null`.
- `push-routes.ts` `registerPush(app)`: session-gated `GET /api/push/vapid` → `{ key }` (public key or 404 when unconfigured); `POST /api/push/subscribe` (body = a PushSubscription JSON) → save; `POST /api/push/unsubscribe` (body `{ endpoint }`) → remove. All use `getSessionFromHeaders`.

- [ ] Steps: `push.test.ts` (with VAPID env set in the test: `savePushSubscription` then `sendPushToUser` calls the injected sender once per sub with the payload; a sender that throws a `{ statusCode: 410 }` prunes that sub so the next send skips it; `isPushConfigured` false when env missing) and `push-routes.test.ts` (unauth `POST /api/push/subscribe` → 401; authed subscribe stores a row for that user; `GET /api/push/vapid` returns the key) → RED → implement → GREEN. Add `BOOL_VAPID_PUBLIC`/`BOOL_VAPID_PRIVATE`/`BOOL_VAPID_SUBJECT` to `.env.example` with a note to generate via `npx web-push generate-vapid-keys`. Keep all prior server tests green. Commit `feat(server): VAPID web-push subscription store + REST endpoints`.

> Implementer note: set VAPID details once at module load from env (guarded by `isPushConfigured`). `web-push` `sendNotification` rejects with an error carrying `statusCode`; treat 404 and 410 as "gone" → prune.

---

### Task 2: Server — push trigger on mention / DM when the user is away

**Files:** Create `packages/server/src/notifier.ts`; Modify `packages/server/src/irc/manager.ts` (call the notifier from the persisting sink), `packages/server/src/irc/connection.ts` if the current nick isn't already available to the manager; Test `packages/server/src/notifier.test.ts`.

**Interfaces (produces):**
- `notifier.ts`: `maybeNotify(userId, msg, ctx)` where `msg` is the relayed `chat:msg` `ServerMessage`, and `ctx` provides `selfNick` (the user's current nick on that network) and `activeSockets` (a count) and a `send` fn (default `sendPushToUser`). It fires a push when: the message is not `self`, AND (`kind==='privmsg'` and `target===selfNick` → a DM) OR (the body contains `selfNick` as a word, case-insensitive → a mention); AND `activeSockets === 0`. Payload: `{ title, body, tag, data: { networkId, target } }` (title = DM sender or `#channel`, body = the message text truncated).
- `IrcManager.connectNetwork` persisting sink calls `maybeNotify(userId, msg, { selfNick: conn.currentNick(), activeSockets: this.hub.subscriberCount(userId), send: sendPushToUser })` for each relayed `chat:msg` (after persisting, alongside `hub.publish`). Guard the whole call in try/catch so a notify failure never breaks relay/persistence.

- [ ] Steps: `notifier.test.ts` (a DM to selfNick with 0 active sockets → the injected send is called with a DM payload; a channel message mentioning selfNick as a word with 0 sockets → called with a mention payload; the same with `activeSockets > 0` → NOT called; a `self` message → NOT called; a channel message NOT mentioning the nick → NOT called; a substring-but-not-word match like `selfNickington` → NOT called) → RED → implement → GREEN. Wire into the manager. Keep prior tests green. Commit `feat(server): push on mention/DM when the user has no active socket`.

---

### Task 3: Client — PWA (manifest, service worker, icons, registration)

**Files:** Modify `packages/client/vite.config.ts` (add `vite-plugin-pwa`), `packages/client/package.json` (`vite-plugin-pwa`, `workbox-precaching` dev deps), `packages/client/index.html` (theme-color meta); Create `packages/client/src/sw.ts` (custom service worker), `packages/client/public/manifest.webmanifest` (or via the plugin), icon assets `packages/client/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`; Modify `packages/client/src/main.tsx` (register the SW). Test `packages/client/src/sw-payload.test.ts` (pure-function part only).

**Interfaces (produces):**
- `vite-plugin-pwa` configured with `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `registerType: 'autoUpdate'`, and a `manifest` (name "bool", short_name "bool", display "standalone", background/theme color from Direction A `#0a0c0d`/`#39e08b`, icons incl. a maskable one).
- `src/sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)` (Workbox injects the precache list); a `push` listener that parses `event.data?.json()` into `{ title, body, tag, data }` and `showNotification(title, { body, tag, data, icon, badge })`; a `notificationclick` listener that `clients.openWindow('/')` or focuses an existing client and posts the `data` (channel to open). Factor the payload parsing into a small pure helper `parsePushPayload(raw)` that IS unit-tested.
- Icons: simple on-brand icons (a phosphor-green "b" wordmark on the near-black ground). Generate minimal valid PNGs (a script or a committed asset) at 192/512 + a maskable 512.
- `main.tsx` registers the service worker (the plugin's `registerSW`), guarded to no-op where unsupported.

- [ ] Steps: write `sw-payload.test.ts` for `parsePushPayload` (valid JSON → object; malformed → a safe default `{ title:'bool', body:'' }`) → RED → implement the SW + config + icons + registration → GREEN (`pnpm --filter @bool/client test`). Build the client (`pnpm --filter @bool/client build`) and confirm the plugin emits `sw.js` + `manifest.webmanifest` into `dist` (note it in the report). `typecheck` clean. Commit `feat(client): installable PWA — manifest, service worker, icons`.

> Implementer note: the SW runs in a worker context (`self` is a `ServiceWorkerGlobalScope`) — add the workbox/SW types via a triple-slash `/// <reference lib="webworker" />` and keep the SW out of the app tsconfig's DOM assumptions if needed. Only `parsePushPayload` is unit-tested; the listeners are structural.

---

### Task 4: Client — notification permission + push subscription flow + UI

**Files:** Create `packages/client/src/push-client.ts`, `packages/client/src/components/NotificationsToggle.tsx`; Modify `AppearanceMenu.tsx` or `NetworkSettings.tsx`/`AppShell` to surface the toggle; Test `packages/client/src/push-client.test.ts`, `packages/client/src/components/NotificationsToggle.test.tsx`.

**Interfaces (produces):**
- `push-client.ts`: `pushSupported(): boolean` (`'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`); `notificationState(): 'unsupported'|'default'|'granted'|'denied'`; `enablePush(): Promise<boolean>` — requests `Notification.requestPermission()`, fetches `GET /api/push/vapid`, `registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(key) })`, POSTs the subscription JSON to `/api/push/subscribe` (credentials: same-origin); `disablePush(): Promise<void>` — unsubscribes locally and POSTs `/api/push/unsubscribe` with the endpoint. Injects `deps` (fetch, the SW registration, Notification, PushManager) so it's testable. Include the `urlBase64ToUint8Array` helper.
- `NotificationsToggle.tsx`: reads `notificationState()`; renders "Enable notifications" (calls `enablePush`), "Notifications on" (calls `disablePush`), a "Blocked — enable in browser settings" hint when `denied`, and nothing when `unsupported`. Surface it in the appearance/settings menu.

- [ ] Steps: `push-client.test.ts` (inject fakes: `pushSupported` true; `enablePush` with `Notification.requestPermission` resolving 'granted' → fetches vapid, subscribes, POSTs the subscription to `/api/push/subscribe`; permission 'denied' → returns false without subscribing; `urlBase64ToUint8Array` round-trips a known key) and `NotificationsToggle.test.tsx` (state 'default' → shows Enable and clicking calls enablePush; 'granted' → shows on + disable; 'denied' → shows the blocked hint; 'unsupported' → renders nothing) → RED → implement → GREEN. Run `pnpm -r test` + `pnpm -r typecheck` green. Commit `feat(client): notification permission + push subscription flow + toggle`.

---

## Self-Review

**Spec coverage (Milestone 7 = "Web Push incl. iOS PWA"):** installable PWA (manifest + SW) ✓ Task 3; VAPID subscription store + endpoints ✓ Task 1; push on mention/DM when away ✓ Task 2; permission + subscribe UI ✓ Task 4; iOS-installed-PWA delivery path ✓ Task 3 (manifest/standalone) + Task 4 (guidance). Secrets server-side ✓ Task 1. Per-user isolation ✓ Tasks 1–2. No double-notify ✓ Task 2 (subscriberCount gate). Graceful when unconfigured/unsupported ✓ Tasks 1, 4.

**Placeholder scan:** the injectable-sender pattern (server) and injected-deps pattern (client) make every network/browser boundary testable without real infra; the SW's only untested part is the listener glue (documented). Icons are a concrete deliverable, not a TBD.

**Type consistency:** `sendPushToUser`/`savePushSubscription`/`removePushSubscription`/`isPushConfigured`/`vapidPublicKey` (Task 1) consumed by `notifier.ts` (Task 2) and the routes; `maybeNotify` (Task 2) called by the manager; `parsePushPayload` (Task 3) shared shape `{title,body,tag,data}` matches the notifier payload (Task 2) and the push-client is the producer side (Task 4). The push payload shape is the contract across server-send and SW-receive.

**Known risks (call out during execution):** (1) service workers + push cannot run in jsdom — only pure helpers are unit-tested; real end-to-end push needs a real browser + HTTPS (localhost is treated as secure) — worth a manual check. (2) iOS requires the installed PWA; test the toggle's guidance copy. (3) VAPID `applicationServerKey` must be the base64url public key decoded to a Uint8Array — the helper is unit-tested.

## Execution Handoff

Executed subagent-driven like Milestones 0–6. A real end-to-end push verification (install the PWA, enable notifications, trigger a mention while the tab is closed) is a manual step worth doing on a real device/browser after Task 4. Remaining after this: the **Media milestone** (uploads + link previews) and **Milestone 8 (Electron)** (native desktop notifications there are separate from Web Push).
