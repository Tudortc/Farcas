# bool — notes for Claude Code

bool is a pnpm workspace monorepo (`packages/shared`, `packages/server`,
`packages/client`, `packages/desktop`). Setup, scripts and conventions are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Work in git worktrees (local sessions)

This repository is developed in git worktrees so that parallel sessions never
edit the same checkout. Apply these rules in every local session, new or
resumed, whether started from the CLI or the desktop app.

1. **Enter a worktree before editing anything.** If the working directory is
   the main checkout (not under `.claude/worktrees/`), call `EnterWorktree`
   before the first `Edit`, `Write` or file-changing command. Pick a short
   kebab-case name that describes the task, for example `theme-picker` or
   `fix-push-badge`. Say which worktree you entered.
2. **Reuse existing worktrees.** Before creating a new one, run
   `git worktree list`. If the user names a worktree, or one under
   `.claude/worktrees/` clearly matches the task, enter it with `EnterWorktree`
   and its `path` instead of creating a new one. If several could match, list
   them and let the user choose.
3. **Set up a new worktree.** A worktree is a fresh checkout. Run `pnpm install`
   inside it (the pnpm store makes this fast). Do not symlink `node_modules`
   from the main checkout: pnpm workspace links would resolve to the main
   checkout's packages, not the worktree's. Gitignored `.env` files are copied
   in automatically via `.worktreeinclude`.
4. **Commit on the worktree branch** (`worktree-<name>`), never on `main` from
   the main checkout. How a branch lands on `main` (PR or local merge) is the
   user's call.
5. **Cloud sessions are the exception.** A claude.ai cloud session is already a
   fresh clone on its own `claude/...` branch. Do not create worktrees there;
   work on the session branch and push it.

Worktrees live in `.claude/worktrees/` (gitignored). `.claude/settings.json`
sets `worktree.baseRef` to `fresh`, so every new worktree starts from the
remote `main`.
