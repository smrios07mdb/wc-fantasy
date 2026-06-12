# CODE PROMPT 40 — Match Pool (pick'em) engine + data layer  [backend only, NO UI]

## Goal
Stand up the data model + pure scoring/leaderboard engine + server-authoritative
pick write/read path for a per-match World Cup pick pool. Managers pick the result
of each fixture; +1 per correct pick; separate leaderboard. NO UI, nav, bracket
layout, or Realtime in this prompt — those are Prompt 41.

Design decision (record in DECISIONS as a new Theme): per-match 1X2 pool (option A),
NOT an advancement-prediction bracket (B). "March Madness feel" is a Prompt-41
presentation concern only. This prompt reads match results that ALREADY land in
`fifa_match` — no feed/ingest changes.

Branch: `feat/pool-engine` off `main`. Conventional commits. No force-push.

## 1. Schema + migration + RLS
- New model `PoolPick` → table `pool_pick`:
  - `id` uuid pk; `leagueId`, `managerId`, `matchId` (FKs); `prediction` enum
    `PoolPrediction { HOME DRAW AWAY }`; `submittedAt`, `updatedAt`.
  - UNIQUE `(manager_id, match_id)`. Indexes on `(league_id, match_id)` and `match_id`.
- RLS: **mirror `faab_bid`'s policy structure exactly** (it already solved the
  auth.uid()→app_user→manager→league mapping). League-scoped `authenticated` SELECT;
  INSERT/UPDATE restricted to the caller's own `manager_id`. Add the table to the
  Realtime publication now (so Prompt 41's subscription doesn't silently deliver zero
  events — the §RLS-trap from DECISIONS).
- **Anti-copying is NOT an RLS predicate** (no clock in RLS): RLS league-scopes reads;
  hiding others' picks before kickoff is enforced in the read query (§3).
- **Migration-embedded RLS self-test (Theme-F precedent — do NOT strip):** prove
  (a) cross-league isolation (manager in league X cannot read/write league Y picks),
  (b) own-row write enforcement. Use **valid UUID literals** and ensure the test
  exercises the real `auth.uid()` UUID cast (the bare-Postgres `migrate reset` shim
  masks UUID-cast bugs — use a UUID-returning shim, per DECISIONS).

## 2. Pure engine — new package `packages/pool` (DB-free, no IO, no clock)
Mirror `packages/recompute/src/standing.ts` purity discipline. `now` is always passed in.
- `derivePoolResult(match): "HOME"|"DRAW"|"AWAY"|null`
  - `status !== "completed"` → `null` (pending).
  - group (`round == null`): home/away goals → HOME / DRAW / AWAY.
  - knockout (`round != null`): advancer via full-time, then ET, then pens → HOME/AWAY,
    **never DRAW**. Defensive `null` if a knockout has no decider.
- `scorePick(prediction, result, weight): number`
  - `result == null` → 0; `prediction === result` → `weight`; else 0.
  - DRAW vs a knockout match is invalid input → 0 (and rejected at write time, §3).
- `weightForRound(round): number` → default `1` for every round. Escalating knockout
  weights (e.g. R32→Final 1/2/3/5/8) are a future knob — leave the seam, ship flat 1.
- `buildPoolLeaderboard(picks, matches, weightFn): Row[]` → `{managerId, played, correct,
  points}`, sorted `points desc → managerId asc` (deterministic, like standing.ts).
- `isPickLocked(match, now): boolean` → `now >= match.kickoffAt || status !== "scheduled"`.

## 3. Server-authoritative write/read path (apps/web; server action or route)
- Submit/upsert pick: reject if `isPickLocked(match, serverNow)`; reject `DRAW` when
  `match.round != null`; upsert `(managerId, matchId) → prediction`. Server time is
  authoritative (like the draft `pick_deadline_at`).
- Read picks: caller's own picks ALWAYS; others' picks ONLY for matches with
  `kickoffAt <= serverNow` (anti-copying), enforced in the WHERE clause.

## 4. Tests (Vitest)
- `packages/pool`: cover `derivePoolResult` (group W/D/L; knockout FT/ET/pens advancer;
  pending; defensive null), `scorePick` (hit/miss/pending/invalid-DRAW-knockout, weight),
  `buildPoolLeaderboard` (ranking + deterministic tiebreak), `isPickLocked` (pre/post
  kickoff, non-scheduled).
- Write path: lock rejection, knockout-DRAW rejection, own-row enforcement.
- Report new test count delta.

## Explicitly OUT of scope (Prompt 41)
- All UI: pick surface, knockout bracket layout, leaderboard screen, nav entry/route.
- Realtime subscription wiring (publication entry is added now; the client hook is P41 —
  remember `realtime.setAuth(token)` before subscribe, gated on INITIAL_SESSION,
  re-subscribe on TOKEN_REFRESHED).
- Escalating knockout weights (seam only).

## Brain-file updates (part of Definition of Done — YOU write these, not Sergio)
- DECISIONS.md: new Theme — A over B; flat +1 (weight-parameterized); per-match kickoff
  lock; RLS mirrors faab_bid + anti-copying in query not RLS; result derivation
  (group H/D/A, knockout advancer via ET/pens); Realtime publication added, client hook
  deferred to P41.
- ARCHITECTURE.md: `pool_pick` table; `packages/pool` pure module; write/read path; note
  Realtime-RLS trap reminder for P41.
- SCORING.md: short addendum — the Pool is a SEPARATE scoring system from player scoring
  (flat +1 per correct pick, weight seam); do not conflate with the §1–§8 player engine.
- PROJECT.md: Prompt 40 entry (what shipped, test count, branch@sha, merged-to-main once
  Sergio merges); on-horizon Prompt 41 = Pool UI.

## Definition of Done
- `pnpm -w typecheck && pnpm lint && pnpm format:check && pnpm test` all green.
- Migration applies cleanly; RLS self-test passes against a UUID-returning shim.
- Brain files updated in this branch (ride with the feature merge — no separate docs
  commit, so no `[skip render]` needed here).
- Report: diffs, migration SQL, RLS self-test output, test-count delta, branch@sha.
  Do NOT merge — Chat holds merge until explicit clearance.