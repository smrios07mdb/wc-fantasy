/**
 * In-memory {@link DraftStore} — the test double + a handy local harness. It models the same tables
 * the Prisma store reads/writes (draft, draft_pick, roster_player ownership + counts, draft_queue,
 * and the injected ranking), so seeding rows here exercises the REAL controller (snake advance,
 * legality, autopick, completion) with NO database.
 *
 * `commitPick` reproduces the production atomicity + the two DB backstops in a single-threaded body:
 * the `currentPickNo` guard (the monotonic latch), the `draft_pick` unique on (draft, pick_no), and
 * the `roster_player` active-ownership partial-unique. No method ever reads the wall clock.
 */
import type { DraftStatus, Position } from "@app/shared";
import { type PositionCounts } from "./roster";
import { orderDraftPool, type PoolPlayer, type QueueEntry, type RankedPlayer } from "./autopick";
import type { DraftInit, DraftSnapshot, DraftStore, PickCommit } from "./store";

interface DraftRow {
  draftId: string;
  leagueId: string;
  status: DraftStatus;
  currentPickNo: number | null;
  currentManagerId: string | null;
  pickDeadlineAt: Date | null;
  draftPickSeconds: number;
  timerEnabled: boolean;
  orderedManagerIds: string[];
}

interface PickRow {
  draftId: string;
  pickNo: number;
  managerId: string;
  playerId: string;
  isAuto: boolean;
  madeAt: Date;
}

interface SeedDraft {
  draftId: string;
  leagueId: string;
  orderedManagerIds: string[];
  draftPickSeconds: number;
  timerEnabled?: boolean;
  status?: DraftStatus;
  currentPickNo?: number | null;
  currentManagerId?: string | null;
  pickDeadlineAt?: Date | null;
}

const emptyCounts = (): Record<Position, number> => ({ GK: 0, DEF: 0, MID: 0, FWD: 0 });

export class MemoryDraftStore implements DraftStore {
  private drafts = new Map<string, DraftRow>();
  private picks: PickRow[] = [];
  /** leagueId → the set of actively-owned player ids. */
  private owned = new Map<string, Set<string>>();
  /** managerId → per-position counts of actively-owned players. */
  private counts = new Map<string, Record<Position, number>>();
  private playerPosition = new Map<string, Position>();
  /** playerId → default_rank (1-based, lower = better). Absent ⇒ unranked (NULLS LAST in the pool). */
  private playerRank = new Map<string, number>();
  private queues = new Map<string, QueueEntry[]>();

  // ── seeding (test setup) ──
  seedDraft(row: SeedDraft): void {
    this.drafts.set(row.draftId, {
      draftId: row.draftId,
      leagueId: row.leagueId,
      orderedManagerIds: [...row.orderedManagerIds],
      draftPickSeconds: row.draftPickSeconds,
      timerEnabled: row.timerEnabled ?? true,
      status: row.status ?? "pending",
      currentPickNo: row.currentPickNo ?? null,
      currentManagerId: row.currentManagerId ?? null,
      pickDeadlineAt: row.pickDeadlineAt ?? null,
    });
  }
  seedPlayer(playerId: string, position: Position, defaultRank?: number | null): void {
    this.playerPosition.set(playerId, position);
    if (defaultRank != null) this.playerRank.set(playerId, defaultRank);
  }
  seedQueue(managerId: string, entries: readonly QueueEntry[]): void {
    this.queues.set(managerId, [...entries]);
    for (const e of entries) this.playerPosition.set(e.playerId, e.position);
  }
  /** Seed players as the default ranking, best-first; each gets a 1-based `default_rank` by position. */
  seedRanking(_leagueId: string, ranked: readonly RankedPlayer[]): void {
    ranked.forEach((r, i) => this.seedPlayer(r.playerId, r.position, i + 1));
  }
  /** Seed a pre-existing active ownership (player owned by a manager); also bumps the manager's counts. */
  seedOwnership(leagueId: string, managerId: string, playerId: string, position: Position): void {
    this.playerPosition.set(playerId, position);
    this.ownedSet(leagueId).add(playerId);
    this.bumpCount(managerId, position);
  }

  // ── assertions (test reads) ──
  draftRow(draftId: string): DraftRow | undefined {
    return this.drafts.get(draftId);
  }
  pickRows(draftId: string): PickRow[] {
    return this.picks.filter((p) => p.draftId === draftId).sort((a, b) => a.pickNo - b.pickNo);
  }
  isOwned(leagueId: string, playerId: string): boolean {
    return this.ownedSet(leagueId).has(playerId);
  }
  countsOf(managerId: string): PositionCounts {
    return { ...emptyCounts(), ...this.counts.get(managerId) };
  }

  private ownedSet(leagueId: string): Set<string> {
    let set = this.owned.get(leagueId);
    if (!set) {
      set = new Set<string>();
      this.owned.set(leagueId, set);
    }
    return set;
  }
  private bumpCount(managerId: string, position: Position): void {
    const c = this.counts.get(managerId) ?? emptyCounts();
    c[position] += 1;
    this.counts.set(managerId, c);
  }

  // ── DraftStore ──
  loadDraft(draftId: string): Promise<DraftSnapshot | null> {
    const d = this.drafts.get(draftId);
    if (!d) return Promise.resolve(null);
    return Promise.resolve({ ...d, orderedManagerIds: [...d.orderedManagerIds] });
  }
  getPlayerPosition(playerId: string): Promise<Position | null> {
    return Promise.resolve(this.playerPosition.get(playerId) ?? null);
  }
  getRosterCounts(managerId: string): Promise<PositionCounts> {
    return Promise.resolve(this.countsOf(managerId));
  }
  listOwnedPlayerIds(leagueId: string): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.ownedSet(leagueId)));
  }
  getQueue(managerId: string): Promise<QueueEntry[]> {
    return Promise.resolve([...(this.queues.get(managerId) ?? [])]);
  }
  getDefaultRanking(_leagueId: string): Promise<RankedPlayer[]> {
    // The WHOLE pool ordered for autopick: default_rank ASC, NULLS LAST, then id ASC (orderDraftPool).
    // Including unranked players is what keeps autopick total (no unranked-pool stall). Players are
    // global (one private league), mirroring the Prisma adapter, so `_leagueId` is unused.
    const pool: PoolPlayer[] = [...this.playerPosition.entries()].map(([playerId, position]) => ({
      playerId,
      position,
      defaultRank: this.playerRank.get(playerId) ?? null,
    }));
    return Promise.resolve(orderDraftPool(pool));
  }
  commitPick(commit: PickCommit): Promise<boolean> {
    const d = this.drafts.get(commit.draftId);
    // Guard (monotonic latch): only commit while the draft is still on this exact pick.
    if (!d || d.status !== "active" || d.currentPickNo !== commit.pickNo)
      return Promise.resolve(false);
    // Backstop: draft_pick @@unique([draftId, pickNo]).
    if (this.picks.some((p) => p.draftId === commit.draftId && p.pickNo === commit.pickNo)) {
      return Promise.resolve(false);
    }
    // Backstop: roster_player active-ownership partial-unique (one owner per player per league).
    if (this.ownedSet(commit.leagueId).has(commit.playerId)) return Promise.resolve(false);

    // Write pick + ownership.
    this.picks.push({
      draftId: commit.draftId,
      pickNo: commit.pickNo,
      managerId: commit.managerId,
      playerId: commit.playerId,
      isAuto: commit.isAuto,
      madeAt: commit.madeAt,
    });
    this.ownedSet(commit.leagueId).add(commit.playerId);
    const pos = this.playerPosition.get(commit.playerId);
    if (pos) this.bumpCount(commit.managerId, pos);

    // Advance the pointer (or complete).
    if (commit.advance.kind === "complete") {
      d.status = "complete";
      d.currentPickNo = null;
      d.currentManagerId = null;
      d.pickDeadlineAt = null;
    } else {
      d.currentPickNo = commit.advance.nextPickNo;
      d.currentManagerId = commit.advance.nextManagerId;
      d.pickDeadlineAt = commit.advance.pickDeadlineAt;
    }
    return Promise.resolve(true);
  }
  initDraft(draftId: string, init: DraftInit): Promise<boolean> {
    const d = this.drafts.get(draftId);
    if (!d || d.status !== "pending") return Promise.resolve(false);
    d.status = "active";
    d.currentPickNo = init.currentPickNo;
    d.currentManagerId = init.currentManagerId;
    d.pickDeadlineAt = init.pickDeadlineAt;
    return Promise.resolve(true);
  }
  listActiveDraftIds(): Promise<string[]> {
    return Promise.resolve(
      [...this.drafts.values()].filter((d) => d.status === "active").map((d) => d.draftId),
    );
  }
}
