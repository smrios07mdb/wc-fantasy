import { describe, it, expect } from "vitest";
import { MemoryDraftStore } from "./memoryStore";
import type { PickCommit } from "./store";

const L = "league-1";
const T0 = new Date("2026-06-10T12:00:00.000Z");

function activeDraft(store: MemoryDraftStore, currentPickNo: number): void {
  store.seedDraft({
    draftId: "d",
    leagueId: L,
    orderedManagerIds: ["m1", "m2"],
    draftPickSeconds: 90,
    status: "active",
    currentPickNo,
    currentManagerId: "m1",
    pickDeadlineAt: T0,
  });
}

function commit(over: Partial<PickCommit>): PickCommit {
  return {
    draftId: "d",
    leagueId: L,
    pickNo: 1,
    managerId: "m1",
    playerId: "pl",
    isAuto: false,
    madeAt: T0,
    advance: { kind: "next", nextPickNo: 2, nextManagerId: "m2", pickDeadlineAt: T0 },
    ...over,
  };
}

describe("MemoryDraftStore.commitPick — the atomic, guarded write", () => {
  it("writes the pick + ownership and advances when the guard holds", async () => {
    const store = new MemoryDraftStore();
    activeDraft(store, 1);
    store.seedPlayer("pl", "MID");

    const ok = await store.commitPick(commit({}));

    expect(ok).toBe(true);
    expect(store.pickRows("d")).toEqual([
      { draftId: "d", pickNo: 1, managerId: "m1", playerId: "pl", isAuto: false, madeAt: T0 },
    ]);
    expect(store.isOwned(L, "pl")).toBe(true);
    expect(store.countsOf("m1")).toMatchObject({ MID: 1 });
    expect(store.draftRow("d")?.currentPickNo).toBe(2);
    expect(store.draftRow("d")?.currentManagerId).toBe("m2");
  });

  it("is a no-op when the draft already advanced off the pick (idempotency guard)", async () => {
    const store = new MemoryDraftStore();
    activeDraft(store, 2); // already on pick 2
    store.seedPlayer("pl", "MID");

    const ok = await store.commitPick(commit({ pickNo: 1 })); // stale: targets pick 1

    expect(ok).toBe(false);
    expect(store.pickRows("d")).toEqual([]);
    expect(store.draftRow("d")?.currentPickNo).toBe(2); // untouched
  });

  it("refuses to double-own a player already owned (the roster partial-unique backstop)", async () => {
    const store = new MemoryDraftStore();
    activeDraft(store, 1);
    store.seedOwnership(L, "m2", "pl", "MID"); // someone already owns pl

    const ok = await store.commitPick(commit({ playerId: "pl" }));

    expect(ok).toBe(false);
    expect(store.pickRows("d")).toEqual([]);
    expect(store.draftRow("d")?.currentPickNo).toBe(1); // not advanced
  });

  it("applies a `complete` advance: clears the pointer + deadline", async () => {
    const store = new MemoryDraftStore();
    activeDraft(store, 30);
    store.seedPlayer("pl", "GK");

    const ok = await store.commitPick(commit({ pickNo: 30, advance: { kind: "complete" } }));

    expect(ok).toBe(true);
    const d = store.draftRow("d");
    expect(d?.status).toBe("complete");
    expect(d?.currentPickNo).toBeNull();
    expect(d?.currentManagerId).toBeNull();
    expect(d?.pickDeadlineAt).toBeNull();
  });
});

describe("MemoryDraftStore.initDraft — guarded start", () => {
  it("starts a pending draft and refuses a non-pending one", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d",
      leagueId: L,
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: 90,
    });

    const init = { currentPickNo: 1, currentManagerId: "m1", pickDeadlineAt: T0 };
    expect(await store.initDraft("d", init)).toBe(true);
    expect(store.draftRow("d")?.status).toBe("active");
    // second call: already active → no-op
    expect(await store.initDraft("d", init)).toBe(false);
  });
});

describe("MemoryDraftStore.listActiveDraftIds", () => {
  it("returns only active drafts", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "a",
      leagueId: "la",
      orderedManagerIds: ["m"],
      draftPickSeconds: 90,
    });
    store.seedDraft({
      draftId: "b",
      leagueId: "lb",
      orderedManagerIds: ["m"],
      draftPickSeconds: 90,
      status: "active",
      currentPickNo: 1,
      currentManagerId: "m",
      pickDeadlineAt: T0,
    });
    expect(await store.listActiveDraftIds()).toEqual(["b"]);
  });
});
