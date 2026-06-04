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
import type { QueueEntry, RankedPlayer } from "./autopick";
import type { DraftInit, DraftSnapshot, DraftStore, PickCommit } from "./store";

interface DraftRow {
  draftId: string;
  leagueId: string;
  status: DraftStatus;
  currentPickNo: number | null;
  currentManagerId: string | null;
  pickDeadlineAt: Date | null;
  draftPickSeconds: number;
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
  private queues = new Map<string, QueueEntry[]>();
  private rankings = new Map<string, RankedPlayer[]>();

  // ── seeding (test setup) ──
  seedDraft(row: SeedDraft): void {
    this.drafts.set(row.draftId, {
      draftId: row.draftId,
      leagueId: row.leagueId,
      orderedManagerIds: [...row.orderedManagerIds],
      draftPickSeconds: row.draftPickSeconds,
      status: row.status ?? "pending",
      currentPickNo: row.currentPickNo ?? null,
      currentManagerId: row.currentManagerId ?? null,
      pickDeadlineAt: row.pickDeadlineAt ?? null,
    });
  }
  seedPlayer(playerId: string, position: Position): void {
    this.playerPosition.set(playerId, position);
  }
  seedQueue(managerId: string, entries: readonly QueueEntry[]): void {
    this.queues.set(managerId, [...entries]);
    for (const e of entries) this.playerPosition.set(e.playerId, e.position);
  }
  seedRanking(leagueId: string, ranked: readonly RankedPlayer[]): void {
    this.rankings.set(leagueId, [...ranked]);
    for (const r of ranked) this.playerPosition.set(r.playerId, r.position);
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
  getDefaultRanking(leagueId: string): Promise<RankedPlayer[]> {
    return Promise.resolve([...(this.rankings.get(leagueId) ?? [])]);
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
