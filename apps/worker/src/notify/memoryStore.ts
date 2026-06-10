/**
 * In-memory {@link NotifyTriggerStore} double — the test substitute the trigger orchestration runs
 * against, so the dispatch flow is exercised with no database. Seed methods let a test arrange the
 * fantasy starters for a match and the upcoming-match/owner rows the production Prisma adapter would
 * read. NOT used in production (mirrors @app/draft / @app/notify's Memory doubles).
 */
import type { NotifyTriggerStore } from "./store";
import type { FantasyStarterSlot, UpcomingMatch } from "./selectors";

export class MemoryNotifyTriggerStore implements NotifyTriggerStore {
  private readonly startersByMatchBdl = new Map<number, FantasyStarterSlot[]>();
  private readonly matchIdByBdl = new Map<number, string>();
  private upcoming: UpcomingMatch[] = [];

  seedFantasyStarters(matchBdlId: number, slots: FantasyStarterSlot[]): void {
    this.startersByMatchBdl.set(matchBdlId, slots);
  }
  seedMatchId(matchBdlId: number, matchId: string): void {
    this.matchIdByBdl.set(matchBdlId, matchId);
  }
  seedUpcomingMatches(matches: UpcomingMatch[]): void {
    this.upcoming = matches;
  }

  async listFantasyStartersForMatch(matchBdlId: number): Promise<FantasyStarterSlot[]> {
    return (this.startersByMatchBdl.get(matchBdlId) ?? []).map((s) => ({ ...s }));
  }
  async resolveMatchId(matchBdlId: number): Promise<string | null> {
    return this.matchIdByBdl.get(matchBdlId) ?? null;
  }
  async listUpcomingMatchesWithOwners(_now: Date, _leadMs: number): Promise<UpcomingMatch[]> {
    // The Memory double returns whatever the test seeded verbatim; the pure selector applies the
    // window. (Production's Prisma query pre-filters to the window as an optimisation.)
    return this.upcoming.map((m) => ({ ...m, ownerManagerIds: [...m.ownerManagerIds] }));
  }
}
