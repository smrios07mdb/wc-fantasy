# CODE_PROMPT_55 — Codebase Audit · Pass 2: P1 ingestion & feed robustness (READ-ONLY)

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

Read these four brain files first and audit the implementation against the **intended contracts** they define — not just generic smells:

- `PROJECT.md` · `DECISIONS.md` · `ARCHITECTURE.md` · `SCORING.md`

Pay special attention to `SCORING.md`'s field map (the BALLDONTLIE → bucket mapping) and the data-source decision in `ARCHITECTURE.md` (Sofascore PRIMARY, BALLDONTLIE `rating` fallback).

## Model / effort

Opus 4.8 with **ultracode**. Confirm the session header reads `opus · ultracode` before starting.

---

## SCOPE — Pass 2: P1 ingestion & feed robustness

Cover the path from external feed → persisted stats/locks. Failures here mean *wrong or missing data* feeding the (separately-audited) scoring engine. Anchor on named symbols; confirm the owning package before reporting.

**Poller / scheduler — `apps/worker`**
- Polling cadence (tighter inside live match windows); the tick → `MatchCtx.now` threading into the lock and scoring paths.
- Idempotent upserts: a re-poll of the same match cannot double-write or double-count.
- Job orchestration cadence + overlap safety: `runRecomputeSweep`, `sweepCompletedMatchLocks`, schedule-sync — no two overlapping runs corrupting state; failures retried, not silently dropped.

**Feed adapter — `packages/feed`**
- BALLDONTLIE field mapping vs `SCORING.md`'s locked field map: the 3 drops / 2 keep-via-manual / 1 remap, and the five §4 lines sourced correctly out of `extra`. Flag any field read that contradicts the locked map.
- NULL handling for `extra` stats generally — not just duels: every stat that can arrive null and feed a bucket. Identify any that silently become 0 vs. correctly skip.
- Kickoff / event parsing: an unparseable or missing kickoff (or sub-entry time) must NOT become ≈now; substitution events feed the play-driven lock correctly.
- Upsert shapes are idempotent / dedup on re-poll.

**Ingestion writes — `packages/ingest`** *(data-write angle; lock-correctness was Pass 1)*
- `stat_player_match` / event upserts are safe to replay; `markStatPlayerDirty` enqueues without duplication; no write path can double-insert a participant row.

**Player-card derivation — `packages/player-box` (+ web player-card loaders in `apps/web`)**
- `player.country` is NEVER read from the never-written scalar; it is always derived from `fifa_team.name` via the `player.team` relation. `rg` for every read of the raw `player.country` scalar across `packages/player-box` and `apps/web`, and flag each one.

**Scraper — `apps/scraper` + `packages/scrape`**
- Sofascore selector fragility (brittle selectors, no fallback on layout change).
- Failure → fallback to BALLDONTLIE `rating`; confirm the precedence is **Sofascore PRIMARY (calibration target), BALLDONTLIE `rating` fallback only** — and is not inverted anywhere.
- Re-run / idempotency safety on the rating write path; partial-scrape handling.

---

## OUTPUT — write `audit/AUDIT_2026-06_p1_ingestion.md`

1. **Summary table** — finding counts by severity (P0/P1/P2/P3).
2. **Findings** — one block each, in severity order:
   - `ID` (e.g. `F-P1-01`) · `Title`
   - `Severity` — **P0** corrupts live scoring/roster/FAAB or is an access hole · **P1** latent-but-untriggered correctness bug · **P2** maintainability/drift · **P3** nit
   - `Location` — exact `path:line` (multiple if needed)
   - `Observed` — what the code actually does (cite the path you read)
   - `Impact` — concrete effect (wrong/missing data, double-count, premature lock, etc.)
   - `Confidence` — **verified** (path read end-to-end) or **suspected** (investigation task)
   - `Fix theme` — one line → candidate CODE_PROMPT
   - `Effort` — S / M / L
3. **Investigation tasks** — suspected issues you could not confirm by reading, each with the exact next check needed.
4. **Checks performed** — each scope target above, status + evidence (which fields/paths were traced; what was confirmed clean).
5. **Out of scope this pass** — covered by P0 (integrity) and P2 (surface/platform).

No other files. No git. When finished, `git status` must show only `audit/AUDIT_2026-06_p1_ingestion.md`.
