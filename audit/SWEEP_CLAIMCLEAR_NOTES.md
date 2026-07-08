# SWEEP_CLAIMCLEAR_NOTES — gated-PG failure diagnosis (read-only thread)

**Date:** 2026-07-08 · **Anchor:** `origin/main` @ `f70864e` (tip had not moved past the
surfacing commit at derivation time, so one repro anchors both the tip and the
pre-existing-on-main claim) · **Class:** diagnosis only — no code, schema, or data changes.

**Subject:** `packages/recompute/src/sweepClaimClear.integration.test.ts` ›
`"converges into the score on the next sweep"` fails on unmodified main against a fresh
gated Postgres. Surfaced 2026-07-08 during the FAAB-claim-priority build gate.

## Verdict (one line)

**Stale test fixture, not a recompute defect.** The test injects its racing rating with
`source: "scrape"`; commit `6a554a9` (2026-06-17, CODE_PROMPT_57 / AUDIT F-P2-03) removed
`scrape` from `DEFAULT_RATING_SOURCE_PRIORITY`, so the rating is claimed, cleared, and read —
then deliberately resolved to `null` by `pickRating`, so no `rating` breakdown line ever
appears. The claim-then-clear sweep machinery is intact. Prod is unaffected.

## Repro

Environment: fresh `postgres:16` container, **full `prisma migrate deploy`**
(all migrations through `20260701120000_commish_audit` applied cleanly — no migration-order
drift), `pnpm --filter @app/db generate`, then the gated suite with
`RECOMPUTE_PG_TEST_URL` set. Worktree off freshly derived `origin/main` @ `f70864e`.

Result: **3 tests | 1 failed** — only the convergence test. Exact assertion diff:

```
FAIL … › TOCTOU: a rating committed in the read→clear window › converges into the score on the next sweep
AssertionError: expected false to be true // Object.is equality
- Expected  true
+ Received  false
  ❯ sweepClaimClear.integration.test.ts:155:40
    155|       expect(hasRatingLine(breakdown)).toBe(true);
```

The sibling TOCTOU test (`"is never left dirty=false AND unincorporated"`) and the Defect-2
failure-isolation test both **pass** — consistent with the mechanism below (after one sweep
the injected rating is still `dirty=true`, so test 1's invariant holds without ever needing
the rating line; the poison test never involves ratings).

## First Divergence

Path walked: `sweep` Phase-1 `claimDirtyPlayerMatches` (atomic `updateManyAndReturn` per raw
table) → `recomputePlayerMatch` → `prismaStore.getPlayerMatchInput` → **`pickRating`
(`packages/recompute/src/resolver.ts:30`)** → `buildScoreInput` → `scorePlayerMatch`.

Every step upstream of the resolver behaves exactly as the test expects — verified by a
throwaway diagnostic replay (identical fixture/racing store, run against the same fresh DB,
deleted after use):

| source injected | sweep 2 claims it | rating row after | breakdown lines |
|---|---|---|---|
| `scrape` (the test's) | yes (`playerMatches: 1`, 0 failures) | `dirty: false` | `appearance` only |
| `balldontlie` | yes (`playerMatches: 1`, 0 failures) | `dirty: false` | `rating 8.2 (balldontlie) → +3` **+** `appearance` |

So the first — and only — divergence is `pickRating` skipping the `scrape` row:
`DEFAULT_RATING_SOURCE_PRIORITY` is now `["manual", "balldontlie"]`
(`packages/shared/src/constants.ts:14`), and sources absent from the priority are skipped by
design. The `'scrape'` enum value is retained-but-unused pending a post-tournament schema
drop, which is precisely why the fixture still writes without a DB error.

**Characterization:** fixture drift. Not migration-order drift (migrate deploy was clean),
not a claim/clear/convergence defect (the `balldontlie` replay converges byte-perfectly).

Nuance for the record: as *written*, test 1's invariant ("never `dirty=false` AND
unincorporated") is now violated **by design** for `scrape` rows after two sweeps — the claim
clears them and the resolver intentionally never incorporates them. It only passes today
because it stops after one sweep. The invariant is real only for scoring-relevant sources.

## Blame Candidates

Derived from `git log` on the involved paths (test file, `resolver.ts`,
`packages/shared/src/constants.ts`, sweep lane):

- `9923352` 2026-06-14 — test born (fix/sweep-claim-clear-race). Priority at that commit was
  `["manual", "scrape", "balldontlie"]` (verified via `git show 9923352:packages/shared/src/constants.ts`)
  → the fixture's `scrape` rating scored → **test passed at birth**.
- **`6a554a9` 2026-06-17 — the breaking commit.** `refactor(rating): collapse resolver
  priority to [manual, balldontlie]`. Rewrote `resolver.test.ts` (even adding a guard that
  `scrape` resolves to null!) and relocated `resolver.contract.test.ts`, but touched
  `sweepClaimClear.integration.test.ts` **zero** times (`git show 6a554a9 --name-only`).
- Everything else in `9923352..f70864e` touching the sweep/recompute lane is unrelated to
  rating resolution: `a69ac58` (cumulative totals), `395443e` (VAR conceded), `0ac4bb8`/
  `97e7be2` (classifyCard), `8d0c9f4` (standings draws), `df7b92e` (T16b events tab),
  `db2a2bc` (commish stat editor).

**Why it hid for 3 weeks:** the suite is `describe.skipIf(!RECOMPUTE_PG_TEST_URL)` and
`.github/workflows/ci.yml` never sets that variable or provisions Postgres — the gated suite
has **never run in CI**. It went red on 2026-06-17 and was next executed by the
FAAB-claim-priority gate on 2026-07-08. Same failure class as the fence-CI-gap noted in the
time-truth thread: a guard that only fires when someone remembers to run it.

## Prod Exposure

**None — test-env only.** Evidence (read-only SELECTs against prod via `DIRECT_URL`,
2026-07-08 ~20:30 UTC, pre-QF-batch):

1. **No live writer of `scrape` ratings exists.** Repo-wide, the only
   `rating_player_match` upsert writers are `packages/ingest/src/prismaStore.ts:156`
   (`source: "balldontlie"`) and `apps/web/src/commish/commishStatStore.ts:116`
   (`source: "manual"`). `packages/scrape` was deleted by CODE_PROMPT_57.
2. **No `scrape` rows exist in prod data:**
   `SELECT source, dirty, count(*) FROM rating_player_match GROUP BY 1,2` →
   `balldontlie | f | 4905` — one row class, all clean.
3. **Sweep convergence is healthy:** 0 dirty of 4,905 `stat_player_match`, 0
   `manual_stat_player_match`, and the only unprocessed `recompute_dirty` markers are
   7 × `manager_period` all on **MD1, frozen=t** (oldest 2026-06-19) — the documented
   `skippedFrozen` behavior that intentionally holds markers for a commissioner-override
   sweep, not a backlog.
4. **Tonight's FAAB batch → sweep is unaffected:** batch resolution moves rosters and
   budgets; it writes no rating rows, and the convergence path for the sources prod actually
   receives is proven working (replay row 2 above + the clean prod dirty state).

## Recommended fix-thread scope

Small, test-only; no engine/resolver/sweep/schema changes:

1. **Fixture fix (the whole fix):** in `sweepClaimClear.integration.test.ts`, change the
   racing store's injected source from `"scrape"` to `"balldontlie"` (upsert `where`/`create`
   and the `readState` lookup — the `source:` literal appears in both helpers). The diagnostic
   replay above is the proof this turns the suite green with zero product change.
2. **While in there:** extend test 1 to run a second sweep *or* add a comment pinning that
   its invariant is scoped to priority-listed sources — otherwise the same drift class
   re-bites the next time a source is retired.
3. **Systemic (separate micro-thread, same class as the fence-CI-gap):** give CI a Postgres
   service and set `RECOMPUTE_PG_TEST_URL` (and the other `*_PG_TEST_URL` gates) so gated
   suites can't rot silently for weeks.

Priority: low urgency (no prod exposure), but land item 1 before the next full gate so
FAAB-claim-priority (and any other thread) stops tripping over a known-stale red.
