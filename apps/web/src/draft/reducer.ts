/**
 * PURE Realtime reducers (ARCHITECTURE.md §5: "re-render from the authoritative row state"). When a
 * broadcast lands, the screen folds the changed ROW into its snapshot — no client-derived draft truth,
 * no refetch. The broadcast payload is the raw Postgres row (snake_case columns), so these take the
 * `new` record and patch the view model. A newly-picked player is resolved from the local available
 * pool (the screen already has it, since it WAS available) and consumed; everything stays idempotent so
 * a duplicate/late broadcast is harmless.
 */
import type { DraftStatus } from "@app/shared";
import type { DraftRoomState } from "./types";

/** The `draft` row columns we patch from (snake_case, as Postgres broadcasts them). */
export interface DraftRowChange {
  status?: DraftStatus;
  current_pick_no?: number | null;
  current_manager_id?: string | null;
  pick_deadline_at?: string | null;
  timer_enabled?: boolean;
}

/** Patch the pointer / deadline / status from a `draft` row broadcast. Partial-safe: only fields the
 *  payload actually carries are applied (an absent column keeps its current value; an explicit null —
 *  e.g. on completion — clears it). This is what lets the lobby↔active gate re-derive from the
 *  authoritative `draft.status` without a thin/partial broadcast nulling out the live pointer. */
export function applyDraftRowChange(state: DraftRoomState, row: DraftRowChange): DraftRoomState {
  return {
    ...state,
    status: row.status ?? state.status,
    currentPickNo: "current_pick_no" in row ? (row.current_pick_no ?? null) : state.currentPickNo,
    currentManagerId:
      "current_manager_id" in row ? (row.current_manager_id ?? null) : state.currentManagerId,
    pickDeadlineAt:
      "pick_deadline_at" in row ? (row.pick_deadline_at ?? null) : state.pickDeadlineAt,
    timerEnabled: row.timer_enabled !== undefined ? row.timer_enabled : state.timerEnabled,
  };
}

/** How to fold a `draft` broadcast. The lobby↔active view reads `draft.status`, so a broadcast that
 *  carries an authoritative status is applied directly; a partial one (pointer re-synced but `status`
 *  dropped) signals a re-fetch of the authoritative row, so a lobby client is never stranded on a stale
 *  status (the verified pending→active stall). */
export type DraftBroadcastPlan = { kind: "apply"; change: DraftRowChange } | { kind: "refetch" };

/** Decide how to handle a `draft` broadcast's `new` record (snake_case, possibly partial). */
export function planDraftBroadcast(row: Record<string, unknown> | null): DraftBroadcastPlan {
  if (row && typeof row.status === "string") {
    return { kind: "apply", change: row as unknown as DraftRowChange };
  }
  return { kind: "refetch" };
}

/** The `draft_pick` row columns we fold in. */
export interface PickRowChange {
  pick_no: number;
  manager_id: string;
  player_id: string | null;
  is_auto?: boolean;
}

/** Fold a `draft_pick` broadcast into the snapshot: add the pick, consume the player from the pool. */
export function applyPickRowChange(state: DraftRoomState, row: PickRowChange): DraftRoomState {
  // An unfilled pick row (no player yet) carries nothing to render.
  if (row.player_id === null) return state;
  // Idempotent: a pick already recorded for this slot is a no-op (late/duplicate broadcast).
  if (state.picks.some((p) => p.pickNo === row.pick_no)) return state;

  const player = state.availablePlayers.find((p) => p.id === row.player_id) ?? null;
  const picks = [
    ...state.picks,
    {
      pickNo: row.pick_no,
      managerId: row.manager_id,
      playerId: row.player_id,
      player,
      isAuto: row.is_auto ?? false,
    },
  ].sort((a, b) => a.pickNo - b.pickNo);

  return {
    ...state,
    picks,
    availablePlayers: state.availablePlayers.filter((p) => p.id !== row.player_id),
  };
}
