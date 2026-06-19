# CLAUDE.md

Guidance Claude Code working in repo. Default ethos: **boring reliable over clever.**

## Workspace / Worktrees

All work happens in worktrees, not main checkout. Always use relative paths verify active worktree before writing files, avoid landing edits in wrong tree.

## Definition Done / Merge Policy

Default: after completing feature, hold merge. Deliver implementation + tests + docs fully green DoD gate (typecheck, lint, format, build, tests), stop wait user's merge decision.

user owns merge on high-risk / critical changes (resolver, purity, migration, shared-validator, anything touching live scoring production data) — always hold these.

simple, contained changes user may preempt explicitly authorize Code merge. authorization given, Code may commit, `--ff-only` merge, push, deploy on green gate. Absent explicit authorization, hold. Be strategic: delegate merge clearly saves round-trip, hold blast radius isn't obvious.

## Testing

Use TDD correctness-sensitive changes: write RED test first, implement GREEN. Run full gate (including gated Postgres integration tests) before declaring done.

## Documentation

Update brain docs (PROJECT.md, ARCHITECTURE.md, DECISIONS.md) part every feature decision change, with cross-references where relevant.

## Communication / Output conventions

Never claim output "shown above" — always re-display grep/ripgrep/file contents inline in full when user asks see them.

## Tooling

Skills, subagents, and hooks wired in `.claude/`:

- `/gate` (explicit only, `disable-model-invocation: true`) — runs the full DoD gate (typecheck → lint → format:check → test, +build for web/CSS threads); holds merge by default.
- `/braindocs` (model-invocable, auto when brain docs are stale) — updates PROJECT.md / ARCHITECTURE.md / DECISIONS.md / SCORING.md with cross-refs; outputs diffs only, never pushes.
- `auditor` subagent (read-only: Read/Grep/Glob, model: opus) — traces a single lane (schema, RLS, scoring purity, call-site audit) end-to-end; reports findings in P0–P3 severity order.
- `PreToolUse(Bash)` hook → `guard-git.sh` — blocks any `git push --force` / `--force-with-lease` / `-f`; deterministic, always fires.
- `Stop` hook → `pnpm -w typecheck --silent || true` — background typecheck on session end; informational only.

Rule: **auto-invocation never drives a side-effectful action** (no auto merge/push/live-DB write). The gate skill is ergonomics; the hooks are the deterministic layer.
