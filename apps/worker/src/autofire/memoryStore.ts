/**
 * In-memory {@link AutoFireStore} double for the auto-fire dispatcher tests — holds the knockout-round
 * facts, team names, and commissioner recipients so the IO orchestrator ({@link ./dispatch}) is exercised
 * with no database. NOT used in production (the Prisma adapter is `prismaStore.ts`).
 */
import type { AutoFireRoundRow, AutoFireStore } from "./store";
import type { RoundCompletenessInput } from "./completeness";

export interface MemoryAutoFireSeed {
  /** The single league id these reads are scoped to; pass `null` to model "no league". Default "league-1". */
  leagueId?: string | null;
  rounds?: AutoFireRoundRow[];
  teamNames?: Record<string, string>;
  commissionerManagerIds?: string[];
  /** Per round-period-id completeness inputs. An UNSEEDED period returns the fail-safe empty (incomplete). */
  completenessByPeriod?: Record<string, RoundCompletenessInput>;
}

export class MemoryAutoFireStore implements AutoFireStore {
  private readonly leagueId: string | null;
  private readonly rounds: AutoFireRoundRow[];
  private readonly teamNames: Record<string, string>;
  private readonly commissioners: string[];
  private readonly completenessByPeriod: Record<string, RoundCompletenessInput>;

  constructor(seed: MemoryAutoFireSeed = {}) {
    this.leagueId = seed.leagueId === undefined ? "league-1" : seed.leagueId;
    this.rounds = (seed.rounds ?? []).map((r) => ({ ...r }));
    this.teamNames = { ...(seed.teamNames ?? {}) };
    this.commissioners = [...(seed.commissionerManagerIds ?? [])];
    this.completenessByPeriod = { ...(seed.completenessByPeriod ?? {}) };
  }

  async loadLeagueId(): Promise<string | null> {
    return this.leagueId;
  }
  async loadKnockoutRounds(): Promise<AutoFireRoundRow[]> {
    return this.rounds.map((r) => ({ ...r }));
  }
  async loadTeamNames(): Promise<Record<string, string>> {
    return { ...this.teamNames };
  }
  async loadCommissionerManagerIds(): Promise<string[]> {
    return [...this.commissioners];
  }
  async loadRoundCompleteness(roundPeriodId: string): Promise<RoundCompletenessInput> {
    // Fail-safe default: an unseeded period reads as "no fixtures" (incomplete), so a test must seed
    // completeness to exercise the fire path — mirroring production, where an empty round holds.
    return (
      this.completenessByPeriod[roundPeriodId] ?? { fixtures: [], pendingManagerPeriodDirty: 0 }
    );
  }
}
