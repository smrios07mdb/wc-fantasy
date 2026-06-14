/**
 * The ingestion IO PORT (ARCHITECTURE.md §3/§4). Raw upserts are idempotent on natural keys; every
 * write that affects scoring marks (match, player) dirty so the existing recompute sweep recomputes.
 * Internal UUIDs are resolved from BALLDONTLIE ids here, so the pure mappers stay id-agnostic. The
 * orchestration ({@link ./ingest}) is a pure function of this interface, unit-testable against
 * {@link ./memoryStore} with NO database.
 */
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

/** Which derivation produced a lock-write attempt — carried through `lockSlot` into the structured log
 *  so the next incident's path is greppable in Render in minutes. */
export type LockPath = "xi-pull" | "sub-event" | "reconcile" | "sweep";

export interface SchedulableMatch {
  bdlId: number;
  status: string;
  kickoffMs: number;
  hasRating: boolean;
  lineupPulled: boolean;
  /** Whether a `match_lineup_entry` already exists for this match — drives the T-75 availability peek's
   *  ONCE-per-match firing (the `ModeMatch.lineupPeeked` proxy). Independent of `lineupPulled`. OPTIONAL
   *  so existing `SchedulableMatch` fixtures (e.g. lockSweep.test) stay byte-untouched; the stores always
   *  populate it (the Prisma EXISTS / the memory derivation). */
  lineupPeeked?: boolean;
  kickoffLockFallback: boolean;
}

/** One mapped pre-kickoff lineup row for `upsertLineupEntries` (availability badge). BDL-keyed like
 *  every feed row; `isStarter` separates the real XI from the bench. Carries no lock/score concern. */
export interface LineupEntryIn {
  playerBdlId: number;
  isStarter: boolean;
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
   *  flipping `stat_player_match.dirty` — the channel `sweep`'s `claimDirtyPlayerMatches` actually reads. */
  markPlayersDirty(matchBdlId: number, playerBdlIds: readonly number[]): Promise<void>;

  // ── availability peek (pre-kickoff lineup snapshot; NOT a lock) ──
  /**
   * Persist the pre-kickoff official-lineup snapshot for a match (the Set Lineup availability badge).
   * Resolves BDL ids → internal UUIDs and upserts each row keyed by `UNIQUE(match_id, player_id)`;
   * idempotent re-pull. This is a PLAIN table write — it routes NOWHERE near the lock-write boundary
   * (`lockSlot`), sets no `lineupPulled`, and marks nothing dirty (the engine never reads this table).
   * Players the feed lists that we don't have rostered are skipped (unresolved ref), like the raw layer.
   */
  upsertLineupEntries(matchBdlId: number, entries: readonly LineupEntryIn[]): Promise<void>;

  // ── locking ──
  /**
   * THE single lock-on-play write boundary (DECISIONS lock-on-play; ARCHITECTURE §3). Every lock writer —
   * XI-pull, sub-event, coverage reconcile, post-drop sweep — routes through here; nothing else writes
   * `lineup_slot.locked_at`. Before stamping it enforces the categorical invariant {@link isLockWriteAuthorized}
   * against the SOURCE match (`matchBdlId`): the player's team must be one side of that match, the match must
   * be in-play-or-later, the instant must have arrived, and there must be a period to scope to. This blocks
   * the 2026-06-12 wrong-match / non-participant leak class at the boundary, independent of any upstream feed
   * or mapping bug. The write is period-scoped + monotonic (only `locked_at IS NULL`). `now` gates the write;
   * `path` is for the structured log. Returns `true` only when a NEW lock was written (the sweep counts these).
   */
  lockSlot(
    matchBdlId: number,
    playerBdlId: number,
    lockedAt: Date,
    now: Date,
    path: LockPath,
  ): Promise<boolean>;
  /** The AUTHORITATIVE appeared set: every player BDL-id with a `score_player_match` row for this match
   *  (the participant gate already excluded non-appearers + cross-team contamination). Drives the
   *  coverage-reconciliation lock so a played player whose feed signal the poller missed still stamps. */
  listAppearedPlayerBdlIds(matchBdlId: number): Promise<number[]>;

  // ── scheduler reads ──
  listSchedulableMatches(): Promise<SchedulableMatch[]>;
}
