/**
 * Locked product constants, cited to the brain files. One source of truth so later prompts
 * (scoring, FAAB, draft, lineups) reference these instead of re-deriving numbers.
 */
import type { LeagueStatus, Position, RatingSource } from "./enums";

/**
 * Rating resolver priority: first non-null wins (ARCHITECTURE.md §3, DECISIONS.md Amendment 2a).
 * Config-driven per league/match later; this is the default ordering.
 */
export const DEFAULT_RATING_SOURCE_PRIORITY: readonly RatingSource[] = [
  "manual",
  "scrape",
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
 * 1 GK + 6 outfield, min 2 DEF / 2 MID / 1 FWD (2-2-2 base, 3-2-1, 2-3-1). Bench GK optional.
 * Provisional pending the Theme C guillotine cadence (DECISIONS.md Theme B).
 */
export const PLAYOFF_ROSTER = {
  cap: 9,
  starters: 7,
  bench: 2,
  startingOutfield: 6,
  bounds: {
    GK: { min: 1, max: 1 },
    DEF: { min: 2 },
    MID: { min: 2 },
    FWD: { min: 1 },
  },
} as const;

/**
 * The SQUAD roster cap for a league at its current phase: the full group squad ({@link SQUAD_SIZE} = 15)
 * until the group→playoff transition, then the reduced guillotine cap ({@link PLAYOFF_ROSTER}.cap = 9)
 * once `league.status` is `playoff` (DECISIONS.md → Theme C/D: advancers "trim 15 → ≈9"). This is the
 * SINGLE source of truth both FAAB cap-enforcement sites read — the submission validator (@app/faab
 * `validateBidSubmission` / `validateFaGrant`) and the blind-bid batch resolver (`resolveFaabBatch`'s
 * award legality) — threaded in by the IO layer so the pure validators stay phase-agnostic. `draft` /
 * `complete` keep the group cap (FAAB is inactive in those phases). NB: this is the OWNERSHIP cap only;
 * the playoff reduced STARTING XI is a separate @app/lineup formation rule, unaffected here.
 */
export function rosterCapForLeagueStatus(status: LeagueStatus): number {
  return status === "playoff" ? PLAYOFF_ROSTER.cap : SQUAD_SIZE;
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
