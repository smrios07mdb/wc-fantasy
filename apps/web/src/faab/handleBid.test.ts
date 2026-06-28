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
      // periodFirstKickoffAt = the add target's PERIOD first kickoff (the league-wide cutoff);
      // periodBatchClearedAt = that period's blind-bid batch-clear latch (null = still sealed-bid).
      X: {
        position: "MID",
        periodFirstKickoffAt: new Date("2026-06-10T15:00:00Z"),
        periodBatchClearedAt: null,
      },
      DROP: { position: "MID", periodFirstKickoffAt: null, periodBatchClearedAt: null },
      KICKED: {
        position: "MID",
        periodFirstKickoffAt: new Date("2026-06-10T05:00:00Z"),
        periodBatchClearedAt: null,
      },
      // CLEARED: the add-period's batch has already cleared (free-agency phase), though its first
      // kickoff (15:00Z) is still ahead of NOW (06:00Z) — a sealed bid here is the MD1 stranded gap.
      CLEARED: {
        position: "MID",
        periodFirstKickoffAt: new Date("2026-06-10T15:00:00Z"),
        periodBatchClearedAt: new Date("2026-06-10T05:30:00Z"),
      },
      // ELIM: still sealed + upcoming, but his WC team is ELIMINATED (DECISIONS §D add gate).
      ELIM: {
        position: "MID",
        periodFirstKickoffAt: new Date("2026-06-10T15:00:00Z"),
        periodBatchClearedAt: null,
        addTeamEliminated: true,
      },
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

  it("rejects an add whose PERIOD first kickoff already passed (409 — acquisition window closed)", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: new Date("2026-06-10T16:00:00Z") },
      { ...submitBody, playerAddId: "KICKED" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("add-kicked-off");
  });

  it("rejects a sealed bid AFTER the add-period's batch cleared (409 bid-window-closed) — no write", async () => {
    // The MD1 strand: the batch latch is stamped (free-agency phase) but first kickoff is still ahead;
    // a sealed bid must be rejected BEFORE any write (the manager uses the $0 FA route instead).
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW }, // NOW = 06:00Z, kickoff 15:00Z
      { ...submitBody, playerAddId: "CLEARED" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("bid-window-closed");
    expect(store.rows).toHaveLength(0);
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

  it("D4: blocks a playoff non-participant (409 not-participant) without persisting", async () => {
    const store = new MemoryFaabBidStore({
      managers: [
        {
          managerId: "A",
          leagueId: "L",
          faabBudget: 100,
          counts: { ...FULL },
          squadSize: 15,
          owned: new Set(["DROP"]),
          isPlayoffParticipant: false, // eliminated / non-advancer in the playoff phase
        },
      ],
      players: {
        X: {
          position: "MID",
          periodFirstKickoffAt: new Date("2026-06-10T15:00:00Z"),
          periodBatchClearedAt: null,
        },
        DROP: { position: "MID", periodFirstKickoffAt: null, periodBatchClearedAt: null },
      },
      leagueOwned: ["DROP"],
    });
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      submitBody,
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not-participant");
    expect(store.rows).toHaveLength(0);
  });

  it("rejects an add whose WC team is ELIMINATED (409 add-team-eliminated) without persisting", async () => {
    const store = freshStore();
    const res = await handleSubmitBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { ...submitBody, playerAddId: "ELIM" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("add-team-eliminated");
    expect(store.rows).toHaveLength(0);
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

  it("re-gates the window on EDIT: raising a bid whose add-period has since cleared (409 bid-window-closed) — no write", async () => {
    const store = freshStore();
    // A bid placed while sealed, on a player (CLEARED) whose period's batch has since cleared. The edit
    // path re-validates against the add target's window, so the raise must be rejected before any write.
    store.rows.push({
      bidId: "stale-bid",
      managerId: "A",
      playerAddId: "CLEARED",
      playerDropId: "DROP",
      amount: 10,
      note: null,
      status: "pending",
    } as never);

    const res = await handleEditBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId: "stale-bid", amount: 25, playerDropId: "DROP", note: "raise" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("bid-window-closed");
    expect(store.rows[0]!.amount).toBe(10); // unchanged — no write
  });

  it("re-gates elimination on EDIT: editing a bid whose add team is now eliminated (409 add-team-eliminated) — no write", async () => {
    const store = freshStore();
    // A bid placed while the team was alive, on a player (ELIM) whose WC team has since been eliminated.
    // The edit path re-validates the FIXED add target, so the raise is rejected before any write.
    store.rows.push({
      bidId: "elim-bid",
      managerId: "A",
      playerAddId: "ELIM",
      playerDropId: "DROP",
      amount: 10,
      note: null,
      status: "pending",
    } as never);

    const res = await handleEditBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId: "elim-bid", amount: 25, playerDropId: "DROP", note: "raise" },
    );
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("add-team-eliminated");
    expect(store.rows[0]!.amount).toBe(10); // unchanged — no write
  });

  it("CANCEL is unaffected by elimination — a bid on a now-eliminated player can always be withdrawn (200)", async () => {
    const store = freshStore();
    store.rows.push({
      bidId: "elim-bid",
      managerId: "A",
      playerAddId: "ELIM",
      playerDropId: "DROP",
      amount: 10,
      note: null,
      status: "pending",
    } as never);

    const res = await handleCancelBid(
      { resolveManager: async () => okOutcome, store, now: NOW },
      { managerId: "A", bidId: "elim-bid" },
    );
    expect(res.status).toBe(200); // cancel runs no validator
    expect(store.rows).toHaveLength(0);
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
