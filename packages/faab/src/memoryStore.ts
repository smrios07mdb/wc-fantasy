/**
 * In-memory {@link FaabBatchStore} double — the test substitute the batch controller runs against, so
 * the locked clearing flow is exercised with no database. It mirrors the production Prisma adapter's
 * SEMANTICS: `commitBatch` settles ONLY still-`pending` bids (the idempotency guard), debits the
 * winner, applies the add/drop, refunds nothing on a void (the budget was never debited), and rewrites
 * the waiver order when a tiebreak moved someone. It also exposes a few read helpers for assertions.
 *
 * NOT exported from the package root used by production — it lives here only for the controller tests
 * (the same arrangement as @app/draft's MemoryDraftStore).
 */
import type { Position } from "@app/shared";
import type { BidInput, ManagerState } from "./resolve";
import type {
  BatchContext,
  CommitBatchInput,
  FaabBatchStore,
  FaabBidStore,
  ManagerBidContext,
  PersistedBid,
  PlayerFacts,
} from "./store";

type Status = "pending" | "won" | "lost" | "voided_refunded";

interface MemBid extends BidInput {
  status: Status;
  batchId: string | null;
}

interface MemManager {
  managerId: string;
  faabBudget: number;
  waiverOrderPosition: number | null;
  counts: Record<Position, number>;
  owned: Set<string>;
}

export interface MemorySeed {
  leagueId: string;
  managers: ManagerState[];
}

export class MemoryFaabBatchStore implements FaabBatchStore {
  private readonly leagueId: string;
  private readonly managers: Map<string, MemManager>;
  private readonly bids: MemBid[] = [];
  readonly batches: { id: string; runAt: Date }[] = [];

  constructor(seed: MemorySeed) {
    this.leagueId = seed.leagueId;
    this.managers = new Map(
      seed.managers.map((m) => [
        m.managerId,
        {
          managerId: m.managerId,
          faabBudget: m.faabBudget,
          waiverOrderPosition: m.waiverOrderPosition,
          counts: { ...m.counts },
          owned: new Set(m.ownedPlayerIds),
        },
      ]),
    );
  }

  addPendingBid(bid: BidInput): void {
    this.bids.push({ ...bid, status: "pending", batchId: null });
  }

  async loadBatchContext(leagueId: string): Promise<BatchContext | null> {
    if (leagueId !== this.leagueId) return null;
    const owned = new Set<string>();
    for (const m of this.managers.values()) for (const p of m.owned) owned.add(p);
    return {
      leagueId,
      managers: [...this.managers.values()].map((m) => ({
        managerId: m.managerId,
        faabBudget: m.faabBudget,
        waiverOrderPosition: m.waiverOrderPosition,
        counts: { ...m.counts },
        ownedPlayerIds: [...m.owned],
      })),
      bids: this.bids
        .filter((b) => b.status === "pending")
        .map(({ status: _s, batchId: _b, ...bid }) => bid),
      ownedByLeague: owned,
    };
  }

  async commitBatch({ runAt, outcome }: CommitBatchInput): Promise<string> {
    const batchId = `batch-${this.batches.length + 1}`;
    this.batches.push({ id: batchId, runAt });

    for (const r of outcome.resolutions) {
      const bid = this.bids.find((b) => b.bidId === r.bidId);
      if (!bid || bid.status !== "pending") continue; // the idempotency guard
      if (r.outcome === "won") {
        const m = this.managers.get(r.managerId)!;
        m.faabBudget -= r.amount;
        if (r.playerDropId !== null) {
          m.owned.delete(r.playerDropId);
          const dropBid = bid;
          if (dropBid.dropPosition) m.counts[dropBid.dropPosition] -= 1;
        }
        m.owned.add(r.playerAddId);
        m.counts[bid.addPosition] += 1;
        bid.status = "won";
      } else if (r.outcome === "lost") {
        bid.status = "lost";
      } else {
        bid.status = "voided_refunded"; // refund = no budget change
      }
      bid.batchId = batchId;
    }

    if (outcome.waiverOrderChanged) {
      for (const slot of outcome.waiverOrder) {
        const m = this.managers.get(slot.managerId);
        if (m) m.waiverOrderPosition = slot.position;
      }
    }
    return batchId;
  }

  // ── read helpers for assertions ───────────────────────────────────────────────
  bidStatus(bidId: string): Status | undefined {
    return this.bids.find((b) => b.bidId === bidId)?.status;
  }
  bidBatchId(bidId: string): string | null | undefined {
    return this.bids.find((b) => b.bidId === bidId)?.batchId;
  }
  budgetOf(managerId: string): number | undefined {
    return this.managers.get(managerId)?.faabBudget;
  }
  ownedBy(managerId: string): string[] {
    return [...(this.managers.get(managerId)?.owned ?? [])];
  }
  waiverPositionOf(managerId: string): number | null | undefined {
    return this.managers.get(managerId)?.waiverOrderPosition;
  }
}

// ── the bid route's double ───────────────────────────────────────────────────────

interface MemBidRow {
  bidId: string;
  managerId: string;
  playerAddId: string;
  playerDropId: string | null;
  amount: number;
  note: string | null;
  status: Status;
}

interface MemBidManager {
  managerId: string;
  leagueId: string;
  faabBudget: number;
  counts: Record<Position, number>;
  squadSize: number;
  owned: Set<string>;
}

export interface MemoryBidSeed {
  managers: MemBidManager[];
  /** playerId → its position + add-target kickoff. */
  players: Record<string, PlayerFacts>;
  /** players actively owned by ANY manager in the league. */
  leagueOwned?: string[];
  /** players LOCKED by play (lineup_slot.locked_at in an active matchday) — undroppable until it ends. */
  lockedDrops?: string[];
}

/**
 * In-memory {@link FaabBidStore} double for the bid-route handler tests. Models just enough — the
 * manager slice, per-player facts, and a mutable pending-bid list — to exercise submission validation
 * and the self-scoped edit/cancel guards without a database.
 */
export class MemoryFaabBidStore implements FaabBidStore {
  private readonly managers: Map<string, MemBidManager>;
  private readonly players: Record<string, PlayerFacts>;
  private readonly leagueOwned: Set<string>;
  private readonly lockedDrops: Set<string>;
  readonly rows: MemBidRow[] = [];
  private seq = 0;

  constructor(seed: MemoryBidSeed) {
    this.managers = new Map(seed.managers.map((m) => [m.managerId, m]));
    this.players = seed.players;
    this.leagueOwned = new Set(seed.leagueOwned ?? []);
    this.lockedDrops = new Set(seed.lockedDrops ?? []);
  }

  async loadManagerBidContext(managerId: string): Promise<ManagerBidContext | null> {
    const m = this.managers.get(managerId);
    if (!m) return null;
    return {
      leagueId: m.leagueId,
      faabBudget: m.faabBudget,
      counts: { ...m.counts },
      squadSize: m.squadSize,
      ownedByManager: new Set(m.owned),
      ownedByLeague: new Set(this.leagueOwned),
    };
  }

  async sumOtherPendingBids(managerId: string, exceptBidId: string | null): Promise<number> {
    return this.rows
      .filter((r) => r.managerId === managerId && r.status === "pending" && r.bidId !== exceptBidId)
      .reduce((sum, r) => sum + r.amount, 0);
  }

  async getPlayerFacts(playerId: string): Promise<PlayerFacts | null> {
    return this.players[playerId] ?? null;
  }

  async isDropLocked(_managerId: string, playerDropId: string): Promise<boolean> {
    return this.lockedDrops.has(playerDropId);
  }

  async createBid(bid: {
    leagueId: string;
    managerId: string;
    playerAddId: string;
    playerDropId: string | null;
    amount: number;
    note: string | null;
    submittedAt: Date;
  }): Promise<PersistedBid> {
    const row: MemBidRow = {
      bidId: `bid-${++this.seq}`,
      managerId: bid.managerId,
      playerAddId: bid.playerAddId,
      playerDropId: bid.playerDropId,
      amount: bid.amount,
      note: bid.note,
      status: "pending",
    };
    this.rows.push(row);
    return this.toPersisted(row);
  }

  async getBid(
    bidId: string,
  ): Promise<{ managerId: string; status: string; playerAddId: string } | null> {
    const r = this.rows.find((x) => x.bidId === bidId);
    return r ? { managerId: r.managerId, status: r.status, playerAddId: r.playerAddId } : null;
  }

  async updateBid(
    bidId: string,
    patch: { amount: number; playerDropId: string | null; note: string | null },
  ): Promise<PersistedBid | null> {
    const r = this.rows.find((x) => x.bidId === bidId);
    if (!r || r.status !== "pending") return null; // guard: only a still-pending bid is editable
    r.amount = patch.amount;
    r.playerDropId = patch.playerDropId;
    r.note = patch.note;
    return this.toPersisted(r);
  }

  async cancelBid(bidId: string): Promise<boolean> {
    const i = this.rows.findIndex((x) => x.bidId === bidId);
    if (i === -1) return false;
    const row = this.rows[i]!;
    if (row.status !== "pending") return false; // guard: only a still-pending bid is cancellable
    this.rows.splice(i, 1);
    return true;
  }

  private toPersisted(r: MemBidRow): PersistedBid {
    return {
      bidId: r.bidId,
      managerId: r.managerId,
      playerAddId: r.playerAddId,
      playerDropId: r.playerDropId,
      amount: r.amount,
      note: r.note,
    };
  }
}
