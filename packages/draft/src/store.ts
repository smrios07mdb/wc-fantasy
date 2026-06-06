/**
 * The draft store PORT. Every database read/write the controller ({@link ./controller}) needs is
 * expressed here, so the controller is a pure function of this interface and is unit-testable against
 * the in-memory double ({@link ./memoryStore}). The production implementation is the thin Prisma
 * adapter ({@link ./prismaStore}), reachable only via `@app/draft/prisma`.
 *
 * The ONE non-trivial method is {@link DraftStore.commitPick}: the atomic, guarded write of a pick +
 * ownership + the pointer advance. It is where the single transaction lives (Prisma `$transaction`),
 * and where idempotency is enforced — it returns `false` (a no-op) if the draft already moved past
 * the pick, so re-running a tick after a pick is harmless.
 */
import type { DraftStatus, Position } from "@app/shared";
import type { PositionCounts } from "./roster";
import type { QueueEntry, RankedPlayer } from "./autopick";

/** Authoritative draft state the controller reads before deciding a pick. `draftPickSeconds` is the
 *  league config; `orderedManagerIds` are the managers with a non-null `draft_slot`, slot-ascending. */
export interface DraftSnapshot {
  draftId: string;
  leagueId: string;
  status: DraftStatus;
  currentPickNo: number | null;
  currentManagerId: string | null;
  pickDeadlineAt: Date | null;
  draftPickSeconds: number;
  orderedManagerIds: string[];
}

/** How the draft advances after a committed pick: to the next pick, or to completion. */
export type Advance =
  | { kind: "next"; nextPickNo: number; nextManagerId: string; pickDeadlineAt: Date }
  | { kind: "complete" };

/** The atomic unit written for one pick: the `draft_pick` row + `roster_player` ownership + advance. */
export interface PickCommit {
  draftId: string;
  leagueId: string;
  /** The pick being filled; the commit is a no-op unless the draft is still on this pick. */
  pickNo: number;
  managerId: string;
  playerId: string;
  isAuto: boolean;
  madeAt: Date;
  advance: Advance;
}

/** The initial pointer set when a pending draft starts. */
export interface DraftInit {
  currentPickNo: number;
  currentManagerId: string;
  pickDeadlineAt: Date;
}

export interface DraftStore {
  /** Load the draft snapshot (state + league timer + slot-ordered managers), or null if absent. */
  loadDraft(draftId: string): Promise<DraftSnapshot | null>;
  /** The player's position, or null if the player is unknown. */
  getPlayerPosition(playerId: string): Promise<Position | null>;
  /** A manager's current per-position counts of ACTIVELY-owned players. */
  getRosterCounts(managerId: string): Promise<PositionCounts>;
  /** The set of player ids actively owned by ANY manager in the league (availability check). */
  listOwnedPlayerIds(leagueId: string): Promise<ReadonlySet<string>>;
  /** A manager's pre-set autopick queue, in stored `draft_queue.position` order, with positions. */
  getQueue(managerId: string): Promise<QueueEntry[]>;
  /** The WHOLE candidate pool as the autopick ranking: `player.default_rank` ASC, NULLS LAST, then
   *  id ASC (built with `orderDraftPool`). Unranked players are included (ordered by id), so autopick
   *  is total — it can never stall on an unranked pool. */
  getDefaultRanking(leagueId: string): Promise<RankedPlayer[]>;
  /** Atomically write the pick + ownership + advance in ONE transaction. Returns `true` if committed,
   *  `false` (no write) if the guard (draft still on `pickNo`, slot unfilled, player free) lost — which
   *  keeps re-runs idempotent and surfaces concurrent double-picks as a clean no-op, not a duplicate. */
  commitPick(commit: PickCommit): Promise<boolean>;
  /** Start a pending draft (guarded): returns `false` if it was not `pending` (idempotent). */
  initDraft(draftId: string, init: DraftInit): Promise<boolean>;
  /** Ids of drafts currently `active` — the worker tick iterates these. */
  listActiveDraftIds(): Promise<string[]>;
}
