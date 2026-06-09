import { describe, it, expect } from "vitest";
import { MemoryDraftStore } from "./memoryStore";
import { managerForPick } from "./snake";
import { forceAutopick, startDraft, submitPick, tickDraft } from "./controller";
import type { PickCommit } from "./store";
import {
  DraftNotActiveError,
  DraftNotReadyError,
  NotYourTurnError,
  PlayerUnavailableError,
  PositionFullError,
} from "./errors";

const L = "league-1";
const SECONDS = 90;
const T0 = new Date("2026-06-10T12:00:00.000Z");
const later = (ms: number): Date => new Date(T0.getTime() + ms);

/** Seed an active draft on `currentPickNo` with the snake-correct manager on the clock. */
function seedActive(
  store: MemoryDraftStore,
  managers: string[],
  currentPickNo: number,
  pickDeadlineAt: Date,
): void {
  store.seedDraft({
    draftId: "d",
    leagueId: L,
    orderedManagerIds: managers,
    draftPickSeconds: SECONDS,
    status: "active",
    currentPickNo,
    currentManagerId: managerForPick(currentPickNo, managers),
    pickDeadlineAt,
  });
}

describe("startDraft", () => {
  it("activates a pending draft: pick 1, first manager on the clock, deadline = now + seconds", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2", "m3"],
      draftPickSeconds: SECONDS,
    });

    const res = await startDraft(store, "d", T0);

    expect(res.started).toBe(true);
    const d = store.draftRow("d");
    expect(d?.status).toBe("active");
    expect(d?.currentPickNo).toBe(1);
    expect(d?.currentManagerId).toBe("m1");
    expect(d?.pickDeadlineAt?.getTime()).toBe(T0.getTime() + SECONDS * 1000);
  });

  it("is idempotent — a second start is a no-op", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1"],
      draftPickSeconds: SECONDS,
    });
    await startDraft(store, "d", T0);
    const res = await startDraft(store, "d", later(5000));
    expect(res.started).toBe(false);
    // deadline still reflects the FIRST start, not the second
    expect(store.draftRow("d")?.pickDeadlineAt?.getTime()).toBe(T0.getTime() + SECONDS * 1000);
  });

  it("throws when no manager has a draft_slot", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: [],
      draftPickSeconds: SECONDS,
    });
    await expect(startDraft(store, "d", T0)).rejects.toBeInstanceOf(DraftNotReadyError);
  });
});

describe("submitPick", () => {
  it("writes the pick + ownership and advances the snake (deadline = now + seconds)", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedPlayer("pl-1", "MID");

    const now = later(30_000);
    const res = await submitPick(store, "d", "m1", "pl-1", now);

    expect(res).toMatchObject({
      pickNo: 1,
      managerId: "m1",
      playerId: "pl-1",
      isAuto: false,
      complete: false,
    });
    expect(store.pickRows("d")).toEqual([
      { draftId: "d", pickNo: 1, managerId: "m1", playerId: "pl-1", isAuto: false, madeAt: now },
    ]);
    expect(store.isOwned(L, "pl-1")).toBe(true);
    expect(store.countsOf("m1")).toMatchObject({ MID: 1 });
    const d = store.draftRow("d");
    expect(d?.currentPickNo).toBe(2);
    expect(d?.currentManagerId).toBe("m2");
    expect(d?.pickDeadlineAt?.getTime()).toBe(now.getTime() + SECONDS * 1000);
  });

  it("advances by the snake across a full round and into the reverse", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    for (const p of ["a", "b", "c"]) store.seedPlayer(p, "MID");

    await submitPick(store, "d", "m1", "a", T0); // pick 1 → on the clock m2
    expect(store.draftRow("d")?.currentManagerId).toBe("m2");
    await submitPick(store, "d", "m2", "b", T0); // pick 2 → snake turns, m2 again (pick 3)
    expect(store.draftRow("d")?.currentPickNo).toBe(3);
    expect(store.draftRow("d")?.currentManagerId).toBe("m2");
  });

  it("rejects when it is not the manager's turn — NO write", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0); // m1 on the clock
    store.seedPlayer("pl-1", "MID");

    await expect(submitPick(store, "d", "m2", "pl-1", T0)).rejects.toBeInstanceOf(NotYourTurnError);
    expect(store.pickRows("d")).toEqual([]);
    expect(store.draftRow("d")?.currentPickNo).toBe(1);
  });

  it("rejects an already-owned player — NO write (constraint-aligned availability)", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedOwnership(L, "m2", "pl-x", "MID"); // pl-x already owned

    await expect(submitPick(store, "d", "m1", "pl-x", T0)).rejects.toBeInstanceOf(
      PlayerUnavailableError,
    );
    expect(store.pickRows("d")).toEqual([]);
  });

  it("rejects a pick that would overfill a position bucket — NO write", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    // m1 already has 3 FWD (the cap) from prior ownership
    for (const f of ["f1", "f2", "f3"]) store.seedOwnership(L, "m1", f, "FWD");
    store.seedPlayer("pl-fwd", "FWD");

    await expect(submitPick(store, "d", "m1", "pl-fwd", T0)).rejects.toBeInstanceOf(
      PositionFullError,
    );
    expect(store.pickRows("d")).toEqual([]);
  });

  it("throws on a non-active (pending) draft", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
    });
    store.seedPlayer("pl-1", "MID");
    await expect(submitPick(store, "d", "m1", "pl-1", T0)).rejects.toBeInstanceOf(
      DraftNotActiveError,
    );
  });

  it("the final pick completes the draft and clears the deadline", async () => {
    const store = new MemoryDraftStore();
    const managers = ["m1", "m2"];
    const total = 15 * managers.length; // 30
    seedActive(store, managers, total, T0);
    const onClock = managerForPick(total, managers);
    store.seedPlayer("pl-last", "GK");

    const res = await submitPick(store, "d", onClock, "pl-last", later(10_000));

    expect(res.complete).toBe(true);
    const d = store.draftRow("d");
    expect(d?.status).toBe("complete");
    expect(d?.currentPickNo).toBeNull();
    expect(d?.currentManagerId).toBeNull();
    expect(d?.pickDeadlineAt).toBeNull();
  });
});

describe("tickDraft (timer expiry → autopick)", () => {
  it("before the deadline is a no-op", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, later(SECONDS * 1000)); // deadline in the future
    store.seedQueue("m1", [{ playerId: "pl-a", position: "MID" }]);

    const res = await tickDraft(store, "d", T0); // now < deadline

    expect(res).toEqual({ acted: false, reason: "before-deadline" });
    expect(store.pickRows("d")).toEqual([]);
  });

  it("at/after the deadline autopicks the top queue entry (is_auto=true) and advances", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0); // deadline = T0
    store.seedQueue("m1", [
      { playerId: "pl-a", position: "MID" },
      { playerId: "pl-b", position: "MID" },
    ]);

    const now = later(1000); // past the deadline
    const res = await tickDraft(store, "d", now);

    expect(res.acted).toBe(true);
    expect(res.reason).toBe("autopicked");
    expect(res.pick).toMatchObject({ pickNo: 1, managerId: "m1", playerId: "pl-a", isAuto: true });
    expect(store.pickRows("d")).toEqual([
      { draftId: "d", pickNo: 1, managerId: "m1", playerId: "pl-a", isAuto: true, madeAt: now },
    ]);
    const d = store.draftRow("d");
    expect(d?.currentPickNo).toBe(2);
    expect(d?.currentManagerId).toBe("m2");
    expect(d?.pickDeadlineAt?.getTime()).toBe(now.getTime() + SECONDS * 1000);
  });

  it("falls back to the injected best-available ranking when the manager has no queue", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedRanking(L, [{ playerId: "pl-best", position: "DEF" }]);

    const res = await tickDraft(store, "d", later(1000));

    expect(res.pick?.playerId).toBe("pl-best");
    expect(store.isOwned(L, "pl-best")).toBe(true);
  });

  it("returns the no-eligible stall reason when neither queue nor ranking yields a pick", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0); // no queue, no ranking seeded

    const res = await tickDraft(store, "d", later(1000));

    expect(res).toEqual({ acted: false, reason: "no-eligible-player" });
    expect(store.pickRows("d")).toEqual([]);
    expect(store.draftRow("d")?.currentPickNo).toBe(1); // not advanced
  });

  it("is a no-op after a manual pick already filled and advanced the slot (idempotent)", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedPlayer("pl-a", "MID");
    store.seedQueue("m1", [{ playerId: "pl-z", position: "MID" }]);

    // m1 submits at T1; the draft advances to pick 2 with a fresh deadline T1 + seconds.
    const t1 = later(1000);
    await submitPick(store, "d", "m1", "pl-a", t1);

    // a tick at the SAME instant sees the fresh (future) deadline for pick 2 → no-op.
    const res = await tickDraft(store, "d", t1);
    expect(res.acted).toBe(false);
    expect(store.pickRows("d").map((p) => p.playerId)).toEqual(["pl-a"]); // no autopick added
  });
});

describe("tickDraft — autopick totality (queue → default_rank NULLS LAST → stable id tiebreak)", () => {
  it("autopicks the lowest-id undrafted, legal player when the queue is empty and NO player is ranked", async () => {
    // The original mock-draft pick-1 stick: ranks not yet populated. Autopick must NOT stall — it
    // falls through to the whole pool ordered by id and picks deterministically.
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedPlayer("p-c", "MID");
    store.seedPlayer("p-a", "MID");
    store.seedPlayer("p-b", "MID");

    const res = await tickDraft(store, "d", later(1000));

    expect(res.acted).toBe(true);
    expect(res.reason).toBe("autopicked");
    expect(res.reason).not.toBe("no-eligible-player");
    expect(res.pick).toMatchObject({ managerId: "m1", playerId: "p-a", isAuto: true });
    expect(store.isOwned(L, "p-a")).toBe(true);
  });

  it("prefers the lowest default_rank, and any ranked player beats an unranked one (NULLS LAST)", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedPlayer("p-unranked", "MID"); // default_rank null
    store.seedPlayer("p-rank2", "MID", 2);
    store.seedPlayer("p-rank1", "MID", 1);

    const res = await tickDraft(store, "d", later(1000));

    expect(res.pick?.playerId).toBe("p-rank1");
  });

  it("excludes already-drafted players from the autopick pool", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedPlayer("p-rank1", "MID", 1);
    store.seedPlayer("p-rank2", "MID", 2);
    store.seedOwnership(L, "m2", "p-rank1", "MID"); // the best player is already owned

    const res = await tickDraft(store, "d", later(1000));

    expect(res.pick?.playerId).toBe("p-rank2");
  });

  it("respects the 2/5/5/3 roster legality — skips a position whose bucket is full", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    for (const f of ["f1", "f2", "f3"]) store.seedOwnership(L, "m1", f, "FWD"); // m1's FWD bucket full
    store.seedPlayer("p-fwd", "FWD", 1); // best rank, but illegal for m1
    store.seedPlayer("p-mid", "MID", 2);

    const res = await tickDraft(store, "d", later(1000));

    expect(res.pick?.playerId).toBe("p-mid");
  });

  it("never stalls while ANY legal, undrafted player remains (totality guarantee)", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    // The two best-ranked are taken; one unranked legal player remains → autopick must still fire.
    store.seedPlayer("p-best", "MID", 1);
    store.seedPlayer("p-second", "MID", 2);
    store.seedPlayer("p-leftover", "MID"); // unranked, undrafted, legal
    store.seedOwnership(L, "m2", "p-best", "MID");
    store.seedOwnership(L, "m2", "p-second", "MID");

    const res = await tickDraft(store, "d", later(1000));

    expect(res.acted).toBe(true);
    expect(res.reason).toBe("autopicked");
    expect(res.pick?.playerId).toBe("p-leftover");
  });
});

/** Store subclass that always rejects commitPick — simulates a concurrent writer winning the race. */
class AlwaysRejectStore extends MemoryDraftStore {
  override commitPick(_commit: PickCommit): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe("forceAutopick (commissioner-triggered, bypasses deadline)", () => {
  it("active draft with a ranked player → acts: true, autopicked", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedRanking(L, [{ playerId: "pl-best", position: "MID" }]);

    const res = await forceAutopick(store, "d", T0);

    expect(res.acted).toBe(true);
    expect(res.reason).toBe("autopicked");
    expect(res.pick).toMatchObject({
      pickNo: 1,
      managerId: "m1",
      playerId: "pl-best",
      isAuto: true,
    });
    expect(store.isOwned(L, "pl-best")).toBe(true);
  });

  it("fires successfully when pick_deadline_at is null (key difference from tickDraft)", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
      timerEnabled: false,
      status: "active",
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: null,
    });
    store.seedRanking(L, [{ playerId: "pl-a", position: "DEF" }]);

    const res = await forceAutopick(store, "d", T0);

    expect(res.acted).toBe(true);
    expect(res.reason).toBe("autopicked");
  });

  it("pending draft → { acted: false, reason: 'not-active' }", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
    });
    store.seedRanking(L, [{ playerId: "pl-a", position: "MID" }]);

    const res = await forceAutopick(store, "d", T0);

    expect(res).toEqual({ acted: false, reason: "not-active" });
  });

  it("no eligible player → { acted: false, reason: 'no-eligible-player' }", async () => {
    const store = new MemoryDraftStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    // No players seeded — pool is empty.

    const res = await forceAutopick(store, "d", T0);

    expect(res).toEqual({ acted: false, reason: "no-eligible-player" });
    expect(store.pickRows("d")).toEqual([]);
  });

  it("concurrent pick already committed → { acted: false, reason: 'already-advanced' }", async () => {
    const store = new AlwaysRejectStore();
    seedActive(store, ["m1", "m2"], 1, T0);
    store.seedRanking(L, [{ playerId: "pl-a", position: "MID" }]);

    const res = await forceAutopick(store, "d", T0);

    expect(res).toEqual({ acted: false, reason: "already-advanced" });
  });
});

describe("timer toggle (timerEnabled = false)", () => {
  it("startDraft with timerEnabled=false writes pick_deadline_at = null", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
      timerEnabled: false,
    });

    const res = await startDraft(store, "d", T0);

    expect(res.started).toBe(true);
    const d = store.draftRow("d");
    expect(d?.status).toBe("active");
    expect(d?.pickDeadlineAt).toBeNull();
  });

  it("submitPick (buildCommit) with timerEnabled=false writes next pick_deadline_at = null", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
      timerEnabled: false,
      status: "active",
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: null,
    });
    store.seedPlayer("pl-1", "MID");

    await submitPick(store, "d", "m1", "pl-1", T0);

    const d = store.draftRow("d");
    expect(d?.currentPickNo).toBe(2);
    expect(d?.pickDeadlineAt).toBeNull();
  });

  it("tickDraft with null deadline is a safe no-op", async () => {
    // timerEnabled=false: null deadline is a safe no-op
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: SECONDS,
      timerEnabled: false,
      status: "active",
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: null,
    });
    store.seedPlayer("pl-1", "MID");

    const res = await tickDraft(store, "d", T0);

    // timerEnabled=false: null deadline is a safe no-op
    expect(res).toEqual({ acted: false, reason: "not-active" });
    expect(store.pickRows("d")).toEqual([]);
  });
});
