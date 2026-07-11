# bool

A modern, self-hosted web IRC client — an open-source "IRCCloud". Monorepo:

- `packages/shared` — typed WebSocket protocol (types + zod schemas)
- `packages/server` — Fastify always-on bouncer server
- `packages/client` — Vite + React 19 SPA / PWA

## Develop

    pnpm install
    pnpm dev        # runs server + client in parallel
    pnpm test       # root smoke tests
    pnpm -r test    # all package tests
