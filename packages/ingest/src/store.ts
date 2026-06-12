/**
 * The ingestion IO PORT (ARCHITECTURE.md §3/§4). Raw upserts are idempotent on natural keys; every
 * write that affects scoring marks (match, player) dirty so the existing recompute sweep recomputes.
 * Internal UUIDs are resolved from BALLDONTLIE ids here, so the pure mappers stay id-agnostic. The
 * orchestration ({@link ./ingest}) is a pure function of this interface, unit-testable against
 * {@link ./memoryStore} with NO database.
 */
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

export interface SchedulableMatch {
  bdlId: number;
  status: string;
  kickoffMs: number;
  hasRating: boolean;
  lineupPulled: boolean;
  kickoffLockFallback: boolean;
}

export interface IngestStore {
  // ── reference rows (resolve BDL ids → internal UUIDs) ──
  upsertTeamByBdlId(bdlId: number, name: string | null): Promise<string>;
  upsertPlayerByBdlId(
    bdlId: number,
    fields: { displayName: string | null; position: string | null; teamBdlId: number | null },
  ): Promise<string>;
  /** Upsert fifa_match on the balldontlie id; set the structural period_id + the fallback flag. */
  upsertMatch(
    row: MatchRowIn,
    periodId: string | null,
    opts: { kickoffLockFallback?: boolean },
  ): Promise<{ matchId: string }>;
  /** Resolve a structural {kind,label} to the league period id, or null if not seeded. */
  resolvePeriodId(label: { kind: string; label: string } | null): Promise<string | null>;

  // ── raw layer (idempotent on natural keys; mark dirty) ──
  upsertStatLine(row: StatLineRow): Promise<void>;
  upsertRatingBalldontlie(
    matchBdlId: number,
    playerBdlId: number,
    rating: number | null,
  ): Promise<void>;
  upsertEvent(row: EventRowIn): Promise<void>;
  upsertShot(row: ShotRowIn): Promise<void>;
  upsertTeamStat(row: TeamStatRowIn): Promise<void>;
  /** Re-dirty each affected player for a match-level write (events/shots/team have no dirty col) by
   *  flipping `stat_player_match.dirty` — the channel `sweep`'s `listDirtyPlayerMatches` actually reads. */
  markPlayersDirty(matchBdlId: number, playerBdlIds: readonly number[]): Promise<void>;

  // ── locking ──
  /** Stamp `locked_at` on the slot. Monotonic: only writes when currently NULL (the DB trigger + Prisma
   *  store also enforce this). Returns `true` when a new lock was written, `false` when already locked
   *  (so callers that need a count, like the post-drop sweep, can distinguish new writes from no-ops). */
  setLockedAt(matchBdlId: number, playerBdlId: number, lockedAt: Date): Promise<boolean>;
  /** The AUTHORITATIVE appeared set: every player BDL-id with a `score_player_match` row for this match
   *  (the participant gate already excluded non-appearers + cross-team contamination). Drives the
   *  coverage-reconciliation lock so a played player whose feed signal the poller missed still stamps. */
  listAppearedPlayerBdlIds(matchBdlId: number): Promise<number[]>;

  // ── scheduler reads ──
  listSchedulableMatches(): Promise<SchedulableMatch[]>;
}
