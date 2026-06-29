# CODE_PROMPT_54 — Codebase Audit · Pass 1: P0 live-state integrity (READ-ONLY)

> Run: isolated worktree · **Opus 4.8** · `/effort` → **ultracode** · paste this whole file.

---

## HARD CONSTRAINTS — read first; these bind every subagent you spawn

1. **READ-ONLY.** Zero changes to any existing file — no source, tests, config, migrations, or brain files. Do **not** run the app, start any server, run `pnpm dev` or any build, open a network connection, call any external API (BALLDONTLIE / Sofascore), or connect to any database. Read code statically.
2. **No git.** No commits, branches, staging, pushes, or PRs. Sergio owns every git operation.
3. **One writable location.** You may write only inside `audit/`. The sole deliverable is the report named in OUTPUT below. Any scratch files must also live under `audit/` and be deleted before you finish. On completion the only new file on disk must be that one report.
4. **Report — don't decide, don't fix.** Findings only — no remediations, no decisions. Do not edit `DECISIONS.md` or any brain file. One-line fix *theme* per finding; write no fix code.
5. **Verified vs. suspected.** Never assert a root cause you did not read. If you didn't trace the real code path end-to-end, log it as an **investigation task** with `Confidence: suspected` — not a finding with an asserted cause.
6. **Allowed inspection only.** File reads, `rg`/`grep`, `git log`/`git show` (read), optionally `pnpm -w typecheck` / `pnpm lint` for static signal. Nothing that mutates state, writes outside `audit/`, or touches the network/DB.

## Context priming (before any code)

Read these four brain files first and audit the implementation against the **intended contracts** they define — not just generic smells. They carry the locked invariants, the incident history, and the module contracts:

- `PROJECT.md` · `DECISIONS.md` · `ARCHITECTURE.md` · `SCORING.md`

## Model / effort

Opus 4.8 with **ultracode** (xhigh reasoning + dynamic-workflow fan-out across the scope below). Confirm the session header reads `opus · ultracode` before starting.

---

## SCOPE — Pass 1: P0 live-state integrity

Cover ONLY the code paths whose failure corrupts the live tournament (scoring, locking, rosters, FAAB ledger, guillotine). Audit each target, **and** verify the cross-cutting invariants across every path that touches them. Anchor on the named symbols (`rg` for them); confirm the package that actually owns each before reporting.

**Scoring rules — `packages/scoring`**
- The pure bucket/point math: the §4 lines incl. the five promoted out of `extra` (shots on target +1/3, ball recoveries +1/5 outfield, big chances created +1/1, accurate crosses +1/4, touches +1/25); the recalibrated `possession_lost` −1/10; §8 card handling (additive stacking; ≥60′ catch-all band).
- **Duel bucket on NULL data:** trace the duel scoring path on a row where `duels_won` AND `duels_lost` are both null (the BALLDONTLIE feed state for matches completed June 11–13). Does it silently score nothing (a dead scored bucket on live data), or guard? Classify the real-world impact. Confirm `AERIALS` was NOT reintroduced as a separate bucket (aerial ⊂ duels → would double-count).
- If `concededByPlayerTeam` / conceded math lives here rather than in `recompute`, audit it here.

**Recompute pipeline — `packages/recompute`**
- `recomputePlayerMatch` participant gate via `playerAppearedInMatch` (team-in-match AND an appearance signal); a non-participant gets NO `score_player_match` row; `deleteScorePlayerMatch` removes a bogus row + re-enqueues the rollup.
- `concededByPlayerTeam` team-in-match guard (§6 conceded is gated on role, not minutes — but must require team-in-match).
- The `dirty` → `runRecomputeSweep` drain: every stale `(match, player)` actually reaches `recomputePlayerMatch`; `markStatPlayerDirty` does not mint all-null stubs that then mis-score.
- `breakdown_json` correctness; rollups (`recomputeManagerPeriod`) sum-only, never re-deriving.
- Guillotine selector `selectGuillotineCuts` (pure, deterministic); `playoffRound.ts` `resolveRoundCut` (`determined | needsCommissioner | invalid-tiebreak`; `championAfterCut`); `playoffsView.ts` `buildPlayoffsView` live-"zone" derivation; `standing` / `computeStandings`.

**Ingestion locking — `packages/ingest`**
- `lock.ts` now-gates (`lockInstantsFromAppearances`, `lockInstantFromSub`): emit a lock only once its instant has arrived (starter `now >= kickoff`, sub `now >= entry`).
- `setLockedAt` monotonic + period-scoped: only `locked_at IS NULL` rows in the match's OWN `period_id`; never a team→future-fixture join.
- `reconcileAppearanceLocks` invoked from BOTH `ingestLive` and `ingestSettle`; `sweepCompletedMatchLocks` 48h window closes the dropped-from-poll gap.
- Kickoff parsing must NOT coalesce a missing/unparseable kickoff to ≈now (the premature-lock root cause). If the parse lives in `packages/feed`, follow it there.

**Lineup integrity — `packages/lineup`**
- Every lock write routes through the single `lockSlot()` choke point with team-membership validation (`player.team_id` belongs to the source match) + a slot-own-match status gate.
- `validateLineup` keys off per-slot play state (`hasPlayed` = a `score_player_match` row exists; `voided`).
- Forfeit one-way door: `voided_at` set once; no un-void; no start-of-voided.

**FAAB ledger — `packages/faab`**
- Resolver: sealed bids, **no double-spend**, reverse-seed rolling tiebreak, per-player kickoff void+refund, $100 reset at the playoff boundary.
- `validateRelease` / `releaseRoster`; the `league.status IN ('group','playoff')` cadence gate.
- D4 non-advancer gate: `isPlayoffParticipant` / `loadIsPlayoffParticipant` single-sourced; non-participant bids voided.

**Lock predicate — `packages/shared`**
- `isLockedNow` (locked iff `locked_at != null && locked_at <= now`); confirm BOTH the lineup and vs-field web read sites use it (no site treats mere *presence* of `locked_at` as locked).

**DB constraints — `packages/db`**
- `enforce_lineup_lock()` trigger: `locked_at` immutable except the documented `→ NULL` while source match `scheduled`, plus the forfeit transition; the one-way-door backstop.
- Unique player ownership per league enforced by a DB constraint, not app code alone.

**Web read sites — `apps/web`**
- The loaders consuming the above for live display: `loadLineup`, `loadVsField`, `app/playoffs/loadPlayoffs.ts` — confirm they use `isLockedNow` and the participant / period-scoped reads, with no logic divergence from the package contracts.

**Cross-cutting invariants — mark each PASS / FAIL / INVESTIGATE with evidence**
- **Participant invariant** — no `score_player_match` row for a non-participant, via ANY write path (live, settle, dirty-sweep, manual).
- **Lock invariant** — locked iff `locked_at != null && <= now`; all writes through one choke point; the appeared⇒locked backstop has no gap.
- **FAAB ledger invariant** — no double-spend; every kickoff void refunds; budget is NOT reset at the playoff boundary (one-time tournament allowance carries forward).
- **Unique ownership** — one player ↔ one roster per league, DB-enforced.
- **Guillotine consistency** — live provisional "zone" (`playoffsView` / `resolveRoundCut`) equals the eventual write (`applyRoundCut`); `applyRoundCut` idempotent.
- **`league.status` consumers** — enumerate every read (this also feeds the open derive-vs-write routing decision; list, don't resolve).

---

## OUTPUT — write `audit/AUDIT_2026-06_p0_integrity.md`

1. **Summary table** — finding counts by severity (P0/P1/P2/P3) + the invariant PASS/FAIL/INVESTIGATE roll-up.
2. **Findings** — one block each, in severity order:
   - `ID` (e.g. `F-P0-01`) · `Title`
   - `Severity` — **P0** corrupts live scoring/roster/FAAB or is an access hole · **P1** latent-but-untriggered correctness bug · **P2** maintainability/drift · **P3** nit
   - `Location` — exact `path:line` (multiple if needed)
   - `Observed` — what the code actually does (cite the path you read)
   - `Impact / invariant threatened` — concrete effect on the live tournament
   - `Confidence` — **verified** (path read end-to-end) or **suspected** (investigation task)
   - `Fix theme` — one line → candidate CODE_PROMPT
   - `Effort` — S / M / L
3. **Investigation tasks** — suspected issues you could not confirm by reading, each with the exact next check needed.
4. **Invariants checked** — each invariant above, PASS/FAIL/INVESTIGATE, with the evidence.
5. **Out of scope this pass** — what P1 (ingestion/feed) and P2 (surface/platform) will cover.

No other files. No git. When finished, `git status` must show only `audit/AUDIT_2026-06_p0_integrity.md`.
