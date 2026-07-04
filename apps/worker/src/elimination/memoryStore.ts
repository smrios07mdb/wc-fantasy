/**
 * In-memory {@link TeamEliminationStore} double for the dispatcher tests. It mirrors BOTH halves of the
 * Prisma adapter DB-free:
 *  - the FREEZE-GATED read — `loadFrozenCompletedKnockoutMatches` returns only seeded rows that are
 *    `status='completed'` AND `periodKind==='knockout_round'` AND `periodFrozen` (a `periodKind` of null
 *    models `period_id = NULL`, e.g. the 3rd-place match, which the SQL join excludes);
 *  - the guarded, set-only write — `flagEliminated` flips a team ONLY when currently `eliminated = false`
 *    and never sets it false, returning the ids actually flipped.
 * It counts `flagCalls` so the two no-op paths (loser union empty ⇒ never called; all already flagged ⇒
 * called, flips nothing) can be told apart. NOT used in production (the Prisma adapter is `prismaStore.ts`).
 */
import type { PeriodKind } from "@app/shared";
import type { KnockoutMatchResult } from "./selectEliminatedTeams";
import type { TeamEliminationStore } from "./store";

/**
 * A seeded `fifa_match` row for the double: the pure {@link KnockoutMatchResult} projection PLUS the two
 * joined-`period` fields the read filters on. `periodKind: null` models `period_id = NULL` (no join row).
 */
export interface SeedFifaMatch extends KnockoutMatchResult {
  periodKind: PeriodKind | null;
  periodFrozen: boolean;
}

export class MemoryTeamEliminationStore implements TeamEliminationStore {
  private readonly seed: SeedFifaMatch[];
  /** Current `eliminated` state per team id (true = flagged). Unknown ids default to not-eliminated. */
  private readonly eliminated: Map<string, boolean>;
  /** How many times `flagEliminated` was invoked — distinguishes the two no-op paths. */
  flagCalls = 0;

  constructor(seed: SeedFifaMatch[], eliminated: Record<string, boolean> = {}) {
    this.seed = seed.map((m) => ({ ...m }));
    this.eliminated = new Map(Object.entries(eliminated));
  }

  async loadFrozenCompletedKnockoutMatches(): Promise<KnockoutMatchResult[]> {
    // The read filter, mirroring the prismaStore WHERE (status='completed' AND period.kind='knockout_round'
    // AND period.frozen_at NOT NULL), projected back down to the pure `KnockoutMatchResult` shape.
    return this.seed
      .filter(
        (m) => m.status === "completed" && m.periodKind === "knockout_round" && m.periodFrozen,
      )
      .map((m) => ({
        status: m.status,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeScoreEt: m.homeScoreEt,
        awayScoreEt: m.awayScoreEt,
        homeScorePens: m.homeScorePens,
        awayScorePens: m.awayScorePens,
      }));
  }

  async flagEliminated(teamIds: string[]): Promise<string[]> {
    this.flagCalls += 1;
    const flipped: string[] = [];
    for (const id of teamIds) {
      if (this.eliminated.get(id) === true) continue; // guarded: WHERE eliminated = false
      this.eliminated.set(id, true); // set-only: never false
      flipped.push(id);
    }
    return flipped.sort();
  }

  /** Whether a team is currently flagged eliminated (for assertions). */
  isEliminated(teamId: string): boolean {
    return this.eliminated.get(teamId) === true;
  }
}
