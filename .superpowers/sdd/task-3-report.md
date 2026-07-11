# Task 3 Report: Client PWA — manifest, service worker, icons

## Status
DONE

## Commit
TBD (written below after commit)

## Icon generation method
Pure Node.js raw PNG construction using only built-in modules (`node:zlib` deflate, `node:fs`). No native dependencies (sharp/canvas) were required. The script (`packages/client/scripts/gen-icons.mjs`) draws a phosphor-green (#39e08b) stylised "b" letterform on a near-black (#0a0c0d) background by computing glyph pixels mathematically (vertical stem + bowl arc using distance fields). Valid RGB 8-bit non-interlaced PNGs confirmed by `file(1)`.

## Files created / modified
- `packages/client/vite.config.ts` — added VitePWA plugin with `injectManifest` strategy, disabled during VITEST via `process.env.VITEST` guard
- `packages/client/src/sw.ts` — custom service worker: precache, push listener, notificationclick listener
- `packages/client/src/push-payload.ts` — pure `parsePushPayload` helper (unit-testable, no SW/DOM context)
- `packages/client/src/push-payload.test.ts` — 3 unit tests (valid JSON, malformed, undefined)
- `packages/client/src/vite-env.d.ts` — triple-slash refs for `vite/client` and `vite-plugin-pwa/client`
- `packages/client/src/main.tsx` — added `registerSW({ immediate: true })` from virtual:pwa-register
- `packages/client/index.html` — added `<meta name="theme-color" content="#0a0c0d">`
- `packages/client/public/icon-192.png` — 192×192 valid PNG
- `packages/client/public/icon-512.png` — 512×512 valid PNG
- `packages/client/public/icon-maskable-512.png` — 512×512 valid PNG (purpose: maskable, tighter safe zone)
- `packages/client/scripts/gen-icons.mjs` — icon generation script
- `packages/client/package.json` — added devDeps: `vite-plugin-pwa`, `workbox-precaching`, `workbox-window`
- `pnpm-lock.yaml` — updated

## Build output (`pnpm --filter @bool/client build`)
```
dist/manifest.webmanifest     0.43 kB
dist/sw.js                   (emitted by PWA plugin, Workbox precache injected)
dist/assets/workbox-window.prod.es5-*.js
dist/assets/index-*.css
dist/assets/index-*.js
dist/icon-192.png
dist/icon-512.png
dist/icon-maskable-512.png
dist/index.html
```
- `dist/sw.js` — confirmed present
- `dist/manifest.webmanifest` — confirmed present

## Test summary
- 3 new tests in `push-payload.test.ts` (parsePushPayload): all PASS
- Pre-existing `SearchPanel > shows result count when results are present` was ALREADY FAILING before this task (verified by git stash). All other 151 tests pass.
- Total: 18 test files, 152 tests (151 pass, 1 pre-existing failure)

## Typecheck
Clean — no errors.

## Concerns
- The pre-existing SearchPanel test failure (`getByText(/2/)` matches multiple elements at runtime timestamps containing "2") is not caused by our changes.
- `workbox-window` needed to be added explicitly as a dev dep (not pulled in by vite-plugin-pwa in this lockfile version).
- The icons are minimal programmatic PNGs — functional and on-brand but not polished vector art. Can be replaced with designer assets at any time (same filenames).
