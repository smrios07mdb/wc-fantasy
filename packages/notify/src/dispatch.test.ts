import { describe, it, expect } from "vitest";
import { dispatchToManager, dispatchCommissionerAlert } from "./dispatch";
import { MemoryNotifyStore } from "./memoryStore";
import { buildPushPayload } from "./payload";

const SUB = { endpoint: "https://push.example/abc", p256dh: "key-p", auth: "key-a" };
const PAYLOAD = buildPushPayload({ kind: "draft_turn" });

describe("dispatchToManager — preference gate", () => {
  it("pref-off → no send, no ledger claim", async () => {
    const store = new MemoryNotifyStore();
    await store.upsertPreferences("mgr-1", {
      draftTurn: false,
      playerNotStarting: true,
      matchStarting: true,
    });
    await store.addSubscription("mgr-1", SUB);

    const res = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);

    expect(res).toEqual({ sent: 0, reason: "pref_off" });
    expect(store.sends).toHaveLength(0);
    expect(store.hasLedger("mgr-1", "draft_turn", "draft-1")).toBe(false);
  });

  it("only the matching channel's flag gates the kind", async () => {
    const store = new MemoryNotifyStore();
    // draft_turn ON but match_starting OFF → a match_starting dispatch is muted.
    await store.upsertPreferences("mgr-1", {
      draftTurn: true,
      playerNotStarting: true,
      matchStarting: false,
    });
    await store.addSubscription("mgr-1", SUB);

    const res = await dispatchToManager(store, "mgr-1", "match_starting", "m-1", PAYLOAD);
    expect(res.reason).toBe("pref_off");
    expect(store.sends).toHaveLength(0);
  });
});

describe("dispatchToManager — first call sends + writes the ledger", () => {
  it("pref-on (default) + a subscription → sends once and records the ledger row", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("mgr-1", SUB);

    const res = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);

    expect(res).toEqual({ sent: 1, reason: "ok" });
    expect(store.sends).toHaveLength(1);
    expect(store.sends[0]).toMatchObject({ endpoint: SUB.endpoint, payload: PAYLOAD });
    expect(store.hasLedger("mgr-1", "draft_turn", "draft-1")).toBe(true);
  });

  it("fans out to every one of the manager's devices", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("mgr-1", SUB);
    await store.addSubscription("mgr-1", { ...SUB, endpoint: "https://push.example/two" });

    const res = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);
    expect(res).toEqual({ sent: 2, reason: "ok" });
    expect(store.sends).toHaveLength(2);
  });
});

describe("dispatchToManager — idempotency (the ledger guard)", () => {
  it("a second identical call loses the ledger race → no-op, no second send", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("mgr-1", SUB);

    const first = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);
    const second = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);

    expect(first).toEqual({ sent: 1, reason: "ok" });
    expect(second).toEqual({ sent: 0, reason: "duplicate" });
    expect(store.sends).toHaveLength(1); // exactly one delivery across both calls
  });

  it("a DIFFERENT subjectId is a distinct ledger row → sends again", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("mgr-1", SUB);

    await dispatchToManager(store, "mgr-1", "match_starting", "m-1", PAYLOAD);
    const other = await dispatchToManager(store, "mgr-1", "match_starting", "m-2", PAYLOAD);

    expect(other).toEqual({ sent: 1, reason: "ok" });
    expect(store.sends).toHaveLength(2);
  });
});

describe("dispatchToManager — no subscriptions does not burn the ledger", () => {
  it("returns no_subscriptions WITHOUT claiming, so a later subscribe still notifies", async () => {
    const store = new MemoryNotifyStore();

    const first = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);
    expect(first).toEqual({ sent: 0, reason: "no_subscriptions" });
    expect(store.hasLedger("mgr-1", "draft_turn", "draft-1")).toBe(false);

    // The manager subscribes after the fact; the next dispatch DELIVERS.
    await store.addSubscription("mgr-1", SUB);
    const second = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);
    expect(second).toEqual({ sent: 1, reason: "ok" });
  });
});

describe("dispatchToManager — prunes expired subscriptions", () => {
  it("a 410 Gone endpoint is removed; the send is not counted", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("mgr-1", SUB);
    store.failingEndpoints.set(SUB.endpoint, 410);

    const res = await dispatchToManager(store, "mgr-1", "draft_turn", "draft-1", PAYLOAD);

    expect(res).toEqual({ sent: 0, reason: "ok" });
    expect(store.subscriptionCount("mgr-1")).toBe(0); // pruned
  });
});

const ALERT_PAYLOAD = {
  title: "Playoff cut needs review",
  body: "R32: a boundary tie can't be auto-cut — run commish:advance --break-tie.",
  url: "/commish",
  tag: "cut_needs_review:R32",
};

describe("dispatchCommissionerAlert — governance alert (no preference gate)", () => {
  it("sends + records the free-TEXT ledger row on the first call, then dedups", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("commish", SUB);

    const first = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );
    const second = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );

    expect(first).toEqual({ sent: 1, reason: "ok" });
    expect(second).toEqual({ sent: 0, reason: "duplicate" }); // at-most-once per round
    expect(store.sends).toHaveLength(1);
    expect(store.hasLedger("commish", "cut_needs_review", "R32")).toBe(true);
  });

  it("is NOT preference-gated — fires even with every channel muted", async () => {
    const store = new MemoryNotifyStore();
    await store.upsertPreferences("commish", {
      draftTurn: false,
      playerNotStarting: false,
      matchStarting: false,
    });
    await store.addSubscription("commish", SUB);

    const res = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );
    expect(res).toEqual({ sent: 1, reason: "ok" }); // governance alerts are not opt-out
    expect(store.sends).toHaveLength(1);
  });

  it("no device → no send and does NOT burn the ledger (a later subscribe is still alerted)", async () => {
    const store = new MemoryNotifyStore();

    const first = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );
    expect(first).toEqual({ sent: 0, reason: "no_subscriptions" });
    expect(store.hasLedger("commish", "cut_needs_review", "R32")).toBe(false);

    await store.addSubscription("commish", SUB);
    const second = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );
    expect(second).toEqual({ sent: 1, reason: "ok" });
  });

  it("a different round is a distinct ledger row → alerts again", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("commish", SUB);

    await dispatchCommissionerAlert(store, "commish", "cut_needs_review", "R32", ALERT_PAYLOAD);
    const other = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R16",
      ALERT_PAYLOAD,
    );
    expect(other).toEqual({ sent: 1, reason: "ok" });
    expect(store.sends).toHaveLength(2);
  });

  it("prunes a 410 Gone endpoint", async () => {
    const store = new MemoryNotifyStore();
    await store.addSubscription("commish", SUB);
    store.failingEndpoints.set(SUB.endpoint, 410);

    const res = await dispatchCommissionerAlert(
      store,
      "commish",
      "cut_needs_review",
      "R32",
      ALERT_PAYLOAD,
    );
    expect(res).toEqual({ sent: 0, reason: "ok" });
    expect(store.subscriptionCount("commish")).toBe(0);
  });
});
