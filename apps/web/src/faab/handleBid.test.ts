import { describe, it, expect } from "vitest";
import { MemoryFaabBidStore, type FaabBidStore } from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import { handleSubmitBid, handleEditBid, handleCancelBid } from "./handleBid";

/**
 * The gated bid route handlers (the `/api/draft/pick` template): identity FIRST — reject 401 (no
 * session) / 403 (not allowlisted / no manager / not your manager) BEFORE any DB write — then validate
 * + persist. These tests pin that ordering (a rejected caller must never touch the store) and the
 * submission-validation wiring, against the in-memory bid store double.
 */

const NOW = new Date("2026-06-10T06:00:00Z");
const FULL = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;

const okOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: { id: "A", userId: "uid-a", email: "a@x.com", isCommissioner: false, displayName: "A" },
  isCommissioner: false,
};

function freshStore(opts: { lockedDrops?: string[] } = {}) {
  return new MemoryFaabBidStore({
    managers: [
      {
        managerId: "A",
        leagueId: "L",
        faabBudget: 100,
        counts: { ...FULL },
        squadSize: 15,
        owned: new Set(["DROP"]),
      },
    ],
    players: {
      X: { position: "MID", kickoffAt: new Date("2026-06-10T15:00:00Z") },
      DROP: { position: "MID", kickoffAt: null },
      KICKED: { position: "MID", kickoffAt: new Date("2026-06-10T05:00:00Z") },
    },
    leagueOwned: ["DROP"],
    lockedDrops: opts.lockedDrops,
  });
}

/** A store that throws on EVERY method — proves a rejected caller never reaches the DB. */
const explodingStore: FaabBidStore = new Proxy({} as FaabBidStore, {
  get() {
    return () => {
      throw new Error("store must not be touched before auth passes");
    };
  },
});

const submitBody = {
  managerId: "A",
  playerAddId: "X",
  playerDropId: "DROP",
  amount: 10,
  note: null,
};

describe("handleSubmitBid — auth gating (401/403 BEFORE any write)", () => {
  it("401 when there is no session — store untouched", async () => {
    const res = await handleSubmitBid(
      { resolveManager: async () => ({ kind: "no-session" }), store: explodingStore, now: NOW },
      submitBody,
    );
    expect(res.status).toBe(401);
  });

  it("403 when the session is not allowlisted — store untouched", async () => {
    const res = await handleSubmitBid(
      {
        resolveManager: async () => ({ kind: "not-allowlisted", email: "x@y.com" }),
        store: explodingStore,
        now: NOW,
      },
      submitBody,
    );
    expect(res.status).toBe(403);
  });

  it("403 when acting as a DIFFERENT manager (scope self) — store untouched", async () => {
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store: explodingStore, now: NOW },
      { ...submitBody, managerId: "SOMEONE-ELSE" },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_your_manager" });
  });
});

describe("handleSubmitBid — validation + persistence", () => {
  it("persists a legal pending bid and echoes it (200)", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      submitBody,
    );
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.status).toBe("pending");
    expect(store.rows[0]!.amount).toBe(10);
  });

  it("rejects an over-budget bid (409) without persisting", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...submitBody, amount: 200 },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("over-budget");
    expect(store.rows).toHaveLength(0);
  });

  it("rejects an add whose match already kicked off (409)", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: new Date("2026-06-10T16:00:00Z") },
      { ...submitBody, playerAddId: "KICKED" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("add-kicked-off");
  });

  it("rejects a drop locked by play (409 drop-locked) without persisting", async () => {
    const store = freshStore({ lockedDrops: ["DROP"] }); // DROP has played this matchday
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      submitBody,
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("drop-locked");
    expect(store.rows).toHaveLength(0);
  });

  it("404 when the add player is unknown", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...submitBody, playerAddId: "GHOST" },
    );
    expect(res.status).toBe(404);
  });
});

describe("handleEditBid / handleCancelBid — self-scoped bid mutations", () => {
  it("403 when editing a bid that belongs to another manager (even with a valid session)", async () => {
    const store = freshStore();
    // Seed a bid owned by a DIFFERENT manager.
    store.rows.push({
      bidId: "other-bid",
      managerId: "B",
      playerAddId: "X",
      playerDropId: "DROP",
      amount: 5,
      note: null,
      status: "pending",
    } as never);

    const res = await handleEditBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId: "other-bid", amount: 20, playerDropId: "DROP", note: null },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_your_manager" });
  });

  it("edits the manager's own pending bid (200)", async () => {
    const store = freshStore();
    await handleSubmitBid({ resolveManager: async () => okOutcome, store, now: NOW }, submitBody);
    const bidId = store.rows[0]!.bidId;

    const res = await handleEditBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId, amount: 25, playerDropId: "DROP", note: "raise" },
    );
    expect(res.status).toBe(200);
    expect(store.rows[0]!.amount).toBe(25);
  });

  it("cancels the manager's own pending bid (200) and 404s a missing one", async () => {
    const store = freshStore();
    await handleSubmitBid({ resolveManager: async () => okOutcome, store, now: NOW }, submitBody);
    const bidId = store.rows[0]!.bidId;

    const ok = await handleCancelBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId },
    );
    expect(ok.status).toBe(200);
    expect(store.rows).toHaveLength(0);

    const missing = await handleCancelBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId: "nope" },
    );
    expect(missing.status).toBe(404);
  });

  it("401 on cancel with no session — store untouched", async () => {
    const res = await handleCancelBid(
      { resolveManager: async () => ({ kind: "no-session" }), store: explodingStore, now: NOW },
      { managerId: "A", bidId: "whatever" },
    );
    expect(res.status).toBe(401);
  });
});
