# bool — Milestone 8: Electron Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an optional native desktop app (`@bool/desktop`) that wraps the bool web client in an Electron window connected to a user-configured self-hosted server, adding the native integrations a browser tab can't: a system tray, minimize-to-tray, native OS notifications for mentions/DMs, an unread badge, launch-at-login, single-instance, and safe external-link handling.

**Architecture:** The desktop app is a thin native shell. Electron's main process opens a `BrowserWindow` that loads the bool client directly from a user-configured **server URL** (the server already serves the built client + API + WS same-origin, so the desktop always matches the server version — no client bundling/versioning). All *testable* logic (config load/save + URL validation, window-state clamping/persistence, notification payload building, badge/tray state, login-item settings shape) lives in **electron-free modules** that are unit-tested; the thin `main.ts`/`preload.ts` that import `electron` are structural glue (not unit-tested, same pattern as the service worker). A minimal preload bridges renderer→main IPC for mention notifications and badge updates. Native OS notifications also work via the renderer's Web Notification API (Electron surfaces them), so the existing client notification flow keeps working; the IPC path is for tray/badge and background reliability.

**Tech Stack (added):** `electron` (dev/runtime), `electron-builder` (packaging config). No new runtime deps in the shared/server/client packages.

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM where the toolchain allows (Electron main is CommonJS-friendly; use the package's own tsconfig — do NOT force NodeNext ESM if it fights Electron; target what Electron runs). Node `>=20`.
- **New package `packages/desktop`** — it does NOT change server/client/shared behavior; it only wraps the existing served client.
- **Testable logic is electron-free.** Any module a test imports must NOT `import 'electron'` (it's unavailable in vitest). The electron glue imports the pure modules; the glue itself is verified by typecheck/build, not unit tests.
- **Security (Electron hardening):** `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration: false`, a `preload` exposing only a minimal, typed IPC surface via `contextBridge`; `webSecurity` on; navigation is restricted to the configured server origin (block navigation elsewhere; open external links in the OS browser via `shell.openExternal`); validate the server URL (http/https only) before loading.
- **Single instance:** `app.requestSingleInstanceLock()` — a second launch focuses the existing window.
- **Config** is stored in the Electron `userData` dir as JSON (no native `electron-store` dep needed — a tiny fs-based store keeps it testable).
- Packaging is config-ready (`electron-builder`) but a full platform build/run needs a desktop environment — that is a manual step, noted.

---

### Task 1: Desktop scaffold + main window + config (electron-free helpers tested)

**Files:**
- Create: `packages/desktop/package.json`, `packages/desktop/tsconfig.json`, `packages/desktop/vitest.config.ts`
- Create: `packages/desktop/src/config.ts` (electron-free), `packages/desktop/src/url.ts` (electron-free)
- Create: `packages/desktop/src/main.ts`, `packages/desktop/src/preload.ts` (electron glue)
- Create: `packages/desktop/src/index.html` (the first-run "enter your bool server URL" screen, shown when no server is configured)
- Test: `packages/desktop/src/config.test.ts`, `packages/desktop/src/url.test.ts`

**Interfaces (produces):**
- `url.ts`: `isValidServerUrl(raw: string): boolean` (http/https, has a host, no obviously-bad input); `normalizeServerUrl(raw: string): string` (trim, ensure a scheme, strip a trailing slash). Pure.
- `config.ts`: `loadConfig(dir: string, fs?): { serverUrl: string | null }` (reads `<dir>/config.json`, returns `{serverUrl:null}` if missing/malformed); `saveConfig(dir: string, cfg, fs?): void`. Injectable `fs` (default `node:fs`) so tests use a temp dir / fake. Pure of electron.
- `main.ts` (glue): on `app.whenReady`, acquire the single-instance lock (quit if not primary; on `second-instance` focus the window); load config; if `serverUrl` is set and valid → create a hardened `BrowserWindow` loading it; else load the local `index.html` first-run screen (which posts the entered URL via IPC → validate → `saveConfig` → load it). Restrict navigation to the server origin; route external links through `shell.openExternal`. `preload.ts` exposes `contextBridge` `bool.setServerUrl(url)` / `bool.getServerUrl()` (and, later, notification/badge IPC).

- [ ] Steps: `url.test.ts` (`isValidServerUrl` true for `https://irc.example.com`, `http://localhost:3030`; false for `''`, `ftp://x`, `javascript:...`, `not a url`; `normalizeServerUrl` adds `https://` to a bare host, trims, strips trailing slash) and `config.test.ts` (save then load round-trips in a temp dir; load of a missing/garbage file → `{serverUrl:null}`) → RED → implement the pure helpers + the electron glue + first-run html → GREEN (`pnpm --filter @bool/desktop test`). Add `electron` as a devDependency; `pnpm --filter @bool/desktop typecheck` (compile main/preload against electron types). Commit `feat(desktop): Electron scaffold — hardened window, server-URL config`.

> Implementer note: keep `main.ts`/`preload.ts` free of any non-electron logic that a test would want to cover — all such logic goes in `config.ts`/`url.ts`. The package's tsconfig should compile the electron glue but the vitest config should only include the `*.test.ts` for the pure modules.

---

### Task 2: Tray, window-state persistence, minimize-to-tray, external links

**Files:**
- Create: `packages/desktop/src/window-state.ts` (electron-free), `packages/desktop/src/tray.ts` (glue), a tray icon asset `packages/desktop/assets/tray.png`
- Modify: `packages/desktop/src/main.ts` (wire tray + window-state + close-to-tray + external-link policy)
- Test: `packages/desktop/src/window-state.test.ts`

**Interfaces (produces):**
- `window-state.ts`: `sanitizeBounds(saved, workArea): { x, y, width, height }` — clamps a saved window bounds to a visible display work-area (so a window saved on a now-disconnected monitor doesn't open off-screen), applies sane min/default sizes; `loadWindowState(dir, fs?)` / `saveWindowState(dir, bounds, fs?)` (JSON in userData, injectable fs). Pure.
- `tray.ts` (glue): `createTray(win, { onShow, onQuit })` — a tray icon with a context menu (Show bool / Quit) and click-to-toggle; exposes `setUnread(count)` for Task 3.
- `main.ts` (glue): restore window bounds via `sanitizeBounds` on create, persist on move/resize (debounced) and on close; on window `close`, hide to tray instead of quitting (unless the app is really quitting); external links + non-origin navigation → `shell.openExternal`.

- [ ] Steps: `window-state.test.ts` (`sanitizeBounds` keeps an on-screen window; a window saved off the work-area is moved back on-screen; a too-small size is bumped to the min; save/load round-trips) → RED → implement `window-state.ts` + `tray.ts` + wire `main.ts` → GREEN. `typecheck` clean. Commit `feat(desktop): tray, minimize-to-tray, window-state persistence, external links`.

---

### Task 3: Native mention notifications, unread badge, launch-at-login + packaging config

**Files:**
- Create: `packages/desktop/src/notify.ts` (electron-free), `packages/desktop/src/autostart.ts` (electron-free settings shape)
- Modify: `packages/desktop/src/main.ts` + `preload.ts` (IPC for notifications/badge; login-item), `packages/desktop/package.json` (electron-builder config + scripts)
- Create: `packages/desktop/README.md`
- Test: `packages/desktop/src/notify.test.ts`, `packages/desktop/src/autostart.test.ts`

**Interfaces (produces):**
- `notify.ts`: `buildNotification(payload: { title, body, tag?, data? }): { title, body }` — sanitizes/truncates the title+body for an OS notification from a mention/DM payload (the same `{title,body,tag,data}` shape M7 already uses); `shouldNotify(state): boolean` (e.g. don't notify when the window is focused). Pure.
- `autostart.ts`: `loginItemSettings(enabled: boolean): { openAtLogin: boolean; openAsHidden: boolean }` — the exact shape passed to `app.setLoginItemSettings`; `readAutostart(dir, fs?)` / `writeAutostart(dir, enabled, fs?)` (persist the preference). Pure.
- `main.ts` + `preload.ts` (glue): a `contextBridge` `bool.notify(payload)` and `bool.setBadge(count)` IPC — the renderer (bool client) can post a mention notification and an unread count; main shows an Electron `Notification` (via `buildNotification`, gated by `shouldNotify`) and sets `app.badgeCount` / the tray unread. On notification click, focus/restore the window. Apply `setLoginItemSettings(loginItemSettings(enabled))` from the persisted preference; expose toggling it via IPC. Add `electron-builder` config (appId, product name "bool", mac/win/linux targets, icons) + `dist`/`pack` scripts to `package.json`.
- `README.md`: how to run in dev (`pnpm --filter @bool/desktop dev` → electron loads, enter the server URL), how to build a package, and the note that a real packaged run needs a desktop OS.

- [ ] Steps: `notify.test.ts` (`buildNotification` truncates a long body, keeps the title, handles missing fields; `shouldNotify` false when focused, true when not) and `autostart.test.ts` (`loginItemSettings(true)` → `{openAtLogin:true,...}`; `false` → openAtLogin false; read/write round-trips) → RED → implement the pure helpers + wire the IPC/glue + electron-builder config + README → GREEN. Run `pnpm --filter @bool/desktop test` + `pnpm -r typecheck` (the desktop package compiles). Verify the main/preload at least build via `tsc` (note that launching Electron needs a display — manual). Commit `feat(desktop): native mention notifications, unread badge, launch-at-login, packaging`.

---

## Self-Review

**Spec coverage (Milestone 8 = "Electron desktop wrapper: tray, native notifications, auto-start"):** native shell loading the client ✓ Task 1; tray + minimize-to-tray ✓ Task 2; window-state persistence ✓ Task 2; native mention notifications ✓ Task 3; unread badge ✓ Task 3; launch-at-login ✓ Task 3; single-instance + hardened window + external-link safety ✓ Tasks 1–2; server-URL config (no client bundling) ✓ Task 1. Packaging is `electron-builder`-config-ready ✓ Task 3 (a real build/run is a manual desktop step — noted).

**Placeholder scan:** every network/OS boundary that a test needs is in an electron-free module (`config`/`url`/`window-state`/`notify`/`autostart`) with injectable `fs`; the electron glue is thin and verified by typecheck/build. Not a TBD — the split is explicit.

**Type consistency:** `isValidServerUrl`/`normalizeServerUrl` (Task 1) gate the URL used by `main.ts` and the config; `loadConfig`/`saveConfig` (Task 1) + `loadWindowState`/`sanitizeBounds` (Task 2) + `buildNotification`/`shouldNotify` + `loginItemSettings` (Task 3) are consumed by the glue with identical signatures. The notification payload shape reuses M7's `{title,body,tag,data}`.

**Known risks (call out during execution):** (1) Electron main can't be unit-tested in vitest — keep logic in electron-free modules; the glue is structural. (2) A real end-to-end (launch the app, enter a server URL, get a tray + native notification) needs a desktop OS and is a manual verification. (3) Electron's module system (CJS vs ESM) can fight the monorepo's NodeNext ESM — give `packages/desktop` its own tsconfig targeting what Electron runs, and don't let it break `pnpm -r typecheck`/`-r test` for the other packages.

## Execution Handoff

Executed subagent-driven like the prior milestones. This is the last roadmap milestone. A manual desktop verification (build/run the Electron app against a live bool server) is worth doing after Task 3. Remaining open follow-ups (not this milestone): uploaded-media inline-render wiring, reaction persistence, EXIF-strip, real-device push E2E, and assorted polish.
