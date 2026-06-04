# Claude Code — Prompt 02: Scoring engine (pure)

> Paste into Claude Code with the four brain files in the repo root
> (`PROJECT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `SCORING.md`) and the Prompt-01 scaffold in place.
> **SCORING.md is the spec for this prompt.**

---

## Context (read first)
Read `SCORING.md` **in full**, plus `DECISIONS.md → Theme A`, the **feed-availability addendum at the
bottom of SCORING.md**, and **ARCHITECTURE.md §4 / §7**. The repo already has the Prompt-01 foundation:
the monorepo, the Postgres schema, and a **typed stub** `packages/scoring → scorePlayerMatch(input):
ScoreBreakdown` that throws `NotImplemented`. This prompt fills in that engine — **pure, deterministic,
no IO** — and nothing else.

Guiding constraint, non-negotiable: **"boring and reliable" over clever.** Do **not** reopen or
re-derive any locked decision. SCORING.md (with its amendment block) is authoritative; wherever this
prompt and SCORING.md ever disagree, **SCORING.md wins.** If a detail is ambiguous, follow SCORING.md /
Theme A / §7 or leave a `// TODO(prompt-NN):` naming the section — do not invent rules.

## Scope of THIS prompt
Implement `packages/scoring` as **pure functions of their inputs** — the load-bearing principle from
ARCHITECTURE §4 ("scores are a pure function of stored inputs", which is what makes recompute safe):

1. **`scorePlayerMatch(input): ScoreBreakdown`** — the complete SCORING.md model for one player in one
   match (every section §1–§8, with the locked amendments applied).
2. **`scoreManagerPeriod(input): ManagerPeriodScore`** — the pure aggregation: sum the player-match
   points of the manager's **starter** slots for a period (bench excluded; an unplayed/unlocked starter
   contributes 0). Trivial now; lives here so the later recompute sweeper just calls it.

Plus a **thorough test suite** that encodes SCORING.md line-by-line and proves the balance reference.

**Explicitly OUT of scope** (later prompts; do NOT touch — leave the existing stubs/seams intact):
- the recompute **sweeper** / dirty-flag orchestration and any DB reads/writes,
- the **all-play-all standings** + seeding + guillotine logic (Theme C),
- BALLDONTLIE ingestion / the Sofascore scraper / the rating **resolver** wiring,
- FAAB, draft, realtime, auth, UI.

The engine must **not** import `packages/db` or `packages/feed`, perform IO, read the clock
(`Date.*`), or read env. It takes everything it needs as arguments and returns a value. **The rating
arrives already resolved** — a number or `null`; this prompt does **not** implement the
`[manual, scrape, balldontlie]` resolver.

## Input / output types (define in `packages/scoring`, reuse `packages/shared` enums)
Mirror the raw + manual + rating + role that §4 feeds the engine. At minimum:
- **`rolePlayed: Position`** (`GK|DEF|MID|FWD`) — the **role actually played, NOT the drafted
  position** (SCORING.md core principle #2 / the goalie-emergency case). Every role-weighted and
  role-locked line keys off this — **no special-case branch**, just read `rolePlayed`.
- **`minutesPlayed: number`**, **`rating: number | null`** (already resolved; 0–10; `null` = no rating
  = treat as did-not-play for the rating line).
- The **stat fields** used by §3–§8: goals, assists, key_passes, dribbles attempted/completed, duels
  won/lost, passes total/accurate, long_balls total/accurate, was_fouled, clearances, interceptions,
  tackles_won, blocked_shots, saves, saves_inside_box, punches, high_claims, possession_lost,
  penalty_missed, own_goals, and cards (yellow; second-yellow **with minute**; red **with minute**).
- The **derived inputs** for clean sheet / goals conceded — model these explicitly and combine them in
  the engine **per §7's derivation** (e.g. `teamGoalsAgainst` whole-match for the clean-sheet test;
  `goalsConcededWhileOn` for the −1/2). Put the rule in the engine, not upstream.
- The **manual** fields: **`penaltyWon`**, **`penaltyCommitted`** (SCORING.md amendment — KEEP via
  manual entry).
- **`ScoreBreakdown`** = `{ total: number, lines: Array<{ category: string; points: number; detail?: string }> }`
  — a **per-category breakdown** plus the total. This is exactly what the schema's
  `score_player_match.breakdown_json` stores and what the "vs the field" screen + debugging read, so
  keep it legible and **stable**.

## The model — implement SCORING.md exactly (read it; don't trust this summary over the doc)
All values/ladders/tables come from **SCORING.md §1–§8**. These are the things most easily gotten wrong
— get them right against the doc:

- **Two distinct bucket kinds — do not conflate:**
  - **Per-N, round DOWN (`floor`):** key passes +1/2, was fouled +1/3, clearances +1/5 (outfield),
    shots blocked +1/2 (outfield), interceptions +1/3 (outfield), tackles won +1/3 (outfield), saves
    inside box +1/2, saves outside box +1/3, punches+high-claims +1/2, goals conceded −1/2,
    **possession lost −1/3**.
  - **Threshold-gated flat +1 (all-or-nothing, NOT per-N):** successful dribbles (≥3 completed & ≥60%),
    duels won (≥3 & ≥50%), passing (≥40 passes & ≥90%), long balls (≥3 accurate & ≥60%).
- **Rating ladder (§1), −2..+5 by band** — applies **only if `rating` is non-null** (player played).
- **Appearance (§2):** 1–59 → +1; 60+ → +2.
- **Goals / assists position-weighted by `rolePlayed` (§3):** goal GK/DEF 6, MID 5, FWD 4; assist
  4/4/3/3.
- **Save outside box** = derived upstream as a field (`saves − saves_inside_box`), passed in; the engine
  just applies +1/3.
- **Role-locked by `rolePlayed` (§5/§6):** GK keeping stats; **clean sheet (requires 60+ min) +4**;
  goals conceded −1/2 — attach to the role **played** (outfielder forced into goal earns them; a keeper
  played outfield does not). Both §6 lines gate on `rolePlayed ∈ {GK, DEF}`.
- **Penalties (§7):** won +2 (**manual**), committed −2 (**manual**), missed −3.
- **Discipline (§8):** yellow −1; **second yellow by minute** (0–29 −3 / 30–59 −2 / 60–90 −1); **red by
  minute** (0–29 −4 / 30–59 −3 / 60–90 −2); own goal −2; **possession lost −1/3**.
- **Amendments (locked — SCORING.md amendment block / Theme A):**
  - **DROP, do not score** (no input field exists): clearance off the line, successful run-out,
    **player-level offsides**.
  - **KEEP via manual** input: penalty won, penalty committed (above).
  - **REMAP:** dispossessed → **possession lost** at −1/3.

## Tests — encode SCORING.md and PROVE balance (this is half the prompt)
Wire a boring test runner (**Vitest** preferred; Jest fine) and a root `pnpm test`. Cover:
- **Every scoring line in isolation**, including the **floor** edges (5 tackles/3 = 1; 4 key passes/2 =
  2; 1 clearance/5 = 0) and the **threshold gates** (2 dribbles → 0; 3 @60% → +1; 3 @59% → 0; 39
  passes@95% → 0; 40@90% → +1).
- **Role-played / goalie-emergency:** an outfielder with `rolePlayed='GK'` scoring saves + clean sheet +
  goals-conceded exactly like a keeper; a keeper with an outfield `rolePlayed` **not** getting them.
- **Clean-sheet gate:** 60+ min & 0 against → +4; 59 min & 0 against → no clean sheet.
- **Rating gate:** `rating=null` → no rating line **and** no appearance (did-not-play); a played sub
  with a rating scores both.
- **Cards by minute bucket; own goal; possession-lost floor.**
- **Amendments:** the three dropped lines contribute **0** (no field exists); the two manual penalties
  apply from the manual fields; dispossessed maps to possession_lost −1/3.
- **`scoreManagerPeriod`:** sums **starters only** (bench excluded); an unplayed/unlocked starter
  contributes 0.
- **Balance reference (SCORING.md "Balance reference"):** composite "monster game" fixtures for each of
  GK / DEF / MID / FWD landing in the **~23–26** band (forward hat-trick edges highest), plus a reliable
  GK/DEF **floor ~14** — as **range** assertions, not brittle exact-equals. If a position can't reach the
  band with realistic inputs, **do not retune** — leave a `// TODO(prompt-NN):` and report it; the
  ladder is locked and is tuned only via the rating lever (per SCORING.md).

## Definition of done (verify these pass)
- `packages/scoring` exports `scorePlayerMatch` and `scoreManagerPeriod` **fully implemented** — no
  `NotImplemented` left in the package — with the **same `scorePlayerMatch` signature** the Prompt-01
  stub exposed (no call-site churn).
- The package is **pure**: no import of `packages/db` / `packages/feed`, no network, no `Date.*`/clock,
  no env reads. (A quick grep proof in your summary is welcome.)
- `pnpm -w typecheck`, `pnpm lint`, `pnpm format:check` exit 0; `pnpm test` runs the scoring suite green.
- `ScoreBreakdown` is defined, documented, and matches what `score_player_match.breakdown_json` expects.
- No out-of-scope work (no sweeper, no standings, no DB/feed); existing seams/stubs untouched.

## When done
Summarize: the input/output types; how each SCORING.md section maps to code; the **test count +
coverage** (which lines, the role-played/goalie case, the amendments, and the balance-band result per
position); the purity proof; and the exact commands you verified. Note any `TODO(prompt-NN)` you left.
Do not start any out-of-scope feature.
