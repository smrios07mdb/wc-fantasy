/**
 * Locked product constants, cited to the brain files. One source of truth so later prompts
 * (scoring, FAAB, draft, lineups) reference these instead of re-deriving numbers.
 */
import type { Position, RatingSource } from "./enums";

/**
 * Rating resolver priority: first non-null wins (ARCHITECTURE.md §3, DECISIONS.md → Data source).
 * `balldontlie` is the canonical rating source of record; a `manual` override beats it. The Sofascore
 * `scrape` arm was removed (CODE_PROMPT_57 — it was structurally inert, AUDIT F-P2-03); the `'scrape'`
 * `RatingSource` enum value is retained-but-unused pending a post-tournament schema drop, so it is
 * simply absent from this priority. Config-driven per league/match later; this is the default ordering.
 */
export const DEFAULT_RATING_SOURCE_PRIORITY: readonly RatingSource[] = [
  "manual",
  "balldontlie",
] as const;

/** Group-stage squad composition: 15 players = 2 GK / 5 DEF / 5 MID / 3 FWD (DECISIONS.md Theme B). */
export const SQUAD_COMPOSITION: Readonly<Record<Position, number>> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
} as const;

/** Group-stage roster size = sum of SQUAD_COMPOSITION = 15. */
export const SQUAD_SIZE = 15;

/** Starting XI = exactly 1 GK + 10 outfield (DECISIONS.md Theme B). */
export const STARTING_XI_SIZE = 11;

/**
 * Group-stage formation bounds: min 3 DEF / min 2 MID / min 1 FWD, exactly 1 GK
 * (DECISIONS.md Theme B). Valid sets: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1, …
 */
export const FORMATION_BOUNDS = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
} as const satisfies Record<Position, { min: number; max: number }>;

/**
 * Playoff reduced roster (guillotine): hard cap ≈ 9 = 7 starters + 2 bench; starting shape
 * 1 GK + 6 outfield, min 1 DEF / 1 MID / 1 FWD — any complete 6-outfield split with ≥1 per line
 * (the 10 shapes 1-1-4 … 4-1-1; the old 2/2/1 set {2-2-2, 3-2-1, 2-3-1} is a strict subset, so no
 * already-saved playoff lineup is invalidated). The per-lane MAX is not stored — `playoffBounds()`
 * (@app/lineup) derives it as `6 − (the other two mins)` = 4. Bench GK optional. Provisional pending
 * the Theme C guillotine cadence (DECISIONS.md Theme B).
 */
export const PLAYOFF_ROSTER = {
  cap: 9,
  starters: 7,
  bench: 2,
  startingOutfield: 6,
  bounds: {
    GK: { min: 1, max: 1 },
    DEF: { min: 1 },
    MID: { min: 1 },
    FWD: { min: 1 },
  },
} as const;

/**
 * The SQUAD roster cap keyed on the data-existence PLAYOFF PHASE (does any `playoff_entry` row exist) rather
 * than the `league.status` field. This is the SINGLE source of truth EVERY FAAB cap site reads — the READ
 * path (the waivers loader + `loadReleaseContext`) AND the ENFORCEMENT path (the submission validators
 * `validateBidSubmission` / `validateFaGrant` and the blind-bid batch resolver `resolveFaabBatch`'s award
 * legality) — threaded in by the IO layer (`loadPlayoffPhaseActive`) so the pure validators stay
 * phase-agnostic. `true` → the reduced guillotine cap ({@link PLAYOFF_ROSTER}.cap = 9); `false` → the full
 * group squad ({@link SQUAD_SIZE} = 15). The group→playoff transition writes `status='playoff'` and the
 * `alive` playoff_entry rows in one $transaction, so playoff_entry existence is the atomic twin of
 * `status='playoff'` — but keying on the DATA is the phase contract (DECISIONS → "FAAB/waiver phase derives
 * from playoff_entry existence"): it holds the trim cap through the R32 pre-kickoff window and after the
 * Final, where the `league.status` field would mislead. NB: OWNERSHIP cap only; the playoff reduced STARTING
 * XI is a separate @app/lineup formation rule, unaffected here.
 */
export function rosterCapForPlayoffPhase(playoffPhaseActive: boolean): number {
  return playoffPhaseActive ? PLAYOFF_ROSTER.cap : SQUAD_SIZE;
}

/**
 * Per-league config SEED DEFAULTS — used ONLY when creating a league row. These mirror the
 * `@default(...)` on the league/manager columns (faab_budget, result_freeze_hours,
 * faab_batch_local_time, season_year; draft_pick_seconds defaults in the DB only).
 *
 * ⚠️ NEVER read these as the runtime value. Each is per-league/per-manager and commissioner-
 * adjustable, so the RUNTIME value is ALWAYS the league/manager row column (e.g. read
 * `league.faabBudget`, `league.resultFreezeHours`, `league.draftPickSeconds`,
 * `manager.faabBudget`). The DB row wins; these are seeds only. Unlike SQUAD_COMPOSITION and
 * DEFAULT_RATING_SOURCE_PRIORITY (global rules), these are NOT global.
 */
export const LEAGUE_SEED_DEFAULTS = {
  /** Starting FAAB budget; full reset to a fresh $100 at the group->playoff transition. */
  faabBudget: 100,
  /** Daily pre-dawn blind-bid batch clock, league-local, must precede the day's first kickoff. */
  faabBatchLocalTime: "06:00",
  /** Hours after a wave's last FT that a period stays restatable, then `frozen_at` is stamped. */
  resultFreezeHours: 6,
  /** Target season. */
  seasonYear: 2026,
} as const;

/** The WC has 5 knockout rounds; the per-round cut schedule collapses the field to one champion. */
export const KNOCKOUT_ROUNDS = ["R32", "R16", "QF", "SF", "Final"] as const;
export type KnockoutRound = (typeof KNOCKOUT_ROUNDS)[number];
