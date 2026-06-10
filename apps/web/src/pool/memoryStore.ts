/**
 * In-memory {@link PoolPickStore} double for the handler unit tests (Prompt 40 §4). It REPLICATES the
 * anti-copying read rule (own picks always; others' only once their match has kicked off) so the read
 * test exercises real behaviour, not a stub. The production adapter is {@link ./prismaStore}.
 */
import type { PoolPrediction } from "@app/shared";
import type {
  PoolMatchFacts,
  PoolPickStore,
  PersistedPoolPick,
  ReadPicksInput,
  UpsertPickInput,
} from "./store";

interface Row {
  pickId: string;
  leagueId: string;
  managerId: string;
  matchId: string;
  prediction: PoolPrediction;
}

export class MemoryPoolPickStore implements PoolPickStore {
  /** Public for test assertions (e.g. "exactly one row after an upsert"). */
  readonly rows: Row[] = [];
  private readonly managerLeague = new Map<string, string>();
  private readonly matchFacts = new Map<string, PoolMatchFacts>();
  private seq = 0;

  // ── seed helpers (chainable) ──────────────────────────────────────────────────
  setManagerLeague(managerId: string, leagueId: string): this {
    this.managerLeague.set(managerId, leagueId);
    return this;
  }
  setMatch(matchId: string, facts: PoolMatchFacts): this {
    this.matchFacts.set(matchId, facts);
    return this;
  }
  seedPick(row: Omit<Row, "pickId">): this {
    this.rows.push({ pickId: `seed_${++this.seq}`, ...row });
    return this;
  }

  // ── port ──────────────────────────────────────────────────────────────────────
  async getManagerLeagueId(managerId: string): Promise<string | null> {
    return this.managerLeague.get(managerId) ?? null;
  }

  async getMatchFacts(matchId: string): Promise<PoolMatchFacts | null> {
    return this.matchFacts.get(matchId) ?? null;
  }

  async upsertPick(input: UpsertPickInput): Promise<PersistedPoolPick> {
    const existing = this.rows.find(
      (r) => r.managerId === input.managerId && r.matchId === input.matchId,
    );
    if (existing) {
      existing.prediction = input.prediction;
      return pick(existing);
    }
    const row: Row = {
      pickId: `pick_${++this.seq}`,
      leagueId: input.leagueId,
      managerId: input.managerId,
      matchId: input.matchId,
      prediction: input.prediction,
    };
    this.rows.push(row);
    return pick(row);
  }

  async readVisiblePicks(input: ReadPicksInput): Promise<PersistedPoolPick[]> {
    const nowMs = input.now.getTime();
    return this.rows
      .filter((r) => r.leagueId === input.leagueId)
      .filter((r) => {
        if (r.managerId === input.managerId) return true; // own picks: always
        const kickoff = this.matchFacts.get(r.matchId)?.kickoffAt.getTime() ?? Infinity;
        return kickoff <= nowMs; // others': only once kicked off
      })
      .map(pick);
  }
}

function pick(r: Row): PersistedPoolPick {
  return { pickId: r.pickId, managerId: r.managerId, matchId: r.matchId, prediction: r.prediction };
}
