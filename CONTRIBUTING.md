# Contributing to bool

Thanks for your interest in **bool** — a modern, self-hosted web IRC client. The
project is early and moving fast, so contributions, ideas, and bug reports are
all very welcome.

> **Status:** pre-alpha. The server engine (auth + IRC bouncer) works; the
> end-user chat UI is the next milestone. See the [Roadmap](README.md#roadmap).

## Development setup

bool is a **pnpm workspace monorepo** (`@bool/shared`, `@bool/server`,
`@bool/client`). You need **Node ≥ 20** and **pnpm**.

```bash
pnpm install
pnpm dev          # runs server + client in parallel
```

Useful scripts:

```bash
pnpm test         # root smoke tests
pnpm -r test      # all package tests
pnpm typecheck    # build @bool/shared, then typecheck every package
pnpm --filter @bool/server db:migrate   # run DB migrations manually
```

## Before you open a PR

1. **Discuss big changes first.** For anything beyond a small fix, open an issue
   so we can align on approach before you invest time.
2. **Keep it typed and tested.** `pnpm typecheck` must be clean and
   `pnpm -r test` must pass. New behavior should come with tests.
3. **Match the surrounding style.** Prettier config lives at `.prettierrc.json`.
4. **Write clear commits.** Conventional-commit-ish prefixes (`feat:`, `fix:`,
   `docs:`, `chore:`) are appreciated but not enforced.

## Where things live

| Package            | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `packages/shared`  | Typed WebSocket protocol (types + zod schemas)          |
| `packages/server`  | Fastify always-on bouncer: auth, IRC engine, WS gateway |
| `packages/client`  | Vite + React 19 SPA / PWA                               |
| `design/`          | Design study + interactive mockups                      |
| `docs/`            | Specs, milestone plans, and the presentation site       |

## Code of conduct

Be kind, be constructive, assume good faith. Harassment of any kind is not
tolerated.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
