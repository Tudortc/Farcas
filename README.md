# bool

A modern, self-hosted web IRC client — an open-source "IRCCloud". Monorepo:

- `packages/shared` — typed WebSocket protocol (types + zod schemas)
- `packages/server` — Fastify always-on bouncer server
- `packages/client` — Vite + React 19 SPA / PWA

## Setup

The server automatically runs database migrations before starting (via the `start` script). No manual step is needed for a fresh deployment.

To run migrations manually (e.g. in CI or before `dev`):

    pnpm --filter @bool/server db:migrate

## Develop

    pnpm install
    pnpm dev        # runs server + client in parallel
    pnpm test       # root smoke tests
    pnpm -r test    # all package tests
