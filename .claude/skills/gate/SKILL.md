---
name: gate
description: Run the full Definition-of-Done gate in the active worktree and hold the merge.
disable-model-invocation: true
---
Run the full DoD gate in the active worktree, in order, stopping on first failure:
`pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test`
For web/CSS threads also run `pnpm --filter @app/web build`.
Include the gated Postgres integration tests when the change touches DB/RLS/scoring.
Report pass/fail per stage. Stage commits but HOLD the merge for review unless I have
explicitly authorized Code to merge this thread. Default is hold.
