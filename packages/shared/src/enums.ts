/**
 * Canonical enums for the whole system.
 *
 * Each enum is an `as const` array (runtime value: iterate / validate) plus a derived union
 * type (compile-time). The string values MUST stay identical to the Prisma enums in
 * `packages/db/prisma/schema.prisma` so DB rows and `@app/shared` types are interchangeable.
 */

/** Playing position. `role` actually played drives role-locked scoring (SCORING.md principle 2). */
export const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof POSITIONS)[number];

/** Lifecycle of a league (ARCHITECTURE.md §4 `league.status`). */
export const LEAGUE_STATUSES = ["draft", "group", "playoff", "complete"] as const;
export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];

/** A scoring window: a group "matchday wave" or a knockout round (ARCHITECTURE.md §4 `period.kind`). */
export const PERIOD_KINDS = ["group_md", "knockout_round"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/**
 * Period status. Freeze is tracked separately via `period.frozen_at` (the late-correction
 * freeze policy, DECISIONS.md → Theme C); `closed` just means the wave's last match finished.
 */
export const PERIOD_STATUSES = ["pending", "open", "closed"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

/** Draft lifecycle. The controller advances state on pick-submit or `pick_deadline_at` expiry. */
export const DRAFT_STATUSES = ["pending", "active", "paused", "complete"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** FAAB bid outcome (ARCHITECTURE.md §4 `faab_bid.status`). RLS-protected while `pending`. */
export const BID_STATUSES = ["pending", "won", "lost", "voided_refunded"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

/** FAAB batch lifecycle (the daily pre-dawn blind-bid clearing run). */
export const FAAB_BATCH_STATUSES = ["pending", "processing", "complete", "failed"] as const;
export type FaabBatchStatus = (typeof FAAB_BATCH_STATUSES)[number];

/**
 * Rating provenance. The resolver reads `rating_player_match` by source in priority order.
 * Sofascore `scrape` is PRIMARY; `balldontlie` is the automatic fallback; `manual` overrides both
 * (DECISIONS.md → Data source, Amendment 2a; ARCHITECTURE.md §3).
 */
export const RATING_SOURCES = ["balldontlie", "scrape", "manual"] as const;
export type RatingSource = (typeof RATING_SOURCES)[number];

/** Match lifecycle. Edge states (`postponed` / `abandoned`) route to the manual override surface. */
export const MATCH_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "postponed",
  "abandoned",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Scope of a standings row (group stage vs playoff vs whole-tournament cumulative). */
export const STANDING_SCOPES = ["group_stage", "playoff", "overall"] as const;
export type StandingScope = (typeof STANDING_SCOPES)[number];

/**
 * What a dirty MARKER points at, for the recompute sweeper. Player-match dirtiness is NOT a marker —
 * it is the raw `dirty` BOOLEAN on stat/rating/manual rows (`sweep` Phase 1 reads those directly). The
 * markers cover the upward cascade only: `manager_period` -> `standing` (ARCHITECTURE.md §3). The
 * former `player_match` scope was retired (Prompt 05a follow-up) — it had no consumer.
 */
export const RECOMPUTE_SCOPES = ["manager_period", "standing"] as const;
export type RecomputeScope = (typeof RECOMPUTE_SCOPES)[number];

/**
 * A pick-pool prediction for one fixture (Prompt 40 — the per-match 1X2 pick'em, a SEPARATE scoring
 * system from the §1–§8 player engine; see SCORING.md addendum). `DRAW` is valid for a GROUP match
 * only; a knockout pick is the advancer (HOME / AWAY). The group-vs-knockout phase is decided by
 * `period.kind`, NEVER by `fifa_match.round` (raw feed text — see DECISIONS → Pool). Mirrors the
 * Prisma `PoolPrediction` enum.
 */
export const POOL_PREDICTIONS = ["HOME", "DRAW", "AWAY"] as const;
export type PoolPrediction = (typeof POOL_PREDICTIONS)[number];
