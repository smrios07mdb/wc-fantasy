# Claude Code — Prompt 13: Fix the vsfield RLS migration's embedded self-test (deploy blocker) — valid uuids, not a pattern change

> Paste into Claude Code with the four brain files at repo root (`PROJECT.md`, `ARCHITECTURE.md`,
> `DECISIONS.md`, `SCORING.md`) and **Prompts 01–12 merged to `main`**. **Branch off `main`.**
> This is a **launch-gating hotfix**: `prisma migrate deploy` fails on `main` while applying migration
> `20260606170000_rls_realtime_vsfield`, which blocks the Render deploy (and the runbook's migrate step).
> The WC opens **June 11**. Scope is **one migration's embedded self-test + the migrate-resolve recovery
> doc** — **no RLS-policy / helper-function / publication / engine / recompute / standings / scoring /
> auth / vsfield-UI change.** The brain files win where this prompt disagrees. If a detail is ambiguous
> (the shim/local-apply command, the recovery-doc location, any non-transactional statement), leave a
> `TODO(confirm):` — **do not invent**.

---

## Context (read first)

**The failure (Render pre-deploy log, Jun 6):** `prisma migrate deploy` runs on `DIRECT_URL`
(`aws-1-…pooler.supabase.com:5432`, session pooler) as the web pre-deploy step; the earlier migrations
apply; migration **#10 `20260606170000_rls_realtime_vsfield` fails**:
- `Error: P3018`; Postgres **`22P02`** — `invalid input syntax for type uuid: "rls_selftest_user_in"`.
- `where_`: function **`vsfield_caller_shares_league_with_manager` during startup**, called from
  **`inline_code_block line 41 at assignment`**; `routine: string_to_uuid`.
- Reading: the migration's **embedded self-test** (a `DO $$ … $$` block) sets a caller context to the
  **non-uuid label `'rls_selftest_user_in'`**, then calls the helper, whose startup casts that context
  to `uuid` → `22P02`. The deploy environment has no real JWT, but the literal is hardcoded in the
  migration, so it fails on any clean apply.

**This self-test is a deliberate, recorded pattern — keep it; fix the bug inside it.**
- **Prompt 11** (which produced this migration) explicitly asked for it: its tests/validation specified
  *"a migration assertion (in the plain-Postgres shim, **as Theme F did**) that a league member **can**
  SELECT the league's `score_manager_period` + `standing` and a non-member **cannot**."*
- **DECISIONS.md → Theme F + §491–504**: this migration's *job* is correct and **must not change** —
  the `SECURITY DEFINER` helper `vsfield_caller_shares_league_with_manager` (pinned `search_path`,
  `EXECUTE` revoked from `PUBLIC` + granted to `authenticated`), the **league-scoped `authenticated`
  SELECT policies** on `score_manager_period` + `standing`, and the **idempotent `supabase_realtime`
  publication adds** (`IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')`).
- **The working precedent applies clean on deploy:** migration `20260605170000_enable_rls_public_tables`
  (the Theme F RLS migration) does the **same** embedded member-can / non-member-cannot assertion and
  the deploy log reached #10 before failing — so #1–9 (incl. Theme F's self-test) applied fine. **The
  bug is the vsfield test's uuid value, not the pattern.**
- **Therefore: correct the self-test to match the working Theme F precedent; do NOT remove or relocate
  it.** Relocating the assertion out of the migration would reopen the Theme F decision — out of scope.

## Inspect first (do not invent)
- `packages/db/prisma/migrations/20260606170000_rls_realtime_vsfield/migration.sql` — find the
  `DO $$ … $$` self-test (the `inline_code_block` the log pins at ~line 41). Identify exactly where the
  label(s) (`'rls_selftest_user_in'`, and presumably a paired `'…_out'`) are fed into a `uuid` path —
  whether via `set_config('request.jwt.claims'/'request.jwt.claim.sub', …)`, a `SET LOCAL ROLE`, or a
  direct argument.
- **The canonical working reference:** `packages/db/prisma/migrations/20260605170000_enable_rls_public_tables/migration.sql`
  — how *its* self-test (a) sets the caller context with **valid uuids**, and (b) **cleans up** (a
  sub-transaction it rolls back / no persisted fixtures) so nothing is left in the DB. Mirror it.
- The plain-Postgres test shim / local migrate setup the existing suites use; whether this migration has
  any **non-transactional** statement (it shouldn't — no `CREATE INDEX CONCURRENTLY`), which determines
  the resolve path below.

**State of the build (all on `main`):** app + worker + scraper merged; Prompt 12 (Render IaC + runbook)
merged. The live deploy proved `migrate deploy` runs on `DIRECT_URL` (:5432) and applied the earlier
migrations; **#10 is the only blocker**. This migration has **never fully applied successfully anywhere**
(it `22P02`s on a clean apply), so both the Render DB and any local dev DB that records it as "applied"
are in a recoverable state — see verification + recovery below.

**Guiding constraint, non-negotiable:** **"boring and reliable" + reuse the working precedent.** Change
**only** the self-test's uuid values (and its cleanup, if missing); mirror Theme F. Do not reopen locked
decisions.

## Scope of THIS prompt — two pieces

1. **Fix the vsfield self-test's uuid bug (minimal, precedent-matching).**
   - In the `DO` block, the test user id(s) currently a **non-uuid label** (`'rls_selftest_user_in'`,
     and any paired `'…_out'`) must become **valid uuids** — fixed uuid literals or `gen_random_uuid()`
     into declared `uuid` variables — **exactly as `20260605170000_enable_rls_public_tables` does**. Set
     the caller context (the JWT claim / `SET LOCAL ROLE` approach Theme F uses) with a **real uuid** so
     `vsfield_caller_shares_league_with_manager`'s startup cast succeeds.
   - Keep the **assertion intent unchanged**: an in-league member's call returns true / can SELECT; an
     out-of-league member returns false / cannot. Mirror Theme F's assert + `RAISE` style.
   - **Confirm the block cleans up after itself** (runs in a sub-transaction it rolls back, or persists
     no rows) so it leaves **no test users/leagues in the DB** — production runs this on every deploy.
     Mirror Theme F.
   - **Do NOT change** the helper function, the SELECT policies, or the publication adds. If making the
     assertion pass appears to require a change to the **helper or a policy** (not just the test's uuids
     / cleanup), **STOP and flag it** — that is RLS-behavior churn (out of scope) and signals a deeper
     issue to bring back to Chat.

2. **Document the migrate-resolve recovery (doc only — Sergio executes).**
   - The failed migration is marked **failed** in `_prisma_migrations` on the Render DB; Prisma won't
     proceed until it's resolved. The whole migration is one transaction (confirm: no non-transactional
     statements), so the failed apply **rolled back** — nothing persisted.
   - Add the recovery for Sergio in `docs/RUNBOOK.md` (the step-(d) area) or a short
     `docs/MIGRATION_RECOVERY.md` (`TODO(confirm):` the right location): on **`DIRECT_URL`**,
     `prisma migrate resolve --rolled-back 20260606170000_rls_realtime_vsfield`, then re-run
     `migrate deploy` (the corrected migration applies). Note the **pre-launch alternative** —
     `prisma migrate reset` — is acceptable (no real league data yet). **Code does NOT run these against
     any live DB.**

## Explicitly OUT of scope (leave seams intact)
- **Removing or relocating the migration-embedded assertion** — reopens the Theme F decision.
- **The RLS helper, the SELECT policies, the `supabase_realtime` publication adds** — correct; consume,
  do not change (no behavior, signature, or text change beyond the `DO` block).
- **The three pre-prod security follow-ups (§568–572)** — `mirror_auth_user_to_app_user()` `EXECUTE`,
  `enforce_lineup_lock` `search_path`, Auth leaked-password protection — **their own next thread.**
- Engine / recompute / standings / scoring / auth / ingestion / vsfield-UI / `loadSofaIndex`,
  `packages/feed` — untouched.
- **No provisioning / secret / dashboard / live-DB action** — Sergio's.

## Key contracts
- **Fix the test's uuids, preserve the pattern.** Mirror `20260605170000_enable_rls_public_tables`.
- The corrected migration **applies clean from scratch** (no `22P02`) and leaves **no residue**.
- The recovery (resolve `--rolled-back` → redeploy, or pre-launch `reset`) is **documented for Sergio**,
  not executed by Code.
- **No app-logic / RLS-behavior change.**

## Tests / validation (keep it light; no new logic suites)
- **Apply the corrected migration against a fresh local/shadow Postgres** (the plain-Postgres shim, or
  `prisma migrate reset` on a local DB so there's no "migration changed after applied" drift) and confirm
  it **applies clean** — the self-test now passes, no `22P02`.
- The member-can / non-member-cannot assertion still holds (it *is* the self-test, now green).
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0; `pnpm test` green.

## Definition of done (verify these pass)
- `20260606170000_rls_realtime_vsfield/migration.sql`'s self-test uses **valid uuids** (matching Theme F),
  **cleans up after itself**, and **applies clean from a fresh DB** — no `22P02`.
- The **helper / SELECT policies / publication adds are unchanged** (only the `DO` block's uuid values +
  any missing cleanup changed).
- **Recovery documented** (resolve `--rolled-back` → redeploy, or pre-launch `reset`) for Sergio; **no
  live-DB action taken by Code.**
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` exit 0.
- Out-of-scope untouched.

## Runtime verification (the production redeploy is the gate — and it's Sergio's)
Code's proof is the **clean local apply**. The **production gate** is Sergio's: after merge, Sergio runs
the recovery (`migrate resolve --rolled-back …` or `migrate reset`) on the Render DB and re-deploys;
`migrate deploy` should then pass #10 and the deploy goes green. **Do not claim a deploy that did not
happen** — label the redeploy as the gate.

## Commit discipline
- **Branch off `main`** (e.g. `fix/vsfield-migration-selftest`). Conventional Commits, split cleanly —
  `fix(db): valid uuids in vsfield RLS migration self-test (deploy blocker)` and
  `docs(runbook): migrate-resolve recovery for the failed vsfield migration`. Editing this migration file
  is **not** a history amend / force-push — it never applied successfully anywhere, so there is no applied
  history to preserve. **No force-push.** Push the branch. **Hold the merge for Chat review** — report
  against the DoD first.

## When done
Summarize: the exact diff inside the `DO` block (the label→uuid change + any cleanup added) and
confirmation that the **helper / policies / publication are unchanged**; how you proved **clean local
apply** (which shim/command); the **recovery steps** you documented + where; every **`TODO(confirm):`**
left (shim/local-apply command, recovery-doc location, any non-transactional statement); and an explicit
statement that **no live-DB / provisioning / dashboard action was taken** (those are Sergio's). Do **not**
start the §568–572 security follow-ups or anything else.
