# CLAUDE.md

Guidance for Claude Code when working in this repo. Default ethos: **boring and reliable over clever.**

## Workspace / Worktrees

All work happens in worktrees, not the main checkout. Always use relative paths or verify the active worktree before writing files, to avoid landing edits in the wrong tree.

## Definition of Done / Merge Policy

Default: after completing a feature, hold the merge. Deliver implementation + tests + docs with a fully green DoD gate (typecheck, lint, format, build, tests), then stop and wait for the user's merge decision.

The user owns the merge on high-risk / critical changes (resolver, purity, migration, shared-validator, anything touching live scoring or production data) — always hold these.

For simple, contained changes the user may preempt and explicitly authorize Code to merge. When that authorization is given, Code may commit, `--ff-only` merge, push, and deploy on a green gate. Absent explicit authorization, hold. Be strategic: delegate the merge when it clearly saves a round-trip, hold when the blast radius isn't obvious.

## Testing

Use TDD for correctness-sensitive changes: write the RED test first, then implement to GREEN. Run the full gate (including gated Postgres integration tests) before declaring done.

When a change touches `packages/db/prisma/schema.prisma`, run `pnpm --filter @app/db generate` before the gate. A stale generated Prisma client (it lives in `node_modules`, not git) produces false "property does not exist" typecheck failures that don't reflect main.

## Documentation

Update brain docs (PROJECT.md, ARCHITECTURE.md, DECISIONS.md) as part of every feature or decision change, with cross-references where relevant.

## Communication / Output conventions

Never claim output was "shown above" — always re-display grep/ripgrep/file contents inline in full when the user asks to see them.

## Tooling (`.claude/`)

Determinism matched to stakes:

- **`/gate`** (`.claude/skills/gate/`, explicit-only) — runs the full DoD gate (typecheck → lint → format:check → test, plus `pnpm --filter @app/web build` for web/CSS threads, plus gated Postgres integration tests when DB/RLS/scoring is touched). Holds the merge by default.
- **`/braindocs`** (`.claude/skills/braindocs/`, model-invocable) — updates the brain docs with cross-refs; outputs diffs only, never pushes.
- **auditor** (`.claude/agents/auditor.md`, read-only: Read/Grep/Glob) — scoped read-only audit lane; reports P0–P3 findings with `path:line`.
- **guard-git** (`.claude/hooks/guard-git.sh`, `PreToolUse(Bash)`) — deterministically blocks force-pushes (`--force`, `--force-with-lease`, `-f`, `+refspec`). Defense-in-depth, not the only guard.
- **Stop hook** (`.claude/settings.json`) — runs a background typecheck on stop; informational only (`|| true`), never blocking.

## Teardown is part of merge

After merging a feature branch, the handoff is not complete until the worktree and branch are cleaned up. Steps:

1. `git worktree list` — read the path→branch mapping from the output (never infer from directory names; worktree dirs can be misnamed vs the branch they hold).
2. `git worktree remove <real path from git worktree list>` for the merged branch's worktree.
3. `git branch -d <branch>` — deletes the local branch (use `-D` only if the branch was intentionally abandoned, not merged forward).
4. `git worktree prune` — cleans up stale metadata.

A merged branch must never linger as a ghost. If a worktree removal fails because of uncommitted changes, investigate before discarding — it may be in-progress work.

## Status is derived, not narrated

At thread start, diff BACKLOG.md / PROJECT.md status claims against `git branch --merged origin/main` + `git log --oneline origin/main`. Flag any entry still marked "merge HELD" or "TODO" whose commits are already an ancestor of `origin/main`. Run `git merge-base --is-ancestor <sha> origin/main` to verify each SHA before updating the doc.

If the `/braindocs` skill exists under `.claude/`, add this check as the first step there. Otherwise treat it as a mandatory manual start-of-thread check: read the MEMORY.md index, cross-reference against git, and surface stale HELD labels before doing any feature work.
