/**
 * Worker draft-tick seam (Prompt 08, piece 4 — completing Prompt 06's stub). The DECISION logic lives
 * in the UNCHANGED `@app/draft` controller; here we only prove the THIN IO loop drives it correctly:
 * an expired `pick_deadline_at` autopicks + advances, a tick before the deadline is a no-op, and a
 * completed draft drops out of the loop. The store is injected (the in-memory double), the clock is
 * injected, and the interval is driven with fake timers — no real DB, no real waiting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDraftStore, type DraftStore } from "@app/draft";
import { tickActiveDrafts, startDraftTicker } from "./draft";

const NOW = new Date("2026-06-04T00:05:00Z");
const PAST = new Date("2026-06-04T00:04:00Z"); // before NOW → deadline expired
const FUTURE = new Date("2026-06-04T00:06:00Z"); // after NOW → still ticking

/** An active 2-manager draft on the given pick, with manager `m1`'s autopick queue holding `pA` (FWD). */
function activeStore(opts: {
  currentPickNo: number;
  currentManagerId: string;
  pickDeadlineAt: Date;
  queueManagerId: string;
}): MemoryDraftStore {
  const store = new MemoryDraftStore();
  store.seedDraft({
    draftId: "d1",
    leagueId: "L1",
    orderedManagerIds: ["m1", "m2"],
    draftPickSeconds: 90,
    status: "active",
    currentPickNo: opts.currentPickNo,
    currentManagerId: opts.currentManagerId,
    pickDeadlineAt: opts.pickDeadlineAt,
  });
  store.seedQueue(opts.queueManagerId, [{ playerId: "pA", position: "FWD" }]);
  return store;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("tickActiveDrafts — the server-authoritative timer half", () => {
  it("autopicks and advances when pick_deadline_at has expired (now > deadline)", async () => {
    const store = activeStore({
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: PAST,
      queueManagerId: "m1",
    });

    const results = await tickActiveDrafts(NOW, store);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ acted: true, reason: "autopicked" });
    const picks = store.pickRows("d1");
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ pickNo: 1, managerId: "m1", playerId: "pA", isAuto: true });
    // pointer advanced to pick 2 / the next snake manager
    expect(store.draftRow("d1")?.currentPickNo).toBe(2);
    expect(store.draftRow("d1")?.currentManagerId).toBe("m2");
  });

  it("is a no-op before the deadline (now < deadline) — idempotent", async () => {
    const store = activeStore({
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: FUTURE,
      queueManagerId: "m1",
    });

    const results = await tickActiveDrafts(NOW, store);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ acted: false, reason: "before-deadline" });
    expect(store.pickRows("d1")).toHaveLength(0);
    expect(store.draftRow("d1")?.currentPickNo).toBe(1);
  });

  it("isolates a per-draft failure: a throwing draft does not starve the others", async () => {
    // The healthy draft (`d1`, on an expired pick with a queued player) sorts AFTER the failing one.
    const good = activeStore({
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: PAST,
      queueManagerId: "m1",
    });
    // A store that lists two active drafts but throws when ticking the "bad" one (e.g. a transient DB
    // fault, or a draft deleted between listActiveDraftIds and the tick).
    const store: DraftStore = {
      listActiveDraftIds: () => Promise.resolve(["bad", "d1"]),
      loadDraft: (id) => (id === "bad" ? Promise.reject(new Error("boom")) : good.loadDraft(id)),
      getPlayerPosition: (id) => good.getPlayerPosition(id),
      getRosterCounts: (id) => good.getRosterCounts(id),
      listOwnedPlayerIds: (id) => good.listOwnedPlayerIds(id),
      getQueue: (id) => good.getQueue(id),
      getDefaultRanking: (id) => good.getDefaultRanking(id),
      commitPick: (c) => good.commitPick(c),
      initDraft: (id, i) => good.initDraft(id, i),
    };
    const errors: unknown[] = [];
    const results = await tickActiveDrafts(NOW, store, (err) => errors.push(err));

    // The failing draft did not abort the batch: the healthy draft still autopicked.
    expect(good.pickRows("d1")).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.acted).toBe(true);
  });

  it("drops a completed draft from the loop — the final autopick completes it, then no more action", async () => {
    // 2 managers × 15 = 30 picks; seed the draft ON its final pick so one autopick completes it.
    // managerForPick(30, [m1,m2]) → m2 (round 14 is even, last slot).
    const store = activeStore({
      currentPickNo: 30,
      currentManagerId: "m2",
      pickDeadlineAt: PAST,
      queueManagerId: "m2",
    });

    const first = await tickActiveDrafts(NOW, store);
    expect(first[0]).toMatchObject({ acted: true, reason: "autopicked" });
    expect(store.draftRow("d1")?.status).toBe("complete");

    // Once complete, the draft is no longer `active` → the loop has nothing to tick.
    const second = await tickActiveDrafts(NOW, store);
    expect(second).toEqual([]);
    expect(store.pickRows("d1")).toHaveLength(1);
  });
});

describe("startDraftTicker — the dedicated short-interval loop", () => {
  it("drives tickActiveDrafts on its interval and stops on .stop()", async () => {
    vi.useFakeTimers();
    const store = activeStore({
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: PAST,
      queueManagerId: "m1",
    });
    let ticks = 0;
    const handle = startDraftTicker({
      store,
      intervalMs: 1000,
      now: () => NOW,
      onTick: () => {
        ticks += 1;
      },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(ticks).toBe(1);
    // the very first interval autopicked the expired pick
    expect(store.pickRows("d1")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(ticks).toBe(3);

    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ticks).toBe(3); // no ticks after stop
  });

  it("stops itself after maxTicks (the CI/smoke bound) and calls onStopped", async () => {
    vi.useFakeTimers();
    const store = activeStore({
      currentPickNo: 1,
      currentManagerId: "m1",
      pickDeadlineAt: FUTURE, // no-op ticks; we only count the loop firing
      queueManagerId: "m1",
    });
    let ticks = 0;
    let stopped = false;
    startDraftTicker({
      store,
      intervalMs: 1000,
      now: () => NOW,
      maxTicks: 2,
      onTick: () => {
        ticks += 1;
      },
      onStopped: () => {
        stopped = true;
      },
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ticks).toBe(2);
    expect(stopped).toBe(true);
  });
});
