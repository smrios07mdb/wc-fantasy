/**
 * The recompute store PORT. All database IO the pipeline needs is expressed here, so the
 * orchestration ({@link ./recompute}) is a pure function of this interface and is unit-testable
 * against an in-memory implementation ({@link ./memoryStore}). The production implementation is the
 * thin Prisma adapter ({@link ./prismaStore}). Keeping the orchestration store-agnostic is what
 * lets us test the dirty-walk, the starters-only aggregation, and the frozen gate WITHOUT a DB.
 */
import type { ScoreBreakdown } from "@app/scoring";
import type { ScoreInputBundle } from "./adapter";

export interface PlayerMatchRef {
  matchId: string;
  playerId: string;
}

export interface ManagerPeriodRef {
  managerId: string;
  periodId: string;
}

/** One lineup slot for a manager-period: starter flag + the player's match score (null if none). */
export interface SlotScore {
  isStarter: boolean;
  score: ScoreBreakdown | null;
}

export interface RecomputeStore {
  // ── player-match recompute ──
  /** Gather the rows for one (match, player) into the adapter bundle, or null if the player/match is absent. */
  getPlayerMatchInput(matchId: string, playerId: string): Promise<ScoreInputBundle | null>;
  /** Upsert `score_player_match` (points + breakdown_json + computed_at). */
  writeScorePlayerMatch(matchId: string, playerId: string, result: ScoreBreakdown): Promise<void>;
  /** Clear the raw `dirty` flags for (match, player) — called LAST so a crash mid-unit re-runs safely. */
  clearRawDirty(matchId: string, playerId: string): Promise<void>;
  /** The (manager, period) pairs whose score depends on this (match, player). */
  getAffectedManagerPeriods(matchId: string, playerId: string): Promise<ManagerPeriodRef[]>;
  /** Mark a (manager, period) dirty (deduped: no duplicate unprocessed marker). */
  enqueueManagerPeriodDirty(ref: ManagerPeriodRef): Promise<void>;

  // ── manager-period recompute ──
  /** The manager's lineup slots for the period, each carrying the player's current match score. */
  getManagerPeriodSlots(managerId: string, periodId: string): Promise<SlotScore[]>;
  /** Upsert `score_manager_period` (points + computed_at). */
  writeScoreManagerPeriod(managerId: string, periodId: string, total: number): Promise<void>;
  /** True once `period.frozen_at` is set — the frozen-period gate (DECISIONS → Theme C). */
  isPeriodFrozen(periodId: string): Promise<boolean>;
  /** The league a manager belongs to (for the standing marker), or null. */
  getManagerLeagueId(managerId: string): Promise<string | null>;
  /** Mark `standing` dirty (deduped). NOTE: standing is NOT computed here (next prompt). */
  enqueueStandingDirty(leagueId: string, managerId: string): Promise<void>;

  // ── sweeper queues ──
  /** Distinct (match, player) with any dirty raw input. */
  listDirtyPlayerMatches(): Promise<PlayerMatchRef[]>;
  /** Unprocessed (manager, period) dirty markers. */
  listDirtyManagerPeriods(): Promise<ManagerPeriodRef[]>;
  /** Mark a (manager, period) marker processed — called LAST in its unit. */
  markManagerPeriodProcessed(ref: ManagerPeriodRef): Promise<void>;
}
