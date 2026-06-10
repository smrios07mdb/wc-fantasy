import { describe, it, expect } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import { MemoryNotifyStore } from "@app/notify";
import {
  handleSubscribe,
  handleUnsubscribe,
  handlePreferences,
  handleTest,
  type NotifyHandlerDeps,
} from "./handlers";

const aliceManager: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

const okOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: aliceManager,
  isCommissioner: false,
};

function makeDeps(
  outcome: SessionManagerOutcome,
  store = new MemoryNotifyStore(),
): { deps: NotifyHandlerDeps; store: MemoryNotifyStore } {
  return { deps: { resolveManager: () => Promise.resolve(outcome), store }, store };
}

const VALID_SUB = {
  endpoint: "https://push.example/abc",
  keys: { p256dh: "pub-key", auth: "auth-secret" },
};

// ── subscribe ──────────────────────────────────────────────────────────────────
describe("handleSubscribe — auth gate then self-scoped write", () => {
  it("401 + no write when there is no session", async () => {
    const { deps, store } = makeDeps({ kind: "no-session" });
    const res = await handleSubscribe(deps, VALID_SUB);
    expect(res.status).toBe(401);
    expect(store.subscriptionCount("mgr-alice")).toBe(0);
  });

  it("403 when not allowlisted", async () => {
    const { deps } = makeDeps({ kind: "not-allowlisted", email: "x@y.com" });
    expect((await handleSubscribe(deps, VALID_SUB)).status).toBe(403);
  });

  it("403 when no manager is linked", async () => {
    const { deps } = makeDeps({ kind: "no-manager", userId: "uid-alice" });
    expect((await handleSubscribe(deps, VALID_SUB)).status).toBe(403);
  });

  it("400 + no write for a malformed subscription body", async () => {
    const { deps, store } = makeDeps(okOutcome);
    expect((await handleSubscribe(deps, { endpoint: "x" })).status).toBe(400);
    expect((await handleSubscribe(deps, null)).status).toBe(400);
    expect((await handleSubscribe(deps, { endpoint: "x", keys: { p256dh: "p" } })).status).toBe(
      400,
    );
    expect(store.subscriptionCount("mgr-alice")).toBe(0);
  });

  it("200 stores the subscription against the SESSION manager's id (self-only)", async () => {
    const { deps, store } = makeDeps(okOutcome);
    const res = await handleSubscribe(deps, VALID_SUB);
    expect(res.status).toBe(200);
    expect(store.subscriptionCount("mgr-alice")).toBe(1);
    const subs = await store.listSubscriptions("mgr-alice");
    expect(subs[0]).toEqual({
      endpoint: VALID_SUB.endpoint,
      p256dh: "pub-key",
      auth: "auth-secret",
    });
  });
});

// ── unsubscribe ──────────────────────────────────────────────────────────────────
describe("handleUnsubscribe — auth gate then self-scoped delete", () => {
  it("401 when there is no session", async () => {
    const { deps } = makeDeps({ kind: "no-session" });
    expect((await handleUnsubscribe(deps, { endpoint: "x" })).status).toBe(401);
  });

  it("400 when the endpoint is missing", async () => {
    const { deps } = makeDeps(okOutcome);
    expect((await handleUnsubscribe(deps, {})).status).toBe(400);
    expect((await handleUnsubscribe(deps, { endpoint: 42 })).status).toBe(400);
  });

  it("200 removes the caller's subscription", async () => {
    const { deps, store } = makeDeps(okOutcome);
    await store.addSubscription("mgr-alice", {
      endpoint: VALID_SUB.endpoint,
      p256dh: "p",
      auth: "a",
    });
    const res = await handleUnsubscribe(deps, { endpoint: VALID_SUB.endpoint });
    expect(res.status).toBe(200);
    expect(store.subscriptionCount("mgr-alice")).toBe(0);
  });
});

// ── preferences ──────────────────────────────────────────────────────────────────
describe("handlePreferences — auth gate then validated write", () => {
  it("401 when there is no session", async () => {
    const { deps } = makeDeps({ kind: "no-session" });
    expect(
      (
        await handlePreferences(deps, {
          draftTurn: true,
          playerNotStarting: true,
          matchStarting: true,
        })
      ).status,
    ).toBe(401);
  });

  it("400 for an invalid (non-boolean / partial) body", async () => {
    const { deps } = makeDeps(okOutcome);
    expect((await handlePreferences(deps, { draftTurn: "yes" })).status).toBe(400);
    expect((await handlePreferences(deps, {})).status).toBe(400);
  });

  it("200 persists the three flags and echoes them", async () => {
    const { deps, store } = makeDeps(okOutcome);
    const res = await handlePreferences(deps, {
      draftTurn: false,
      playerNotStarting: true,
      matchStarting: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      preferences: { draftTurn: false, playerNotStarting: true, matchStarting: false },
    });
    expect(await store.getPreference("mgr-alice")).toEqual({
      draftTurn: false,
      playerNotStarting: true,
      matchStarting: false,
    });
  });
});

// ── test (transport probe) ───────────────────────────────────────────────────────
describe("handleTest — sends a test push, bypassing the ledger", () => {
  it("401 when there is no session", async () => {
    const { deps } = makeDeps({ kind: "no-session" });
    expect((await handleTest(deps)).status).toBe(401);
  });

  it("200 sends to every device and does NOT write the ledger", async () => {
    const { deps, store } = makeDeps(okOutcome);
    await store.addSubscription("mgr-alice", { endpoint: "https://p/1", p256dh: "p", auth: "a" });
    await store.addSubscription("mgr-alice", { endpoint: "https://p/2", p256dh: "p", auth: "a" });

    const res = await handleTest(deps);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: 2 });
    expect(store.sends).toHaveLength(2);
    // ledger is untouched (the probe proves transport only).
    expect(store.hasLedger("mgr-alice", "draft_turn", "test")).toBe(false);
  });

  it("200 with sent:0 when the caller has no subscriptions", async () => {
    const { deps } = makeDeps(okOutcome);
    const res = await handleTest(deps);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: 0 });
  });
});
