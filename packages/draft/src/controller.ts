/**
 * The draft CONTROLLER (ARCHITECTURE.md §5; DECISIONS.md → Theme C). The server-authoritative engine
 * that advances a snake draft on two triggers: a pick is submitted ({@link submitPick}) or the timer
 * expires ({@link tickDraft}). It is a pure function of the {@link DraftStore} port — `now: Date` is
 * INJECTED (never read here), the only IO is the store, and the single atomic write + the idempotency
 * guard live inside {@link DraftStore.commitPick}. `pick_deadline_at` is the ONLY timer source of
 * truth: the controller sets it; clients render a countdown against it and are never trusted.
 */
import { SQUAD_SIZE } from "@app/shared";
import { managerForPick } from "./snake";
import { isPositionLegal } from "./roster";
import { selectAutopick } from "./autopick";
import {
  DraftNotActiveError,
  DraftNotFoundError,
  DraftNotReadyError,
  NotYourTurnError,
  PickConflictError,
  PlayerUnavailableError,
  PositionFullError,
  UnknownPlayerError,
} from "./errors";
import type { Advance, DraftSnapshot, DraftStore, PickCommit } from "./store";

/** The outcome of a placed pick (manual or auto). `complete` is true if it was the final pick. */
export interface PickResult {
  pickNo: number;
  managerId: string;
  playerId: string;
  isAuto: boolean;
  complete: boolean;
}

export interface StartResult {
  started: boolean;
}

export type TickReason =
  | "not-active"
  | "before-deadline"
  | "no-eligible-player"
  | "already-advanced"
  | "autopicked";

export interface TickResult {
  acted: boolean;
  reason: TickReason;
  pick?: PickResult;
}

/** Total picks in a completed draft = the 15-man squad × the manager count (15 × N). */
function totalPicks(orderedManagerIds: readonly string[]): number {
  return SQUAD_SIZE * orderedManagerIds.length;
}

/** Build the atomic commit (pick row + ownership + pointer advance) for filling the current pick. */
function buildCommit(
  d: DraftSnapshot,
  pickNo: number,
  managerId: string,
  playerId: string,
  isAuto: boolean,
  now: Date,
): PickCommit {
  const total = totalPicks(d.orderedManagerIds);
  const advance: Advance =
    pickNo >= total
      ? { kind: "complete" }
      : {
          kind: "next",
          nextPickNo: pickNo + 1,
          nextManagerId: managerForPick(pickNo + 1, d.orderedManagerIds),
          pickDeadlineAt: d.timerEnabled
            ? new Date(now.getTime() + d.draftPickSeconds * 1000)
            : null,
        };
  return {
    draftId: d.draftId,
    leagueId: d.leagueId,
    pickNo,
    managerId,
    playerId,
    isAuto,
    madeAt: now,
    advance,
  };
}

/**
 * Start a pending draft: pick 1, the first manager by snake on the clock, and the first deadline at
 * `now + draft_pick_seconds`. Idempotent — a draft that is not `pending` returns `{ started: false }`.
 */
export async function startDraft(
  store: DraftStore,
  draftId: string,
  now: Date,
): Promise<StartResult> {
  const d = await store.loadDraft(draftId);
  if (!d) throw new DraftNotFoundError(draftId);
  if (d.status !== "pending") return { started: false };
  if (d.orderedManagerIds.length === 0) {
    throw new DraftNotReadyError(draftId, "no managers have a draft_slot");
  }
  const currentManagerId = managerForPick(1, d.orderedManagerIds);
  const pickDeadlineAt = d.timerEnabled
    ? new Date(now.getTime() + d.draftPickSeconds * 1000)
    : null;
  const started = await store.initDraft(draftId, {
    currentPickNo: 1,
    currentManagerId,
    pickDeadlineAt,
  });
  return { started };
}

/**
 * Place a manual pick. Validates (turn / availability / position-legality), then writes the pick +
 * ownership + advance in ONE transaction. Rejects with a typed error (NO partial write) on any
 * failure; a lost commit guard (the draft advanced underneath us) surfaces as {@link PickConflictError}.
 */
export async function submitPick(
  store: DraftStore,
  draftId: string,
  managerId: string,
  playerId: string,
  now: Date,
): Promise<PickResult> {
  const d = await store.loadDraft(draftId);
  if (!d) throw new DraftNotFoundError(draftId);

  const { status, currentPickNo, currentManagerId, leagueId } = d;
  if (status !== "active" || currentPickNo === null || currentManagerId === null) {
    throw new DraftNotActiveError(draftId, status);
  }
  if (currentManagerId !== managerId) {
    throw new NotYourTurnError(draftId, managerId, currentManagerId);
  }

  const owned = await store.listOwnedPlayerIds(leagueId);
  if (owned.has(playerId)) throw new PlayerUnavailableError(playerId);

  const position = await store.getPlayerPosition(playerId);
  if (position === null) throw new UnknownPlayerError(playerId);

  const counts = await store.getRosterCounts(managerId);
  if (!isPositionLegal(counts, position)) throw new PositionFullError(managerId, position);

  const commit = buildCommit(d, currentPickNo, managerId, playerId, false, now);
  const committed = await store.commitPick(commit);
  if (!committed) throw new PickConflictError(draftId, currentPickNo);

  return {
    pickNo: currentPickNo,
    managerId,
    playerId,
    isAuto: false,
    complete: commit.advance.kind === "complete",
  };
}

/**
 * The timer-expiry path the worker calls. If the current pick's deadline has passed, autopick for the
 * manager on the clock (queue → best-available) and advance — all through the same transactional
 * commit (`is_auto = true`). Idempotent: before the deadline, or once a pick already filled the slot,
 * it is a no-op. `now` is injected; this never reads a clock.
 */
export async function tickDraft(
  store: DraftStore,
  draftId: string,
  now: Date,
): Promise<TickResult> {
  const d = await store.loadDraft(draftId);
  if (!d) throw new DraftNotFoundError(draftId);

  const { status, currentPickNo, currentManagerId, pickDeadlineAt, leagueId } = d;
  if (
    status !== "active" ||
    currentPickNo === null ||
    currentManagerId === null ||
    pickDeadlineAt === null
  ) {
    return { acted: false, reason: "not-active" };
  }
  if (now.getTime() < pickDeadlineAt.getTime()) {
    return { acted: false, reason: "before-deadline" };
  }

  const [owned, counts, queue, ranking] = await Promise.all([
    store.listOwnedPlayerIds(leagueId),
    store.getRosterCounts(currentManagerId),
    store.getQueue(currentManagerId),
    store.getDefaultRanking(leagueId),
  ]);

  const playerId = selectAutopick({ queue, ranking, counts, isAvailable: (id) => !owned.has(id) });
  if (playerId === null) {
    // SEAM: nobody eligible (queue exhausted + ranking empty/unwired). We do NOT advance — surface it.
    // TODO(confirm): the stall policy (skip the manager? pause?) once a real ranking source is wired.
    return { acted: false, reason: "no-eligible-player" };
  }

  const commit = buildCommit(d, currentPickNo, currentManagerId, playerId, true, now);
  const committed = await store.commitPick(commit);
  if (!committed) {
    // A submit filled this pick between our load and commit — the guard makes it a clean no-op.
    return { acted: false, reason: "already-advanced" };
  }
  return {
    acted: true,
    reason: "autopicked",
    pick: {
      pickNo: currentPickNo,
      managerId: currentManagerId,
      playerId,
      isAuto: true,
      complete: commit.advance.kind === "complete",
    },
  };
}
