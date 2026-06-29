/**
 * The pool write/read store PORT (Prompt 40 §3). The framework-agnostic handlers ({@link ./handlePick})
 * are pure functions of this interface, so they unit-test against the in-memory double
 * ({@link ./memoryStore}); the production implementation is the thin Prisma adapter
 * ({@link ./prismaStore}). The pure pool ENGINE (@app/pool) carries no IO — this is the only seam that
 * touches the database.
 *
 * The IO loader is where the corrected phase discriminator lands: `getMatchFacts` resolves
 * `fifa_match.periodId → period.kind` and hands the pure engine a `periodKind` (NEVER `round`).
 */
import type { MatchStatus, PeriodKind, PoolPrediction } from "@app/shared";

/**
 * The match facts a submission needs — lifecycle status, the RESOLVED phase, kickoff (the lock), and the two
 * sides' names so the @app/pool guard can reject a pick on an UNRESOLVED knockout fixture (SEC-P4). Mirrors
 * the engine's `PoolPickFacts` (this port re-declares the shape so the IO layer keeps no @app/pool type
 * dependency); each name is null when its team FK is unset, a `Team {id}` string while the slot is TBD.
 */
export interface PoolMatchFacts {
  status: MatchStatus;
  /** Resolved from `fifa_match.periodId → period.kind`; null when the period is unseeded. */
  periodKind: PeriodKind | null;
  kickoffAt: Date;
  /** Home side name (null FK → null; `Team {id}` while the bracket slot is undecided). */
  homeTeamName: string | null;
  /** Away side name (null FK → null; `Team {id}` while the bracket slot is undecided). */
  awayTeamName: string | null;
}

/** A persisted / echoed pool pick. */
export interface PersistedPoolPick {
  pickId: string;
  managerId: string;
  matchId: string;
  prediction: PoolPrediction;
}

export interface UpsertPickInput {
  leagueId: string;
  managerId: string;
  matchId: string;
  prediction: PoolPrediction;
  now: Date;
}

export interface ReadPicksInput {
  leagueId: string;
  managerId: string;
  now: Date;
}

export interface PoolPickStore {
  /** The caller's manager → its `leagueId` (single league per ARCHITECTURE §4), or null if no such manager. */
  getManagerLeagueId(managerId: string): Promise<string | null>;
  /** The match facts for a submit (status + resolved `period.kind` + kickoff), or null if the match is unknown. */
  getMatchFacts(matchId: string): Promise<PoolMatchFacts | null>;
  /** Upsert `(managerId, matchId) → prediction`; returns the persisted row. */
  upsertPick(input: UpsertPickInput): Promise<PersistedPoolPick>;
  /**
   * The picks VISIBLE to the caller, league-scoped: their OWN picks ALWAYS + OTHER managers' picks ONLY
   * for matches that have kicked off (`kickoffAt <= now`). The anti-copying time gate lives HERE (in the
   * query), not in RLS (which has no clock).
   */
  readVisiblePicks(input: ReadPicksInput): Promise<PersistedPoolPick[]>;
}
