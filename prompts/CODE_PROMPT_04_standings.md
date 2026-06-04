# Claude Code — Prompt 04: Standings — all-play-all + seeding + guillotine cut-selection (Theme C)

> Paste into Claude Code with the four brain files in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`) and Prompts 01–03 in place.
> **DECISIONS.md → Theme C (League & format) is the spec for this prompt;** the data model + the
> recompute chain + the freeze gate are **ARCHITECTURE.md §4** (and the guillotine-tiebreak note in
> §9). This fills the `scope=standing` seam the Prompt-03 sweeper already emits.

---

## Context (read first)
Read **DECISIONS.md → Theme C** in full, **ARCHITECTURE.md §4** (the `period` / `standing` tables, the
recompute chain "…→ `score_manager_period` → `standing`", and the late-correction freeze policy), and
the **guillotine elimination-tiebreak** note (ARCHITECTURE §9-area: "Computed from `standing`"). For
context on what consumes standings, skim **ARCHITECTURE §5** ("vs the field" screen) — but the UI is
out of scope here.

State of the build: Prompts 01–03 are done. `packages/recompute` (Prompt 03) has the rating resolver,
the `buildScoreInput` adapter, `recomputePlayerMatch` / `recomputeManagerPeriod`, the `RecomputeStore`
port (with `MemoryStore` test double + `createPrismaStore`), and a `sweep(store, {allowFrozen})` that
walks `(match,player) → (manager,period) →` **marks `scope=standing` dirty but does NOT compute it**.
**This prompt fills exactly that seam** and adds the Theme-C standings math — extending
`packages/recompute`, not a new package.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Do **not** reopen or
re-derive any locked decision. Where this prompt and the brain files disagree, **the brain files
win.** If a detail is ambiguous, follow DECISIONS Theme C / ARCHITECTURE §4 or leave a
`// TODO(prompt-NN):` / `// TODO(confirm):` naming the section — do not invent rules.

## Scope of THIS prompt — the standings layer
Three pieces. Keep the math **pure** (functions of their inputs, no IO/clock/env); the only IO is the
thin store reads/writes.

1. **All-play-all regular-season standing (pure).** Per DECISIONS Theme C: each `group_md` period, a
   manager's score is compared against **every other manager**; **bank a W for each one you strictly
   outscore.** Implement carefully:
   - For a period's manager→points map, each manager's period record is
     `W = count of managers strictly below`, `L = count strictly above`. **A tied period score is
     NEITHER a W nor an L for either side** — do **not** define `L` as `N−1−W` (that would charge both
     tied managers a loss). `W + L` may be `< N−1` when ties occur. (Two inactive managers both at 0
     tie → neither; an inactive 0 is a free W for everyone strictly above — this falls out, no
     special-case.)
   - **Cumulative standing** across the completed `group_md` periods: `all_play_all_W = Σ` period Ws,
     `all_play_all_L = Σ` period Ls, `total_points = Σ score_manager_period.points`.
   - **Seed** = sort by `all_play_all_W` **desc**, then `total_points` **desc** (the locked tiebreak),
     assigning `seed` 1..N. The rules stop at total points; for a remaining exact tie use a **stable
     deterministic fallback** (e.g. `manager_id`) so the function is deterministic, and leave a
     `// TODO(confirm):` noting the spec has no further regular-season tiebreak (commissioner could
     adjudicate). Standings are **always current-state** (provisional as a wave's matches complete;
     final once the period freezes — no separate "provisional" mode).
   - Expose the **pairwise comparison** as a reusable pure helper (manager→points map → per-pair
     outcomes) so the later "vs the field" UI can render per-opponent H2H from the same logic. (Do
     **not** materialize per-opponent rows here — the `standing` row only needs the aggregate
     W/L/total/seed.)

2. **`recomputeStanding(store, leagueId)` (IO writer) + sweeper wiring.** Gather the league's
   `group_md` periods and their `score_manager_period` rows → run the pure standing computation →
   **upsert `standing` rows** (`all_play_all_W`, `all_play_all_L`, `total_points`, `seed`, using the
   `scope` value the Prompt-01 schema already defines for the regular season) → **clear the
   `scope=standing` dirty markers.** Then **extend the Prompt-03 `sweep`** so its standing phase calls
   this (the chain is now end-to-end: raw write → `score_player_match` → `score_manager_period` →
   `standing`). Keep it **idempotent** (a second sweep with no new writes is a no-op). The **frozen
   gate is respected transitively**: a frozen period's `score_manager_period` is stable (Prompt 03
   gates its restatement), so standings derived from it don't shift on late corrections to a frozen
   period — no new gate logic needed here, but add a test proving it.

3. **Guillotine cut-selection (pure) — selection only, no application.** Per DECISIONS Theme C, the
   playoffs are a **survival ladder, not a bracket** (no pairings): each knockout round, rank
   surviving managers by that round's score and eliminate the lowest `cut_count`. Implement
   `selectGuillotineCuts(survivorRoundScores, cumulativeTournamentTotals, cutCount)`:
   - Rank survivors by round score **ascending**; the bottom `cut_count` are eliminated.
   - **Tie at the cutoff:** among managers tied at the elimination boundary, cut the one(s) with the
     **lowest cumulative tournament total points** (`Σ score_manager_period` over **all** periods to
     date — regular season + playoffs; compute this **on the fly** from `score_manager_period`, no new
     stored column).
   - **Backstop:** if a cutoff tie is **still** unbroken after the cumulative-points tiebreak, **do NOT
     auto-cut an arbitrary manager** — return a `{ needsCommissioner: true, tied: [...],
     cutsRemaining }` result so the caller can surface it for commissioner adjudication. When fully
     determined, return `{ eliminated: [managerId, …] }`. The function must be deterministic.
   - Works for any `cut_count` in the locked tapering schedule (test `cut_count = 2` and `= 1`).

## Explicitly OUT of scope (later prompts; leave Prompt-03 seams/stubs intact)
- **The group→playoff transition + applying eliminations** — selecting the playoff field (top
  `field_size` seeds), setting each knockout `period.cut_count`, marking managers eliminated, the
  15→9 roster trim, and **freeing cut rosters into the FAAB pool** entangle with Theme D and are the
  **transition/FAAB prompt.** This prompt only *computes* seeds and *returns* cut selections; it does
  not apply their side effects.
- **Feed ingestion / Sofascore scraper / `locked_at` setting** — Prompt 05; `packages/feed` stays a
  `NotImplemented` stub; **seed `score_manager_period` / `period` rows in tests**, do not fetch.
- **Draft controller**, **Supabase Realtime + the "vs the field" UI** (a separate Design+Code
  deliverable), **auth**, **FAAB batch** — untouched.

## Key contracts
- Extend the `RecomputeStore` port + **both** impls (`MemoryStore`, `createPrismaStore`) with the
  standing reads/writes (read `score_manager_period` for a league's periods; read `period.kind` /
  `period.cut_count`; upsert `standing`; read/clear `scope=standing` markers). Keep the **pure**
  standing/guillotine logic free of the store.
- **No churn to Prompt-03 signatures** — `sweep` keeps its shape; you extend its standing phase. The
  standing/guillotine math lives in a pure module (e.g. `standing.ts`) under `packages/recompute`; the
  package index stays DB-free; Prisma stays behind the `./prisma` subpath.
- You likely will **not** need the match→period mapping (standing reads `score_manager_period` by
  `period_id` directly); if you do touch it, the Prompt-03 `period_id`-on-`fifa_match` TODO is the
  place to pin it — but prefer not to expand scope.

## Tests — seed `score_manager_period` + `period` rows; assert standings (no feed, no clock)
Vitest; root `pnpm test` stays green. Cover:
- **All-play-all per period:** distinct scores → `W` = strict-below count, `L` = strict-above count;
  **a tied pair gets neither W nor L** (and explicitly assert `L ≠ N−1−W` for the tie case); two
  inactive `0`s tie while an active manager banks the free win.
- **Cumulative + seeding:** Ws summed across periods; seed orders by `W` then `total_points`; the
  **total-points tiebreak** separates two equal-`W` managers; a fully-tied pair (`W` and
  `total_points` equal) resolves via the deterministic fallback (and the `TODO(confirm)` is present).
- **`recomputeStanding` + sweep:** no-drift vs the pure computation; a `score_manager_period` change
  marks `scope=standing` dirty, the sweep recomputes and upserts `standing`, then clears the markers;
  a second sweep is a no-op.
- **Frozen interaction:** standings derived from a frozen period don't shift when a late correction to
  that frozen period is attempted (consistent with the Prompt-03 gate).
- **Guillotine cut-selection:** clean cutoff (cut the bottom `cut_count`); a tie spanning the cutoff
  resolved by **lower cumulative tournament total**; an unbroken tie returns **`needsCommissioner`**
  (never an arbitrary cut); both `cut_count = 2` and `= 1`.
- **Purity:** grep-clean (no `@app/db` / `@app/feed`, no clock, no env, no network) for the
  standing/guillotine math; IO confined to the store.

## Definition of done (verify these pass)
- The pure all-play-all + seeding + guillotine-selection logic, `recomputeStanding`, the extended
  store impls, and the sweeper's standing phase are implemented; the recompute chain runs **end-to-end
  through `standing`**.
- `pnpm -w typecheck`, `pnpm lint`, `pnpm format:check` exit 0; `pnpm test` is green (engine +
  recompute + new standings suites).
- No out-of-scope work: no transition/elimination application, no field selection, no `cut_count`
  setting; `packages/feed` still stubbed; no scraper/poller/`locked_at`; Prompt-03 seams/stubs and
  signatures untouched.

## When done
Summarize: the new signatures (`recomputeStanding`, the pairwise helper, `selectGuillotineCuts`, the
extended `RecomputeStore` methods); how each Theme-C rule maps to code (the strict-`W`/strict-`L`
all-play-all, the seeding tiebreak chain + fallback, the guillotine cumulative-tiebreak +
commissioner backstop); the test count + coverage; the purity proof for the math; the sweep now being
end-to-end; the exact commands you verified; and any `TODO(prompt-NN)` / `TODO(confirm)` left. Do not
start any out-of-scope feature.
