import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import { handleToggleWatch, parseWatchlistBody, type WatchlistStore } from "./handleWatchlist";

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

/** In-memory watchlist double — records (managerId, playerId) rows, idempotent like the Prisma adapter. */
function memoryStore() {
  const rows: { managerId: string; playerId: string }[] = [];
  const store: WatchlistStore = {
    setWatched: vi.fn(async (managerId: string, playerId: string) => {
      if (!rows.some((r) => r.managerId === managerId && r.playerId === playerId)) {
        rows.push({ managerId, playerId });
      }
    }),
    clearWatched: vi.fn(async (managerId: string, playerId: string) => {
      const i = rows.findIndex((r) => r.managerId === managerId && r.playerId === playerId);
      if (i >= 0) rows.splice(i, 1);
    }),
  };
  return { store, rows };
}

/** A store that throws on EVERY method — proves a rejected caller never reaches the DB (decoupling). */
const explodingStore: WatchlistStore = new Proxy({} as WatchlistStore, {
  get() {
    return () => {
      throw new Error("store must not be touched before auth passes");
    };
  },
});

describe("handleToggleWatch — identity gate BEFORE any DB access", () => {
  it("401 when there is no session — store untouched", async () => {
    const res = await handleToggleWatch(
      { resolveManager: async () => ({ kind: "no-session" }), store: explodingStore },
      { playerId: "p1", watched: true },
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
  });

  it("403 when the email is not allowlisted — store untouched", async () => {
    const res = await handleToggleWatch(
      {
        resolveManager: async () => ({ kind: "not-allowlisted", email: "x@y.com" }),
        store: explodingStore,
      },
      { playerId: "p1", watched: true },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "not_allowlisted" });
  });

  it("403 when the user has no manager — store untouched", async () => {
    const res = await handleToggleWatch(
      {
        resolveManager: async () => ({ kind: "no-manager", userId: "uid-x" }),
        store: explodingStore,
      },
      { playerId: "p1", watched: true },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "no_manager" });
  });
});

describe("handleToggleWatch — the toggle (self-scoped, idempotent, decoupled)", () => {
  it("watched:true stars the player for the SESSION manager id (never a client id)", async () => {
    const { store, rows } = memoryStore();
    const res = await handleToggleWatch(
      { resolveManager: async () => okOutcome, store },
      { playerId: "p1", watched: true },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, watched: true });
    // The id comes from the session manager — clearWatched is never called on a set.
    expect(store.setWatched).toHaveBeenCalledWith("mgr-alice", "p1");
    expect(store.clearWatched).not.toHaveBeenCalled();
    expect(rows).toEqual([{ managerId: "mgr-alice", playerId: "p1" }]);
  });

  it("watched:true twice is idempotent — exactly one row", async () => {
    const { store, rows } = memoryStore();
    const deps = { resolveManager: async () => okOutcome, store };
    await handleToggleWatch(deps, { playerId: "p1", watched: true });
    await handleToggleWatch(deps, { playerId: "p1", watched: true });
    expect(rows).toEqual([{ managerId: "mgr-alice", playerId: "p1" }]);
  });

  it("watched:false deletes the star, and unstarring a missing row still 200s (idempotent)", async () => {
    const { store, rows } = memoryStore();
    const deps = { resolveManager: async () => okOutcome, store };
    await handleToggleWatch(deps, { playerId: "p1", watched: true });
    const off = await handleToggleWatch(deps, { playerId: "p1", watched: false });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ ok: true, watched: false });
    expect(rows).toEqual([]);
    const again = await handleToggleWatch(deps, { playerId: "p1", watched: false });
    expect(again.status).toBe(200);
    expect(rows).toEqual([]);
  });
});

describe("parseWatchlistBody — the 400 decision (malformed → null)", () => {
  it("accepts a well-formed body", () => {
    expect(parseWatchlistBody({ playerId: "p1", watched: true })).toEqual({
      playerId: "p1",
      watched: true,
    });
    expect(parseWatchlistBody({ playerId: "p1", watched: false })).toEqual({
      playerId: "p1",
      watched: false,
    });
  });

  it("rejects malformed bodies (→ the route returns 400 bad_request)", () => {
    expect(parseWatchlistBody(null)).toBeNull();
    expect(parseWatchlistBody("nope")).toBeNull();
    expect(parseWatchlistBody({})).toBeNull();
    expect(parseWatchlistBody({ playerId: "p1" })).toBeNull(); // missing watched
    expect(parseWatchlistBody({ watched: true })).toBeNull(); // missing playerId
    expect(parseWatchlistBody({ playerId: 1, watched: true })).toBeNull(); // wrong type
    expect(parseWatchlistBody({ playerId: "", watched: true })).toBeNull(); // empty id
    expect(parseWatchlistBody({ playerId: "p1", watched: "yes" })).toBeNull(); // wrong type
  });

  it("ignores a client-supplied managerId (the managerId is resolved server-side only)", () => {
    expect(
      parseWatchlistBody({ playerId: "p1", watched: true, managerId: "SOMEONE-ELSE" }),
    ).toEqual({ playerId: "p1", watched: true });
  });
});
