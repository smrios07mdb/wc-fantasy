/**
 * The recompute store PORT. All database IO the pipeline needs is expressed here, so the
 * orchestration ({@link ./recompute}) is a pure function of this interface and is unit-testable
 * against an in-memory implementation ({@link ./memoryStore}). The production implementation is the
 * thin Prisma adapter ({@link ./prismaStore}). Keeping the orchestration store-agnostic is what
 * lets us test the dirty-walk, the starters-only aggregation, and the frozen gate WITHOUT a DB.
 */
import type { PeriodKind } from "@app/shared";
import type { ScoreBreakdown } from "@app/scoring";
import type { ScoreInputBundle } from "./adapter";
import type { ManagerPeriodPoints } from "./standing";

export interface PlayerMatchRef {
  matchId: string;
  playerId: string;
}

export interface ManagerPeriodRef {
  managerId: string;
  periodId: string;
}

/** Period metadata the standing layer needs: `kind` selects the group_md periods; `cutCount` is
 *  carried for the (out-of-scope) guillotine-application caller — the standing path ignores it. */
export interface PeriodMeta {
  id: string;
  kind: PeriodKind;
  cutCount: number | null;
}

/** A `standing` row to upsert (scope is the regular-season `group_stage`, set by the store impl). */
export interface StandingUpsert {
  leagueId: string;
  managerId: string;
  allPlayAllW: number;
  allPlayAllL: number;
  allPlayAllD: number;
  totalPoints: number;
  seed: number;
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
  /** Remove the `score_player_match` row for (match, player) — used to evict a NON-participant's row
   *  (the live MD1 incident). A no-op when no row exists, so it is idempotent. */
  deleteScorePlayerMatch(matchId: string, playerId: string): Promise<void>;
  /** Re-dirty a (match, player) so the next sweep reclaims it. Called by `sweep` when a Phase-1 recompute
   *  THROWS — the claim already cleared the flag, so without this the key would be stale with no retry.
   *  Sets `dirty=true` on whichever raw rows exist (the claim only flipped the flag; the rows remain), so
   *  it never spawns a stub. Over-dirtying is always safe (a redundant recompute), never lossy. */
  markPlayerMatchDirty(matchId: string, playerId: string): Promise<void>;
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

  // ── standing recompute ──
  /** Distinct league ids with an unprocessed `scope=standing` marker. */
  listDirtyStandingLeagues(): Promise<string[]>;
  /** A league's periods (id + kind + cut_count); the standing layer keeps only the `group_md` ones. */
  getLeaguePeriods(leagueId: string): Promise<PeriodMeta[]>;
  /** The `score_manager_period` points for every manager in one period. */
  getManagerPeriodScores(periodId: string): Promise<ManagerPeriodPoints[]>;
  /** Upsert one `standing` row (regular-season `group_stage` scope). */
  upsertStanding(row: StandingUpsert): Promise<void>;
  /** Clear ALL unprocessed `scope=standing` markers for a league — called LAST (idempotent). */
  clearStandingDirty(leagueId: string): Promise<void>;

  // ── sweeper queues ──
  /**
   * Atomically CLAIM every (match, player) with a dirty raw input: in ONE statement per raw table, flip
   * `dirty=true → false` AND capture the affected keys, then union + dedup. This REPLACES the old
   * `listDirtyPlayerMatches` + per-unit `clearRawDirty` pair. Clearing happens BEFORE the recompute read,
   * which closes the read→compute→clear lost-update race: a raw write that commits AFTER its row is claimed
   * re-sets `dirty=true` and is reprocessed on the next sweep, so a committed write is never cleared
   * without being incorporated. A redundant idempotent recompute is acceptable; a frozen-pre-write score
   * is not. (See `sweep` Phase 1.)
   */
  claimDirtyPlayerMatches(): Promise<PlayerMatchRef[]>;
  /** Unprocessed (manager, period) dirty markers. */
  listDirtyManagerPeriods(): Promise<ManagerPeriodRef[]>;
  /** Mark a (manager, period) marker processed — called LAST in its unit. */
  markManagerPeriodProcessed(ref: ManagerPeriodRef): Promise<void>;
}
