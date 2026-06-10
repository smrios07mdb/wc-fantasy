/**
 * The three notification TRIGGERS' IO orchestration (Prompt 41b): each loads state through a store,
 * runs its pure selector, and dispatches via the real `dispatchToManager` + the `NotifyStore` Memory
 * double. Two things are proven per trigger:
 *  1. selection→dispatch wiring — the right manager gets the right kind + subjectId (spy dispatch);
 *  2. idempotency — re-running the trigger N times yields exactly ONE delivery, because the
 *     `notification_sent` ledger inside `dispatchToManager` collapses the re-fires.
 *
 * No real DB, network, clock, or waiting: stores are in-memory and `now` is injected.
 */
import { describe, it, expect, vi } from "vitest";
import { MemoryNotifyStore } from "@app/notify";
import { MemoryDraftStore } from "@app/draft";
import { MemoryNotifyTriggerStore } from "./memoryStore";
import { dispatchDraftTurns, dispatchPlayersNotStarting, dispatchMatchStarting } from "./triggers";

const SUB = { endpoint: "https://push.example/abc", p256dh: "kp", auth: "ka" };

/** A MemoryNotifyStore with the given managers each holding one device (so a send actually fires). */
async function notifyWithDevices(...managerIds: string[]): Promise<MemoryNotifyStore> {
  const store = new MemoryNotifyStore();
  for (const m of managerIds) {
    await store.addSubscription(m, { ...SUB, endpoint: `${SUB.endpoint}/${m}` });
  }
  return store;
}

describe("dispatchDraftTurns — the on-the-clock manager, piggybacked on the draft ticker", () => {
  function activeDraft(currentManagerId: string, currentPickNo: number): MemoryDraftStore {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d1",
      leagueId: "L1",
      orderedManagerIds: ["m1", "m2"],
      draftPickSeconds: 90,
      status: "active",
      currentPickNo,
      currentManagerId,
    });
    return store;
  }

  it("dispatches draft_turn to the current manager keyed ${draftId}:${pickNo}", async () => {
    const notify = await notifyWithDevices("m2");
    const drafts = activeDraft("m2", 7);
    const dispatch = vi.fn(async () => ({ sent: 1, reason: "ok" as const }));

    await dispatchDraftTurns(notify, drafts, dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(notify, "m2", "draft_turn", "d1:7", expect.any(Object));
  });

  it("is idempotent across re-fires: the ledger collapses 3 ticks to one delivery", async () => {
    const notify = await notifyWithDevices("m2");
    const drafts = activeDraft("m2", 7);

    await dispatchDraftTurns(notify, drafts);
    await dispatchDraftTurns(notify, drafts);
    await dispatchDraftTurns(notify, drafts);

    expect(notify.sends).toHaveLength(1);
    expect(notify.hasLedger("m2", "draft_turn", "d1:7")).toBe(true);
  });

  it("does nothing when no draft is active", async () => {
    const notify = await notifyWithDevices("m1");
    const drafts = new MemoryDraftStore();
    const dispatch = vi.fn();
    await dispatchDraftTurns(notify, drafts, dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("dispatchPlayersNotStarting — after the pre-match XI lands", () => {
  function triggerStore(): MemoryNotifyTriggerStore {
    const t = new MemoryNotifyTriggerStore();
    t.seedMatchId(50, "match-50");
    t.seedFantasyStarters(50, [
      {
        managerId: "mA",
        playerId: "pOut",
        playerBdlId: 99,
        playerName: "Benched Bo",
        lockedAt: null,
      },
      {
        managerId: "mB",
        playerId: "pIn",
        playerBdlId: 10,
        playerName: "Starting Stu",
        lockedAt: null,
      },
    ]);
    return t;
  }

  it("dispatches player_not_starting only to the owner of the absent starter, keyed ${matchId}:${playerId}", async () => {
    const notify = await notifyWithDevices("mA", "mB");
    const dispatch = vi.fn(async () => ({ sent: 1, reason: "ok" as const }));

    await dispatchPlayersNotStarting(notify, triggerStore(), 50, [10, 20, 30], dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      notify,
      "mA",
      "player_not_starting",
      "match-50:pOut",
      expect.any(Object),
    );
  });

  it("is idempotent across re-fires (the same XI pulled twice → one delivery)", async () => {
    const notify = await notifyWithDevices("mA", "mB");
    const t = triggerStore();

    await dispatchPlayersNotStarting(notify, t, 50, [10], undefined);
    await dispatchPlayersNotStarting(notify, t, 50, [10], undefined);

    expect(notify.sends).toHaveLength(1);
    expect(notify.sends[0]!.payload.body).toContain("Benched Bo");
  });

  it("does nothing when the match id cannot be resolved (no period seeded)", async () => {
    const notify = await notifyWithDevices("mA");
    const t = new MemoryNotifyTriggerStore(); // no seeded matchId / starters
    const dispatch = vi.fn();
    await dispatchPlayersNotStarting(notify, t, 999, [1, 2], dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("dispatchMatchStarting — owners of either team, kickoff within the lead window", () => {
  const NOW = new Date("2026-06-10T18:00:00Z");
  const LEAD = 15 * 60_000;
  const k = (min: number) => NOW.getTime() + min * 60_000;

  function triggerStore(): MemoryNotifyTriggerStore {
    const t = new MemoryNotifyTriggerStore();
    t.seedUpcomingMatches([
      {
        matchId: "match-1",
        kickoffMs: k(10),
        label: "Brazil vs Spain",
        ownerManagerIds: ["m1", "m2"],
      },
      { matchId: "match-2", kickoffMs: k(40), label: "Way vs Later", ownerManagerIds: ["m3"] },
    ]);
    return t;
  }

  it("dispatches match_starting to each owner of an in-window fixture, keyed by matchId", async () => {
    const notify = await notifyWithDevices("m1", "m2", "m3");
    const dispatch = vi.fn(async () => ({ sent: 1, reason: "ok" as const }));

    await dispatchMatchStarting(notify, triggerStore(), NOW, LEAD, dispatch);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      notify,
      "m1",
      "match_starting",
      "match-1",
      expect.any(Object),
    );
    expect(dispatch).toHaveBeenCalledWith(
      notify,
      "m2",
      "match_starting",
      "match-1",
      expect.any(Object),
    );
  });

  it("is idempotent across the 60s ticks: re-running yields one delivery per owner", async () => {
    const notify = await notifyWithDevices("m1", "m2", "m3");
    const t = triggerStore();

    await dispatchMatchStarting(notify, t, NOW, LEAD);
    await dispatchMatchStarting(notify, t, NOW, LEAD);
    await dispatchMatchStarting(notify, t, NOW, LEAD);

    expect(notify.sends).toHaveLength(2); // m1 + m2 once each; match-2 out of window
  });
});
