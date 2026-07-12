# bool — Milestone: Media (uploads, inline images, link previews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the chat experience with media: authenticated file uploads served back by the server, inline image rendering, and **server-side link preview cards** — fetched by the server (so clients never leak their IP to arbitrary sites) behind a strict **SSRF guard**.

**Architecture:** A session-gated multipart upload endpoint stores files per user (validated MIME/size, random unguessable id) in a `media` table + a media directory, and serves them back only to authenticated users. When the IRC engine relays a message containing a URL, the server fetches an OpenGraph/`<title>` preview **once** (cached in `link_previews`), behind an SSRF guard that resolves the host, rejects private/loopback/link-local/reserved IP ranges (re-checking on every redirect), and caps size/time/redirects — then fans a `preview:result` to the user's sockets. The client renders inline images (image URLs / uploaded media) and preview cards, and the composer uploads files (picker + drag-drop) and inserts the media URL into the message. The link-preview fetcher is the security-critical component and is specified defensively.

**Tech Stack (added):** `@fastify/multipart` (server uploads). Link-preview HTML parsing is a small hand-rolled meta-tag extractor (no heavy HTML-parser dependency). No image-processing dep (EXIF-strip is a noted follow-up).

## Global Constraints

- ENGLISH only. pnpm workspaces only. ESM. Node `>=20`.
- **SSRF is the #1 risk.** The link-preview fetcher MUST: allow only `http`/`https`; resolve the hostname and REJECT any resolved address in a private/loopback/link-local/reserved range (IPv4 `10/8`,`172.16/12`,`192.168/16`,`127/8`,`169.254/16`,`0/8`,`100.64/10`; IPv6 `::1`,`fc00::/7`,`fe80::/10`, IPv4-mapped `::ffff:*` private, unspecified `::`); pin the fetch to the validated IP (custom `lookup`) so DNS-rebinding can't swap it; follow at most 3 redirects, **re-validating each redirect target's host+IP**; cap the response body (e.g. 512 KB) and total time (e.g. 5 s); send a bounded `Range`/read and a bool User-Agent. Never fetch a URL a check hasn't cleared.
- **Upload safety:** validate declared MIME against an allowlist (images + a few doc types), cap size (e.g. 10 MB), generate a random id (not the user's filename) for the stored path, never serve with an executable content-type, set `Content-Disposition` appropriately, and serve `X-Content-Type-Options: nosniff`. Media rows are owned by `user_id`.
- **Per-user isolation:** uploads store the session `user.id`; previews are fanned only to the requesting user's sockets; the media serve route requires an authenticated session.
- **Graceful degradation:** if a preview fetch fails/blocked/times out, no card is shown (no error to the user); uploads that exceed limits return a clean 4xx.
- **Protocol source of truth is `@bool/shared`** — new preview message(s), `PROTOCOL_VERSION` bumped to `6`.

---

### Task 1: Protocol v6 — link preview message

**Files:** Modify `packages/shared/src/protocol.ts`; Test `packages/shared/src/protocol-media.test.ts`; update the `PROTOCOL_VERSION` assertions in the other protocol tests to 6.

**Interfaces (produces):**
- Server→client: `{ type:'preview:result', url:string, ok:boolean, title?:string, description?:string, image?:string, siteName?:string }` (ok=false when blocked/failed — the client shows nothing).
- (Uploads are plain REST, not a protocol message.)
- `PROTOCOL_VERSION = 6`.

- [ ] Steps: `protocol-media.test.ts` (version is 6; `preview:result` parses with ok+optional fields; ok:false parses) + bump the version assertions in `protocol-history/irc/read/rich` tests to 6 → RED → add `previewResultSchema` to `serverMessageSchema`, bump version → GREEN + typecheck. Commit `feat(shared): protocol v6 — link preview result`.

---

### Task 2: Server — authenticated file upload + media serving

**Files:** Create `packages/server/src/media.ts`, `packages/server/src/media-routes.ts`; Modify `schema.ts` (media table), `app.ts` (register), `package.json` (`@fastify/multipart`), `.env.example` (`BOOL_MEDIA_DIR`); Test `packages/server/src/media-routes.test.ts`.

**Interfaces (produces):**
- `media(id TEXT PK, user_id TEXT, filename TEXT, mime TEXT, size INTEGER, created_at INTEGER)` in `ensureAppSchema`. Files stored on disk under `process.env.BOOL_MEDIA_DIR ?? './media'` named by the random id.
- `media.ts`: `ALLOWED_MIME` (allowlist: `image/png|jpeg|gif|webp`, `application/pdf`, `text/plain`); `MAX_UPLOAD_BYTES` (10 MB); `saveMedia(userId, { filename, mime, bytes }): { id, url }` (validates mime+size, random id, writes file, inserts row) — throws a typed error on violation; `getMedia(id): { userId, filename, mime, size, path } | null`.
- `media-routes.ts` `registerMedia(app)`: `POST /api/upload` (session-gated, `@fastify/multipart`; reads one file with the size cap; validates MIME; `saveMedia`; returns `{ id, url: '/api/media/'+id, mime }`; 401 unauth, 413 too large, 415 bad type). `GET /api/media/:id` (session-gated; streams the file with its stored MIME, `Content-Disposition: inline; filename="..."`, `X-Content-Type-Options: nosniff`; 404 if missing). Register in `buildApp`.

- [ ] Steps: `media-routes.test.ts` (unauth upload → 401; authed upload of a small PNG (a tiny valid PNG buffer) → 200 with an id + url, and a `media` row exists for that user; `GET /api/media/:id` authed → 200 with the right content-type + nosniff header; an over-size or disallowed-MIME upload → 413/415; `GET` unauth → 401) → RED → implement → GREEN. Use a temp `BOOL_MEDIA_DIR` in the test. Keep prior tests green. `typecheck` clean. Commit `feat(server): authenticated multipart upload + media serving`.

> Implementer note: `@fastify/multipart` with `limits: { fileSize: MAX_UPLOAD_BYTES }` throws on overflow — map that to 413. Sniff/validate the declared part mimetype against the allowlist BEFORE writing. Store outside the served static dir.

---

### Task 3: Server — SSRF-guarded link preview fetcher + cache + relay wiring

**Files:** Create `packages/server/src/link-preview.ts`, `packages/server/src/ssrf.ts`; Modify `schema.ts` (link_previews cache table), `packages/server/src/irc/manager.ts` (kick off preview on relayed messages with a URL); Test `packages/server/src/ssrf.test.ts`, `packages/server/src/link-preview.test.ts`.

**Interfaces (produces):**
- `ssrf.ts`: `isBlockedAddress(ip: string): boolean` (true for all the private/loopback/link-local/reserved ranges in Global Constraints, IPv4 + IPv6 + IPv4-mapped); `assertPublicUrl(url, { lookup? }): Promise<{ url, ip }>` — parses the URL, requires http/https, resolves the host (injectable `lookup` for tests), throws if `isBlockedAddress`. Pure/injectable so tests need no network.
- `link_previews(url TEXT PK, ok INTEGER, title TEXT, description TEXT, image TEXT, site_name TEXT, fetched_at INTEGER)` in `ensureAppSchema`.
- `link-preview.ts`: `extractMeta(html: string): { title?, description?, image?, siteName? }` (regex extract `<title>`, `og:title`, `og:description`, `og:image`, `og:site_name`, `<meta name=description>` — HTML-entity-decoded, prefers og:*). `fetchPreview(url, deps?): Promise<PreviewResult>` — checks the cache; else `assertPublicUrl`, fetches with a custom `lookup` pinned to the validated IP, ≤3 redirects (re-validating each hop), ≤512 KB body, ≤5 s, `extractMeta`, upsert the cache, return `{ url, ok, ...meta }`; on any failure/block return `{ url, ok:false }` (cached briefly). `deps` injects the fetcher + lookup so tests use fakes (NO real network in tests).
- `IrcManager` persisting sink: for a relayed `chat:msg`, extract the first http(s) URL from the body (a URL regex); if present, `void fetchPreview(url).then(res => this.hub.publish(userId, { type:'preview:result', ...res })).catch(()=>{})` — async, non-blocking, failure-isolated. (Rate-limit-friendly: the cache dedupes repeats.)

- [ ] Steps: `ssrf.test.ts` (`isBlockedAddress` true for `127.0.0.1`,`10.0.0.5`,`192.168.1.1`,`169.254.1.1`,`::1`,`fc00::1`,`fe80::1`,`::ffff:10.0.0.1`; false for `1.1.1.1`,`8.8.8.8`,`2606:4700::1`; `assertPublicUrl` with an injected lookup resolving to a private IP → throws; to a public IP → returns; a `file://`/`ftp://` URL → throws) and `link-preview.test.ts` (`extractMeta` parses og tags + title + description, prefers og:title, decodes entities; `fetchPreview` with an injected fetcher returning HTML → ok:true with the meta and caches it (second call doesn't re-fetch); an injected `assertPublicUrl` that throws → ok:false, no fetch) → RED → implement → GREEN. Wire the manager. Keep prior tests green (the manager change must not break relay/persistence — wrap in the existing non-fatal pattern). `typecheck` clean. Commit `feat(server): SSRF-guarded link preview fetcher + cache`.

> Implementer note: pin the connection to the validated IP to defeat DNS rebinding — e.g. Node `http(s).get` with a custom `lookup` option that returns the pre-validated address, or fetch via `undici` with a custom `dispatcher`/`connect` that validates. Re-run `assertPublicUrl` on each redirect `Location`. This is the security core — do it carefully and test the block paths.

---

### Task 4: Client — inline images, preview cards, upload UI

**Files:** Create `packages/client/src/components/LinkPreview.tsx`, `packages/client/src/components/InlineMedia.tsx`, `packages/client/src/upload-client.ts`; Modify `packages/client/src/store/chat-store.ts` (reduce `preview:result` into a `previews` map + a `uploadFile` action), `MessageRow.tsx` (render inline images + preview card), `Composer.tsx` (upload button + drag-drop); Test `packages/client/src/components/LinkPreview.test.tsx`, `packages/client/src/upload-client.test.ts`, and a store test.

**Interfaces (produces):**
- Store: `previews: Record<string, PreviewResult>` (url → result); reducer `preview:result` → store by url (only when `ok`). Action `uploadFile(file): Promise<string | null>` — POSTs to `/api/upload` (credentials same-origin), returns the media URL or null; injectable fetch for tests. (Media URLs are inserted into the composer text on upload.)
- `upload-client.ts`: `uploadFile(file, deps?)` (the fetch logic, injectable). `InlineMedia.tsx`: given a URL that looks like an image (extension or an `/api/media/` id with an image mime — for M-media, match by image extension OR a known media URL), render a bounded, lazy `<img>` with alt text; otherwise nothing. `LinkPreview.tsx`: given a `previews[url]` (ok), render a compact card (site name, title, description, small image), the whole card a link to the url (`rel="noopener noreferrer"`). CSS vars, Direction A styling.
- `MessageRow.tsx`: after the body, render `InlineMedia` for any image URL in the message, and a `LinkPreview` for the first non-image URL that has a stored preview.
- `Composer.tsx`: an upload button (📎) opening a file picker, and drag-drop onto the composer; on file, call `uploadFile` and append the returned URL to the input (so it's sent as a normal message → the server previews it / the client renders the image).

- [ ] Steps: `upload-client.test.ts` (uploadFile POSTs the file to `/api/upload` and returns the url on ok; returns null on failure) + `LinkPreview.test.tsx` (a stored ok preview renders title/description/site as a link; an image URL → InlineMedia renders an `<img>` with the src) + a store test (`preview:result` ok reduces into `previews[url]`; not-ok is ignored) → RED → implement → GREEN. Run `pnpm -r test` + `pnpm -r typecheck` green. Commit `feat(client): inline images, link preview cards, file upload`.

---

## Self-Review

**Spec coverage (Media):** authenticated uploads + serving ✓ Task 2; inline images ✓ Task 4; server-side link previews (no client-IP leak) ✓ Task 3; **SSRF guard** ✓ Task 3 (the security core — private/loopback/link-local/reserved blocked, IP-pinned, redirect re-validation, size/time/redirect caps); upload validation (MIME allowlist, size cap, random id, nosniff) ✓ Task 2; per-user isolation ✓ Tasks 2–3; graceful degradation ✓ Tasks 3–4. EXIF-strip is a noted follow-up (avoids a heavy image dep).

**Placeholder scan:** the injectable `lookup`/fetcher (server) and injectable `fetch` (client) make every network boundary testable without real infra; the SSRF block-list is concrete and directly tested. Tasks specify the exact ranges to block.

**Type consistency:** `PreviewResult` shape (Task 1 `preview:result`) is the contract for `fetchPreview` (Task 3), the store reducer + `LinkPreview` (Task 4). `saveMedia`/`getMedia` (Task 2) are consumed by the routes; `assertPublicUrl`/`isBlockedAddress` (Task 3) by `fetchPreview`.

**Known risks (call out during execution):** (1) SSRF is subtle — IP-pinning + per-redirect re-validation is mandatory; a naive `fetch(url)` is NOT acceptable. Test the block paths thoroughly. (2) previews are fetched by the always-on server on relay — the cache dedupes; consider a soft per-user rate limit later. (3) media served to any authenticated user (community model) — finer per-channel ACL is a future concern. (4) real image rendering / upload UX needs a manual browser check (screenshot).

## Execution Handoff

Executed subagent-driven like the prior milestones. After this: **Milestone 8 (Electron)** (native desktop shell) and remaining follow-ups (reaction persistence, EXIF-strip, per-channel media ACL, real-device push E2E). A manual browser pass (upload an image, paste a link, see the card) is worth doing after Task 4.
