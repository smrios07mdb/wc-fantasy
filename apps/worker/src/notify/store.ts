/**
 * The worker-local NOTIFY-TRIGGER read PORT (Prompt 41b). The two trigger reads that are NOT already
 * covered by the draft store live here, so the trigger orchestration ({@link ./triggers}) is a pure
 * function of this interface — unit-testable against {@link ./memoryStore} with no database. The
 * production implementation is the thin Prisma adapter ({@link ./prismaStore}).
 *
 * This deliberately lives in the worker IO layer (not @app/ingest): it is a notification concern, and
 * keeping it here leaves @app/ingest's lock derivation IO-free (grep-clean, per the prompt). The
 * draft-turn trigger needs no method here — it reuses the existing `DraftStore` (loadDraft + list).
 */
import type { FantasyStarterSlot, UpcomingMatch } from "./selectors";

export interface NotifyTriggerStore {
  /**
   * Every fantasy STARTER (is_starter lineup_slot) for the PERIOD of the given match (resolved from the
   * BALLDONTLIE match id), each carrying its player's BDL id (for the official-XI comparison), the
   * internal player id + display name (for the subject + payload), and the slot's `locked_at`. Empty if
   * the match has no seeded period. Used by player-not-starting AFTER the pre-match lineups pull.
   */
  listFantasyStartersForMatch(matchBdlId: number): Promise<FantasyStarterSlot[]>;

  /**
   * Resolve a BALLDONTLIE match id to the internal `fifa_match.id` (for the `${matchId}:${playerId}`
   * subject), or null if the row is absent.
   */
  resolveMatchId(matchBdlId: number): Promise<string | null>;

  /**
   * Upcoming fixtures with kickoff in `[now, now + leadMs]`, each widened to the set of managers who own
   * ≥1 ACTIVE rostered player on EITHER team (owners-only, whole roster). The pure selector re-applies
   * the precise window; this query just bounds the candidate scan. Used by match-starting each tick.
   */
  listUpcomingMatchesWithOwners(now: Date, leadMs: number): Promise<UpcomingMatch[]>;
}
