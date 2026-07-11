# bool — Open-Source Launch Design

**Date:** 2026-07-11
**Scope:** Publish `bool` as a polished public open-source project: LICENSE, comprehensive README, funding, GitHub topics/tags, and a presentation/demo site on GitHub Pages.

## Context

- The app is at **Milestone 2 of 8**: `@bool/shared` protocol, `@bool/server` (Better Auth + IRC engine via irc-framework, 59 tests), `@bool/client` (typed WS client, auth UI). **No end-user chat UI yet** (that is Milestone 5).
- Beautiful, ready-made **design mockups** exist in `design/` (Directions A/B/C + Shimmer, plus Cmd-K palette and search overlays) with screenshots in `design/shots/`.
- `gh` is authenticated as **dmfarcas**; no git remote exists yet.

## Decisions (owner-approved 2026-07-11)

- **Framing:** honest early-stage / building-in-public. Never present the app as usable today.
- **Funding:** GitHub Sponsors (`github: dmfarcas`) via `.github/FUNDING.yml` + README badge.
- **Presentation site:** a new landing page under `docs/site/` (Direction-A "Terminal-Modern" visual language) that links to the existing interactive mockups; published via GitHub Pages at `https://dmfarcas.github.io/bool/`.
- **Stray file** `drgreen-shopify-theme-prompt.md`: remove before publishing.
- **Internal docs** (`docs/superpowers/`): keep public (fits building-in-public).

## Deliverables

1. **`LICENSE`** — MIT, `Copyright (c) 2026 Dan Farcaș`.
2. **`README.md`** — rebuilt: centered hero (wordmark, tagline, badge row, button row: Live preview / Star / Sponsor), honest 🚧 status banner, "Why bool" (wedge vs The Lounge: iOS push + search + density), screenshots, features (shipped ✅ / planned 🔜 mapped to milestones), architecture + stack, quick start, roadmap checklist, contributing, security, license, sponsor.
3. **`.github/FUNDING.yml`** — `github: [dmfarcas]`.
4. **`CONTRIBUTING.md`** — brief: dev setup (pnpm), test/typecheck, PR conventions, milestone-driven roadmap.
5. **`SECURITY.md`** — brief: reporting channel + the project's stated security posture (argon2id/scrypt, encrypted secrets at rest, TLS/wss, per-user isolation, SSRF guard).
6. **Presentation site** in `docs/site/`:
   - `index.html` landing page (hero, feature grid, four design-direction cards → live mockups, roadmap, CTAs) in Direction-A tokens.
   - Interactive mockups + screenshots reachable from the site (reuse existing `design/` assets; copy or link as needed).
7. **GitHub publish:** create public repo `dmfarcas/bool`, description, **topics** (`irc`, `irc-client`, `irc-bouncer`, `self-hosted`, `web-irc`, `ircv3`, `typescript`, `react`, `fastify`, `pwa`, `better-sqlite3`, `chat`, `open-source`), push `main`, enable **GitHub Pages** (source: `main` → `/docs` or Pages-from-branch as appropriate), annotated tag **`v0.1.0-alpha`**.

## Honesty constraints

- README status banner and site must state clearly: engine works, UI is next; not yet self-hostable as a daily driver.
- Screenshots are labeled as **design mockups / previews**, not shipping UI.
- Roadmap shows Milestones 0–2 done, 3–8 pending.

## Out of scope

- Building the actual Milestone 3+ features.
- Live/hosted running instance (no backend demo).
- Custom domain for Pages.
