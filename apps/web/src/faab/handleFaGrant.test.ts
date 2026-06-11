import { describe, it, expect } from "vitest";
import { MemoryFaGrantStore, type FaGrantStore, type PeriodWindowView } from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import { handleFaGrant } from "./handleFaGrant";

/**
 * The gated $0 free-agency route (DECISIONS.md → Theme D amendment, Prompt 48). Identity FIRST — reject
 * 401/403 BEFORE any store access (the bid-route template) — then window gate (free-agency phase only)
 * + snapshot eligibility + drop/roster rules, then an atomic first-come claim. Exercised against the
 * in-memory FA store double.
 */

const NOW = new Date("2026-06-11T08:00:00Z"); // inside the free-agency window
const FULL = { GK: 2, DEF: 5, MID: 5, FWD: 3 } as const;

// The add target's period: batch cleared 06:00, first kickoff 12:00 → free-agency at NOW (08:00).
const FA_WINDOW: PeriodWindowView = {
  batchClearedAt: new Date("2026-06-11T06:00:00Z"),
  firstKickoffAt: new Date("2026-06-11T12:00:00Z"),
};

const okOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: { id: "A", userId: "uid-a", email: "a@x.com", isCommissioner: false, displayName: "A" },
  isCommissioner: false,
};

function freshStore(opts: { lockedDrops?: string[]; leagueOwned?: string[] } = {}) {
  return new MemoryFaGrantStore({
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
      X: { position: "MID", window: FA_WINDOW, faEligible: true },
      DROP: { position: "MID", window: FA_WINDOW, faEligible: false },
      SEALED: {
        position: "MID",
        window: { batchClearedAt: null, firstKickoffAt: FA_WINDOW.firstKickoffAt },
        faEligible: true,
      },
      LOCKED: {
        position: "MID",
        window: {
          batchClearedAt: FA_WINDOW.batchClearedAt,
          firstKickoffAt: new Date("2026-06-11T07:00:00Z"),
        },
        faEligible: true,
      },
      DROPPED_THIS_WINDOW: { position: "MID", window: FA_WINDOW, faEligible: false },
    },
    lockedDrops: opts.lockedDrops,
    leagueOwned: opts.leagueOwned,
  });
}

const explodingStore: FaGrantStore = new Proxy({} as FaGrantStore, {
  get() {
    return () => {
      throw new Error("store must not be touched before auth passes");
    };
  },
});

const body = { managerId: "A", playerAddId: "X", playerDropId: "DROP" };

describe("handleFaGrant — auth gating (401/403 BEFORE any write)", () => {
  it("401 with no session — store untouched", async () => {
    const res = await handleFaGrant(
      { resolveManager: async () => ({ kind: "no-session" }), store: explodingStore, now: NOW },
      body,
    );
    expect(res.status).toBe(401);
  });

  it("403 not allowlisted — store untouched", async () => {
    const res = await handleFaGrant(
      {
        resolveManager: async () => ({ kind: "not-allowlisted", email: "x@y.com" }),
        store: explodingStore,
        now: NOW,
      },
      body,
    );
    expect(res.status).toBe(403);
  });

  it("403 acting as a different manager (scope self) — store untouched", async () => {
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store: explodingStore, now: NOW },
      { ...body, managerId: "SOMEONE-ELSE" },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_your_manager" });
  });
});

describe("handleFaGrant — window + eligibility + grant", () => {
  it("grants an eligible FA in the free-agency phase (200), applies the add/drop, budget unchanged", async () => {
    const store = freshStore();
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      body,
    );
    expect(res.status).toBe(200);
    expect(store.grants).toEqual([{ managerId: "A", playerAddId: "X", playerDropId: "DROP" }]);
    expect(store.ownedBy("A")).toContain("X");
    expect(store.ownedBy("A")).not.toContain("DROP");
    expect(store.budgetOf("A")).toBe(100); // $0 — never debited
  });

  it("rejects in the sealed-bid phase (409 fa-window-closed) — bid instead", async () => {
    const store = freshStore();
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...body, playerAddId: "SEALED" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("fa-window-closed");
    expect(store.grants).toHaveLength(0);
  });

  it("rejects once the window is locked at first kickoff (409 fa-window-closed)", async () => {
    const store = freshStore();
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...body, playerAddId: "LOCKED" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("fa-window-closed");
  });

  it("rejects a player dropped THIS window — not grabbable (409 fa-not-eligible, snapshot rule)", async () => {
    const store = freshStore();
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...body, playerAddId: "DROPPED_THIS_WINDOW" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("fa-not-eligible");
  });

  it("enforces drop-lock (409 drop-locked) without granting", async () => {
    const store = freshStore({ lockedDrops: ["DROP"] });
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      body,
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("drop-locked");
    expect(store.grants).toHaveLength(0);
  });

  it("404 when the add player is unknown", async () => {
    const store = freshStore();
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...body, playerAddId: "GHOST" },
    );
    expect(res.status).toBe(404);
  });

  it("first-come: two managers grab the same FA — exactly one wins, the loser gets a clean 409", async () => {
    // Same store (shared league ownership): the first grant claims X; the second sees it owned → conflict.
    const store = freshStore();
    const first = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", playerAddId: "X", playerDropId: "DROP" },
    );
    expect(first.status).toBe(200);

    // A second manager B grabs the same X (B owns a different drop). Model the league-wide ownership
    // claim by seeding X as already owned (the active-ownership unique would reject B's INSERT).
    const storeB = new MemoryFaGrantStore({
      managers: [
        {
          managerId: "B",
          leagueId: "L",
          faabBudget: 100,
          counts: { ...FULL },
          squadSize: 15,
          owned: new Set(["BDROP"]),
        },
      ],
      players: {
        X: { position: "MID", window: FA_WINDOW, faEligible: true },
        BDROP: { position: "MID", window: FA_WINDOW, faEligible: false },
      },
      leagueOwned: ["X"], // X already claimed by A → the active-ownership unique blocks B
    });
    const bOutcome: SessionManagerOutcome = {
      kind: "ok",
      manager: {
        id: "B",
        userId: "uid-b",
        email: "b@x.com",
        isCommissioner: false,
        displayName: "B",
      },
      isCommissioner: false,
    };
    const second = await handleFaGrant(
      { resolveManager: async () => bOutcome, store: storeB, now: NOW },
      { managerId: "B", playerAddId: "X", playerDropId: "BDROP" },
    );
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe("fa-conflict");
    expect(storeB.grants).toHaveLength(0);
  });

  it("enforces roster legality (409 roster-illegal) — GK for MID on a full squad", async () => {
    const store = new MemoryFaGrantStore({
      managers: [
        {
          managerId: "A",
          leagueId: "L",
          faabBudget: 100,
          counts: { ...FULL },
          squadSize: 15,
          owned: new Set(["DROPMID"]),
        },
      ],
      players: {
        GKADD: { position: "GK", window: FA_WINDOW, faEligible: true },
        DROPMID: { position: "MID", window: FA_WINDOW, faEligible: false },
      },
    });
    const res = await handleFaGrant(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", playerAddId: "GKADD", playerDropId: "DROPMID" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("roster-illegal");
  });
});
