# Claude Code — Prompt 14: Seed the email allowlist (operational, idempotent)

> Paste into Claude Code with the four brain files in the repo root (PROJECT.md, ARCHITECTURE.md,
> DECISIONS.md, SCORING.md) and Prompts 01–13 in place. This is a small **operational** script, not a
> feature: it seeds `allowlist_email` so the league's members can pass the magic-link gate.
> ARCHITECTURE.md §6 (private-by-allowlist) + the Prompt-07 callback (signs out + denies any
> non-allowlisted email) are the relevant context.

---

## Context (read first)
The auth layer (Prompt 07) gates sign-in on the `allowlist_email` table: `/auth/callback` exchanges the
code, reads `getUser()`, and **signs out + denies** any email without an `allowlist_email` row for the
league. The brain files explicitly defer allowlist *management* to "seed / manage via DB for now" (no
admin UI yet). This prompt is that seed step.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** This is a one-off,
re-runnable provisioning script — plain Prisma, idempotent upsert, **no Supabase admin/service-role
client, no RLS surface** (Prisma connects as the DB role directly). Do not reopen any locked decision.
Do **not** touch the `manager` provisioning ceremony — that is a separate, still-unpinned decision
(`TODO(confirm)` §4/§6); this script writes **only** `allowlist_email`.

## Scope of THIS prompt — one script, nothing else
Add a single committed, idempotent operational script (e.g. `packages/db/scripts/seed-allowlist.ts`,
placed wherever the repo already keeps one-off db scripts; it must **not** be imported by `apps/web` or
any runtime path). It:

1. **Resolves the single league.** `prisma.league.findFirstOrThrow()` — the permanent single-league
   assumption (ARCHITECTURE §4). If zero or more than one league exists, throw with a clear message and
   exit non-zero rather than guessing.

2. **Normalizes with the gate's own normalizer.** Import `normalizeEmail` from `@app/auth` (the exact
   function the allowlist gate uses) and run every email through it before writing — so the stored form
   always matches gate semantics (case-insensitive). If `normalizeEmail` isn't exported from the
   `@app/auth` package index yet, export it. **Do not** re-implement trim/lowercase in the script
   (single source of truth).

3. **Upserts each email idempotently.** For each normalized email:
   `prisma.allowlistEmail.upsert({ where: { leagueId_email: { leagueId, email } }, create: { leagueId, email }, update: {} })`.
   The `update: {}` is deliberate: a re-run must be a no-op that **never** clobbers `claimedByUserId` /
   `claimedAt` on an already-claimed row. `invitedByUserId` stays null (the commissioner's `app_user`
   may not exist pre-launch).

4. **The email list is a committed constant** at the top of the script, one per line, clearly
   commented — reproducible and reviewable from the repo alone. *(If you'd rather keep the emails out
   of git history, read them from a gitignored file instead — but default to the committed constant.)*

5. **Run ergonomics + output.** Expose a boring run command (e.g. a `seed:allowlist` script in the db
   package, runnable via `pnpm --filter @app/db seed:allowlist`, or the repo-equivalent). Print per-email
   `created` vs `already present`, then a final summary line: `N emails — M newly added, K already
   present`.

## Definition of done
- Running it seeds the rows; running it **again** is a clean no-op — no duplicate rows (the
  `@@unique([league_id, email])` holds), claim state untouched.
- No Supabase admin/service-role client involved; plain `@app/db` Prisma only.
- Not imported by any runtime/app path.
- `pnpm typecheck` clean.
- Commit: `feat(db): add idempotent allowlist seed script` (+ a `docs:` line if you record the run step
  in the deploy runbook).

## The emails (normalized)
```
yader.rosales@gmail.com
sebastian.talavera5@gmail.com
armando.zepeda.az@gmail.com
cvarga33@gmail.com
lacayo.ocampo@gmail.com
afcg0207@gmail.com
lrtm1990@gmail.com
rodrigotelleria@gmail.com
```
> Add the commissioner's own email to this list if it isn't already one of the above — the gate has no
> bypass, so an un-allowlisted commissioner cannot sign in.
