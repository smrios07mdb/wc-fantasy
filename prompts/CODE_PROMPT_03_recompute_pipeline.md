# Claude Code — Prompt 03: Recompute pipeline (adapter + rating resolver + dirty-flag sweeper)

> Paste into Claude Code with the four brain files in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`) and the Prompt-01 scaffold +
> Prompt-02 scoring engine in place.
> **ARCHITECTURE.md §3 (rating resolver) / §4 (data model + the "recompute is load-bearing"
> principle) / §7 (derivations) are the spec for this prompt.**

---

## Context (read first)
Read **ARCHITECTURE.md §3, §4, §7**, **DECISIONS.md → Data source (Amendment 2a, the resolver)**,
and **SCORING.md §5–§8 + the feed-availability addendum + the Card-handling clarification**. The
repo already has: the monorepo + Postgres schema (Prompt 01) and a **pure, fully-implemented**
`packages/scoring` exposing `scorePlayerMatch(input): ScoreBreakdown` and
`scoreManagerPeriod(input): ManagerPeriodScore` (Prompt 02). This prompt builds the **deterministic
glue** that turns stored DB rows into scores by calling those pure functions — and **nothing
non-deterministic** (no feed HTTP, no scraper).

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Do **not** reopen or
re-derive any locked decision. Where this prompt and the brain files disagree, **the brain files
win.** If a detail is ambiguous, follow ARCHITECTURE / SCORING / DECISIONS or leave a
`// TODO(prompt-NN):` naming the section — do not invent rules.

## Scope of THIS prompt — the recompute pipeline
Implement the layer that makes "scores are a pure function of stored inputs" real (ARCHITECTURE §4):

1. **Rating resolver** (`packages/scoring` or a small `packages/recompute` module — keep it pure):
   `resolveRating(rows, config): number | null` = **first non-null of the configured source
   priority**, default `[manual, scrape, balldontlie]` (DECISIONS → Amendment 2a). Reads the
   `rating_player_match` rows (source-tagged) for one `(match, player)`; returns the chosen rating or
   `null`. **Sofascore `scrape` leads; `balldontlie` is the fallback.** Pure function of its inputs.

2. **DB → `ScoreInput` adapter** (`packages/recompute`): assemble the exact `ScoreInput` the engine
   expects for one `(match, player)` from the stored layers — `stat_player_match` +
   `manual_stat_player_match` + resolved rating + **role actually played** + the **derivations
   ARCHITECTURE §7 prescribes**. The adapter owns every derivation (put the rule here, not upstream):
   - **`rolePlayed`** = the role the player actually played this match (NOT his drafted position) —
     source it from lineup/role data; this is what every role-locked line keys off.
   - **Save outside box** = `max(0, saves − saves_inside_box)` (engine then applies +1/3).
   - **Clean-sheet inputs** = `teamGoalsAgainst` (whole-match, from match score / `stat_team_match`)
     **and** `goalsConcededWhileOn` (from goal-event minutes in `event_match` + `minutes_played`) —
     two separate inputs, per §7 / the Prompt-02 contract.
   - **Penalty missed** (−3) from `shot_match` (penalty situation, not a goal → the taker).
   - **Penalty saved** (+5, §5, GK/role-played) from `shot_match` (the same penalty row where the
     keeper saved → the on-pitch keeper). **Supply this field** — it pairs with the engine's §5
     penalty-saved line (see "Dependency" below).
   - **Own goal** (−2) from `event_match` (own-goal-flagged goal incident → the OG scorer).
   - **Cards** — yellow / second-yellow-with-minute / red-with-minute, honoring the **Card-handling
     clarification**: set the **first-yellow signal alongside** a second-yellow; classify a two-yellow
     dismissal as **second yellow, NOT red**; pass the **effective minute** (`time_minute` +
     `added_time`). (The `match_events.incident_class` "second-yellow vs red" disambiguation is the
     §7 confirm-in-code item — encode the mapping defensively and leave a `// TODO(confirm):` for the
     first-live-data enum check.)
   Keep the adapter a **pure function** of the row inputs where possible (a thin DB-read wrapper
   gathers the rows; the mapping logic itself takes rows → `ScoreInput` with no IO, so it's unit-
   testable without a database).

3. **Recompute writers** (`packages/recompute`, thin DB IO around the pure pieces):
   - `recomputePlayerMatch(match_id, player_id)`: gather rows → adapter → `scorePlayerMatch` →
     **upsert `score_player_match`** (`points`, `breakdown_json`, `computed_at`). Mark affected
     `(manager, period)` dirty.
   - `recomputeManagerPeriod(manager_id, period_id)`: gather the manager's **`is_starter` lineup
     slots** for the period + their `score_player_match` rows → `scoreManagerPeriod` → **upsert
     `score_manager_period`**. (Bench excluded; an unplayed starter contributes 0 — exactly the
     Prompt-02 contract. This reads `is_starter`; it does **not** depend on `locked_at`, which governs
     swap-editability, not scoring.) Mark `standing` dirty — but **do not compute `standing`** (see
     out-of-scope).

4. **Dirty-flag sweeper** (`apps/worker`): a function the worker can call (a real schedule is a later
   prompt) that drains the dirty markers Prompt 01 modeled (the `dirty`/`dirty_at` flags and/or
   `recompute_dirty` table) and walks the chain **`(match,player)` → `(manager,period)` →
   `standing`**, clearing flags **transactionally** as it goes. No queue (ARCHITECTURE §8) — a
   dirty-flag sweep is plenty at this scale. Idempotent: running it twice with no new writes is a
   no-op.

5. **Frozen-period gate** (enforce the seam Prompt 01 modeled): once `period.frozen_at` is set, the
   sweeper **must not auto-restate** that period's `score_manager_period` / `standing` — recompute is
   **commissioner-only** past the freeze (DECISIONS → Theme C; ARCHITECTURE §4/§9). Gate it with an
   explicit `allowFrozen`/commissioner-override flag on the manager-period recompute path; player-
   match recompute of raw inputs may still run, but it must **not** propagate into a frozen period
   unless the override is set.

## Dependency to confirm BEFORE wiring the adapter's penalty-saved field
SCORING.md §5 has an **active `Penalty saved` (+5)** line, but it was **not** in the Prompt-02 input
enumeration. Confirm the engine takes a `penaltySaved` input and applies **+5** (GK/role-played). If
it does not, **add the field + the §5 line + a unit test in `packages/scoring` first** (a ~minimal
engine change, same `scorePlayerMatch` signature shape), then have this adapter supply it. Do not let
the adapter compute a +5 the engine can't consume.

## Explicitly OUT of scope (later prompts; leave existing stubs/seams intact)
- **Real feed IO** — `packages/feed` stays a `NotImplemented` stub; **seed DB rows in tests**, do not
  fetch. BALLDONTLIE polling + the **Sofascore scraper** are Prompt 04.
- **Setting `locked_at`** (lock-on-play) — the pre-match lineup pull (lock starters at kickoff) and
  live sub events (lock subs at entry minute) are **ingestion (Prompt 04)**. This prompt only *reads*
  `is_starter`.
- **`standing` computation** — the **all-play-all** weekly record + seeding + guillotine elimination
  (Theme C) is the next prompt; here, only *mark* `standing` dirty.
- FAAB batch, draft controller, Supabase Realtime, auth, UI — untouched.

## Tests — seed DB rows, assert derived scores (no feed, no clock)
Boring runner (Vitest), root `pnpm test` still green. Cover:
- **Resolver priority:** `manual` > `scrape` > `balldontlie`; nulls fall through to the next source;
  all-null → `null`. A config that reorders priority is honored.
- **Adapter derivations:** save-outside-box (`max(0, saves − savesInsideBox)`); clean-sheet inputs
  (`teamGoalsAgainst` vs `goalsConcededWhileOn` as *distinct* values feeding the right engine lines);
  penalty missed / **penalty saved** / own goal from seeded `shot_match` / `event_match` rows; and the
  **card input-shape** → engine produces the **stacked** result (a seeded two-yellow dismissal yields
  yellow −1 **+** second-yellow bucket and **no red line** — i.e. the Prompt-02a matrix, but exercised
  through the adapter from event rows).
- **`recomputePlayerMatch`:** seeded rows → `score_player_match.points` equals
  `scorePlayerMatch(...).total` and `breakdown_json` equals the breakdown (the adapter introduces no
  drift).
- **`recomputeManagerPeriod`:** sums **starters only** (bench rows excluded even if they have a
  `score_player_match`); an unplayed/0-point starter contributes 0.
- **Dirty-flag propagation:** writing a raw input marks `(match,player)` dirty; the sweep recomputes
  **only** affected rows, walks to `(manager,period)`, marks `standing` dirty, and clears flags;
  a second sweep with no new writes is a no-op.
- **Frozen-period gate:** with `period.frozen_at` set, a late raw correction does **not** restate
  `score_manager_period` — **except** when the commissioner-override flag is passed, which does.

## Definition of done (verify these pass)
- `resolveRating`, the adapter, `recomputePlayerMatch`, `recomputeManagerPeriod`, and the sweeper are
  implemented; `packages/scoring` stays pure (and gains the `penaltySaved`/+5 line **iff** the
  Dependency check above found it missing — with a test).
- The **adapter mapping logic is pure** (rows → `ScoreInput`, no IO) and unit-tested without a DB; the
  DB-read/write wrappers are the only IO and are thin.
- `pnpm -w typecheck`, `pnpm lint`, `pnpm format:check` exit 0; `pnpm test` is green (engine suite +
  the new recompute suite).
- No out-of-scope work: `packages/feed` still stubbed; no scraper; no scheduler/poller; no `standing`
  computation; no `locked_at` setting; existing seams/stubs untouched.

## When done
Summarize: the resolver + adapter + writer + sweeper signatures; the **outcome of the penalty-saved
(+5) Dependency check** (already present, or added with a test); how each §7 derivation maps to code;
the test count + coverage (resolver, derivations, the card stack through the adapter, the dirty-flag
walk, the frozen gate); the purity proof for the mapping logic; and the exact commands you verified.
Note any `TODO(prompt-NN)` / `TODO(confirm)` you left. Do not start any out-of-scope feature.
