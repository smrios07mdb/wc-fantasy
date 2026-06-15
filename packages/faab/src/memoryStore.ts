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
import { PLAYOFF_ROSTER, SQUAD_SIZE, type Position } from "@app/shared";
import type { BidInput, ManagerState } from "./resolve";
import type { ReleaseRosterPlayer } from "./release";
import type {
  BatchContext,
  CommitBatchInput,
  FaabBatchStore,
  FaabBidStore,
  FaabReleaseStore,
  FaGrantContext,
  FaGrantStore,
  FaTargetFacts,
  ManagerBidContext,
  OverCapSurvivor,
  PersistedBid,
  PlayerFacts,
  ReleaseContext,
} from "./store";
import type { PeriodWindowView } from "./window";

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
  /** The league's phase squad cap (15 group / 9 playoff). Defaults to the group cap. */
  rosterCap?: number;
}

export class MemoryFaabBatchStore implements FaabBatchStore {
  private readonly leagueId: string;
  private readonly managers: Map<string, MemManager>;
  private readonly bids: MemBid[] = [];
  private readonly rosterCap: number;
  readonly batches: { id: string; runAt: Date }[] = [];
  /** Periods this store has already cleared — the in-memory mirror of `period.batch_cleared_at IS NULL`
   *  conditional claim (the once-only entry gate). */
  private readonly clearedPeriods = new Set<string>();

  constructor(seed: MemorySeed) {
    this.leagueId = seed.leagueId;
    this.rosterCap = seed.rosterCap ?? SQUAD_SIZE;
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
      rosterCap: this.rosterCap,
    };
  }

  async commitBatch({ runAt, outcome, claimPeriodId }: CommitBatchInput): Promise<string | null> {
    // ENTRY GATE (mirrors the Prisma conditional `batch_cleared_at IS NULL` claim): the FIRST run for a
    // period wins; a second concurrent/overlapping run finds it already claimed → abort, NOTHING applied.
    if (this.clearedPeriods.has(claimPeriodId)) return null;
    this.clearedPeriods.add(claimPeriodId);

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
  /** The league's phase squad cap (15 group / 9 playoff). Defaults to the group cap. */
  rosterCap?: number;
  owned: Set<string>;
}

export interface MemoryBidSeed {
  managers: MemBidManager[];
  /** playerId → its position + the add target's PERIOD first kickoff (the acquisition cutoff). */
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
      rosterCap: m.rosterCap ?? SQUAD_SIZE,
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

// ── the $0 free-agency route's double (Prompt 48) ──────────────────────────────────

interface MemFaManager {
  managerId: string;
  leagueId: string;
  faabBudget: number;
  counts: Record<Position, number>;
  squadSize: number;
  /** The league's phase squad cap (15 group / 9 playoff). Defaults to the group cap. */
  rosterCap?: number;
  owned: Set<string>;
}

export interface MemoryFaGrantSeed {
  managers: MemFaManager[];
  /** playerId → its FA facts (position, the add target's period window, FA-eligibility snapshot). */
  players: Record<string, FaTargetFacts>;
  /** periodId → that period's window, for the commissioner `--period` pin: `claimFreeAgent` resolves the
   *  snapshot from the NAMED period's batch_cleared_at instead of the add's next-fixture-inferred one
   *  (mirrors prismaStore.resolveAddPeriodWindow's pinned branch). */
  periods?: Record<string, PeriodWindowView>;
  /** players LOCKED by play (lineup_slot.locked_at in an active matchday) — undroppable until it ends. */
  lockedDrops?: string[];
  /** players actively owned by SOMEONE league-wide at start (the active-ownership claim guard). */
  leagueOwned?: string[];
}

/**
 * In-memory {@link FaGrantStore} double for the FA-grant handler tests. Models the manager slice, the
 * per-player FA facts, and a mutable league-ownership set so `claimFreeAgent` can enforce the first-come
 * rule: the SECOND grab of the same player sees it owned and returns "conflict" (mirrors the production
 * `roster_player_active_ownership_uq` partial unique). No database.
 */
export class MemoryFaGrantStore implements FaGrantStore {
  private readonly managers: Map<string, MemFaManager>;
  private readonly players: Record<string, FaTargetFacts>;
  private readonly periods: Record<string, PeriodWindowView>;
  private readonly lockedDrops: Set<string>;
  private readonly leagueOwned: Set<string>;
  readonly grants: { managerId: string; playerAddId: string; playerDropId: string | null }[] = [];

  constructor(seed: MemoryFaGrantSeed) {
    this.managers = new Map(seed.managers.map((m) => [m.managerId, m]));
    this.players = seed.players;
    this.periods = seed.periods ?? {};
    this.lockedDrops = new Set(seed.lockedDrops ?? []);
    this.leagueOwned = new Set(seed.leagueOwned ?? []);
  }

  async loadManagerFaContext(managerId: string): Promise<FaGrantContext | null> {
    const m = this.managers.get(managerId);
    if (!m) return null;
    return {
      leagueId: m.leagueId,
      counts: { ...m.counts },
      squadSize: m.squadSize,
      rosterCap: m.rosterCap ?? SQUAD_SIZE,
      ownedByManager: new Set(m.owned),
    };
  }

  async getFaTargetFacts(_leagueId: string, playerId: string): Promise<FaTargetFacts | null> {
    const p = this.players[playerId];
    return p ? { ...p, window: { ...p.window } } : null;
  }

  async getDropFacts(playerId: string): Promise<{ position: Position } | null> {
    const p = this.players[playerId];
    return p ? { position: p.position } : null;
  }

  async isDropLocked(_managerId: string, playerDropId: string): Promise<boolean> {
    return this.lockedDrops.has(playerDropId);
  }

  async claimFreeAgent(input: {
    leagueId: string;
    managerId: string;
    playerAddId: string;
    playerDropId: string | null;
    runAt: Date;
    periodId?: string | null;
  }): Promise<"granted" | "conflict"> {
    // Resolve the add's snapshot window the way prismaStore.claimFreeAgent does: a pinned period (commish
    // --period) overrides the add's inferred next-fixture window. A null batch_cleared_at = the period is
    // still sealed ("window not open") → conflict, mirroring the prismaStore `if (T === null)` guard.
    const window =
      input.periodId != null
        ? this.periods[input.periodId]
        : this.players[input.playerAddId]?.window;
    if (!window || window.batchClearedAt === null) return "conflict";

    // First-come guard: the add target must still be unowned league-wide (the active-ownership unique).
    if (this.leagueOwned.has(input.playerAddId)) return "conflict";
    const m = this.managers.get(input.managerId);
    if (!m) return "conflict";

    if (input.playerDropId !== null) {
      if (!m.owned.has(input.playerDropId)) return "conflict"; // the drop must still be owned
      m.owned.delete(input.playerDropId);
      this.leagueOwned.delete(input.playerDropId);
      const dropPos = this.players[input.playerDropId]?.position;
      if (dropPos) m.counts[dropPos] -= 1;
    }
    m.owned.add(input.playerAddId);
    this.leagueOwned.add(input.playerAddId);
    m.counts[this.players[input.playerAddId]!.position] += 1;
    this.grants.push({
      managerId: input.managerId,
      playerAddId: input.playerAddId,
      playerDropId: input.playerDropId,
    });
    return "granted";
  }

  // ── read helpers for assertions ───────────────────────────────────────────────
  ownedBy(managerId: string): string[] {
    return [...(this.managers.get(managerId)?.owned ?? [])];
  }
  /** The manager's budget — proves a $0 FA grant never debits it (claimFreeAgent never touches it). */
  budgetOf(managerId: string): number | undefined {
    return this.managers.get(managerId)?.faabBudget;
  }
}

// ── the playoff trim-down release double (DECISIONS §D trim-down) ──────────────────

interface MemReleaseManager {
  managerId: string;
  leagueId: string;
  /** The manager's active roster (id + position) — mutated by releaseRoster. */
  roster: ReleaseRosterPlayer[];
  /** Phase squad cap (defaults to PLAYOFF_ROSTER.cap = 9). */
  rosterCap?: number;
  /** Players locked by play (undroppable on the manager path until the matchday ends). */
  lockedPlayerIds?: string[];
  /** Defaults true (playoff phase). */
  isPlayoffPhase?: boolean;
  /** D4 participant gate (defaults true). */
  isPlayoffParticipant?: boolean;
  currentPeriodId?: string | null;
}

export interface MemoryReleaseSeed {
  managers: MemReleaseManager[];
}

/**
 * In-memory {@link FaabReleaseStore} double for the release handler + `commish:trim` orchestrator tests.
 * Models the manager's roster + locked set; `releaseRoster` drops players and, on the manager path, FAILS
 * LOUD (throws) if a locked drop reaches it — the same TOCTOU divergence the Prisma adapter's guard catches.
 */
export class MemoryFaabReleaseStore implements FaabReleaseStore {
  private readonly managers = new Map<string, MemReleaseManager>();

  constructor(seed: MemoryReleaseSeed) {
    for (const m of seed.managers) {
      this.managers.set(m.managerId, { ...m, roster: m.roster.map((p) => ({ ...p })) });
    }
  }

  async loadReleaseContext(managerId: string): Promise<ReleaseContext | null> {
    const m = this.managers.get(managerId);
    if (!m) return null;
    return {
      leagueId: m.leagueId,
      roster: m.roster.map((p) => ({ ...p })),
      rosterCap: m.rosterCap ?? PLAYOFF_ROSTER.cap,
      lockedPlayerIds: new Set(m.lockedPlayerIds ?? []),
      isPlayoffPhase: m.isPlayoffPhase ?? true,
      isPlayoffParticipant: m.isPlayoffParticipant ?? true,
      currentPeriodId: m.currentPeriodId ?? null,
    };
  }

  async releaseRoster(
    managerId: string,
    dropIds: readonly string[],
    opts: { now: Date; periodId: string | null; allowLocked: boolean },
  ): Promise<{ releasedSlots: number }> {
    const m = this.managers.get(managerId);
    if (!m) throw new Error(`releaseRoster: unknown manager ${managerId}`);
    const set = new Set(dropIds);
    if (!opts.allowLocked) {
      const stale = (m.lockedPlayerIds ?? []).filter((id) => set.has(id));
      if (stale.length > 0) throw new Error(`release aborted: stale lock on ${stale.join(", ")}`);
    } else {
      m.lockedPlayerIds = (m.lockedPlayerIds ?? []).filter((id) => !set.has(id));
    }
    const before = m.roster.length;
    m.roster = m.roster.filter((p) => !set.has(p.playerId));
    return { releasedSlots: before - m.roster.length };
  }

  async listOverCapPlayoffSurvivors(leagueId: string): Promise<OverCapSurvivor[]> {
    const out: OverCapSurvivor[] = [];
    for (const m of this.managers.values()) {
      if (m.leagueId !== leagueId) continue;
      if ((m.isPlayoffPhase ?? true) !== true) continue;
      if (m.isPlayoffParticipant === false) continue; // not an alive survivor
      const cap = m.rosterCap ?? PLAYOFF_ROSTER.cap;
      if (m.roster.length > cap) {
        out.push({ managerId: m.managerId, rosterCount: m.roster.length, rosterCap: cap });
      }
    }
    return out;
  }

  /** The manager's remaining roster ids — for assertions. */
  rosterOf(managerId: string): string[] {
    return (this.managers.get(managerId)?.roster ?? []).map((p) => p.playerId);
  }
}
