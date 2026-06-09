import { describe, it, expect } from "vitest";
import type { DraftRoomState, DraftPlayer } from "./types";
import { applyDraftRowChange, applyPickRowChange, planDraftBroadcast } from "./reducer";

const player = (id: string, p: DraftPlayer["position"]): DraftPlayer => ({
  id,
  displayName: id,
  firstName: null,
  lastName: id,
  position: p,
  country: null,
});

function mkState(over: Partial<DraftRoomState> = {}): DraftRoomState {
  return {
    draftId: "d1",
    leagueId: "L1",
    status: "active",
    currentPickNo: 2,
    currentManagerId: "m2",
    pickDeadlineAt: "2026-06-04T00:02:00Z",
    draftPickSeconds: 90,
    managers: [
      { id: "m1", displayName: "Alice", draftSlot: 1, isMe: true },
      { id: "m2", displayName: "Bob", draftSlot: 2, isMe: false },
    ],
    picks: [],
    availablePlayers: [player("pX", "FWD"), player("pY", "MID")],
    sessionManagerId: "m1",
    sessionManagerIsCommissioner: false,
    myQueue: [],
    timerEnabled: true,
    ...over,
  };
}

describe("applyDraftRowChange — patch the pointer/deadline from a `draft` broadcast", () => {
  it("advances the pointer + deadline from the authoritative row", () => {
    const next = applyDraftRowChange(mkState(), {
      status: "active",
      current_pick_no: 3,
      current_manager_id: "m1",
      pick_deadline_at: "2026-06-04T00:03:30Z",
    });
    expect(next).toMatchObject({
      currentPickNo: 3,
      currentManagerId: "m1",
      pickDeadlineAt: "2026-06-04T00:03:30Z",
      status: "active",
    });
  });

  it("handles completion (nulls)", () => {
    const next = applyDraftRowChange(mkState(), {
      status: "complete",
      current_pick_no: null,
      current_manager_id: null,
      pick_deadline_at: null,
    });
    expect(next).toMatchObject({ status: "complete", currentPickNo: null, pickDeadlineAt: null });
  });

  it("flips status pending→active from the authoritative row (the lobby↔active gate source)", () => {
    const next = applyDraftRowChange(mkState({ status: "pending", currentPickNo: null }), {
      status: "active",
      current_pick_no: 1,
      current_manager_id: "m1",
      pick_deadline_at: "2026-06-04T00:00:30Z",
    });
    expect(next.status).toBe("active");
    expect(next.currentPickNo).toBe(1);
  });

  it("preserves the pointer/deadline when a draft broadcast omits them (partial-safe, no clobber)", () => {
    // A partial `draft` payload (only the changed columns) must NOT null out the live pointer — the
    // reducer keeps what it isn't told about, so a thin broadcast can't strand the board.
    const next = applyDraftRowChange(
      mkState({ status: "active", currentPickNo: 2, currentManagerId: "m2" }),
      { status: "active" },
    );
    expect(next.currentPickNo).toBe(2);
    expect(next.currentManagerId).toBe("m2");
    expect(next.pickDeadlineAt).toBe("2026-06-04T00:02:00Z");
  });
});

describe("planDraftBroadcast — apply the authoritative status, or re-fetch when partial", () => {
  it("applies a broadcast that carries an authoritative status", () => {
    const plan = planDraftBroadcast({ status: "active", current_pick_no: 1 });
    expect(plan).toEqual({ kind: "apply", change: { status: "active", current_pick_no: 1 } });
  });

  it("signals a re-fetch when the broadcast omits status (the partial-payload case)", () => {
    // The lobby→active stall: a `draft` row update that re-syncs the pointer but drops `status`.
    expect(planDraftBroadcast({ current_pick_no: 1 })).toEqual({ kind: "refetch" });
  });

  it("signals a re-fetch on a null/empty payload", () => {
    expect(planDraftBroadcast(null)).toEqual({ kind: "refetch" });
  });
});

describe("applyPickRowChange — fold a new `draft_pick` broadcast into the snapshot", () => {
  it("adds the pick (resolving the player from the local pool) and removes it from available", () => {
    const next = applyPickRowChange(mkState(), {
      pick_no: 2,
      manager_id: "m2",
      player_id: "pX",
      is_auto: true,
    });
    expect(next.picks).toEqual([
      { pickNo: 2, managerId: "m2", playerId: "pX", player: player("pX", "FWD"), isAuto: true },
    ]);
    expect(next.availablePlayers.map((p) => p.id)).toEqual(["pY"]); // pX consumed
  });

  it("is idempotent — re-applying the same pick does not duplicate it", () => {
    const once = applyPickRowChange(mkState(), {
      pick_no: 2,
      manager_id: "m2",
      player_id: "pX",
      is_auto: false,
    });
    const twice = applyPickRowChange(once, {
      pick_no: 2,
      manager_id: "m2",
      player_id: "pX",
      is_auto: false,
    });
    expect(twice.picks).toHaveLength(1);
    expect(twice.availablePlayers.map((p) => p.id)).toEqual(["pY"]);
  });

  it("records a pick for an unknown player id without crashing (player null, pool untouched)", () => {
    const next = applyPickRowChange(mkState(), {
      pick_no: 2,
      manager_id: "m2",
      player_id: "ghost",
      is_auto: false,
    });
    expect(next.picks[0]).toMatchObject({ pickNo: 2, playerId: "ghost", player: null });
    expect(next.availablePlayers).toHaveLength(2);
  });

  it("ignores an unfilled pick row (null player_id)", () => {
    const next = applyPickRowChange(mkState(), {
      pick_no: 2,
      manager_id: "m2",
      player_id: null,
      is_auto: false,
    });
    expect(next.picks).toHaveLength(0);
  });
});
