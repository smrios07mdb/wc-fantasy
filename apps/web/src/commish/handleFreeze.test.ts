/**
 * Thread 4 — pure handler tests for POST /api/commish/freeze + /unfreeze (RED first).
 *
 * The handlers gate → validate → guard → delegate the atomic write+audit to the injected store
 * (`CommishFreezeStore`), mirroring the Thread-2 `handleStatCorrection` shape. The store double here
 * records calls; the REAL store's transaction + conditional-update race guard is proven in the gated
 * Postgres suite (commishFreeze.integration.test.ts).
 *
 * Pinned semantics (Step-0 discovery, quoted in the thread report):
 *   • freeze/unfreeze touch ONLY `period.frozen_at` — the auto-restatement gate. No lineup locking,
 *     no scoring pause (those are separate machinery).
 *   • idempotency = typed 409 (`already_frozen` / `not_frozen`), NEVER a silent 200: a 200 without an
 *     audit row would break "every action is logged", and a duplicate audit row would log a write
 *     that never happened. The store returns null on the conditional-update race → the same 409.
 *   • unfreeze requires a reason and surfaces `pendingDirty` (unprocessed manager_period markers)
 *     plus the re-freeze warning (the hourly cron re-stamps on its next pass).
 */
import { describe, expect, it, vi } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import {
  handleFreeze,
  handleUnfreeze,
  periodFreezable,
  periodLive,
  UNFREEZE_REFREEZE_WARNING,
  type CommishFreezeDeps,
  type CommishFreezeStore,
  type FreezePeriodContext,
} from "./handleFreeze";

const NOW = new Date("2026-07-02T12:00:00Z");

const COMMISH: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr_c",
    userId: "user_c",
    email: "smrios07@gmail.com",
    isCommissioner: true,
    displayName: "Commish",
  },
  isCommissioner: true,
};
const NON_COMMISH: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr_x",
    userId: "user_x",
    email: "x@example.com",
    isCommissioner: false,
    displayName: "Member",
  },
  isCommissioner: false,
};

/** A settled, unfrozen, closed MD1 — the happy freeze target. */
function settledPeriod(overrides: Partial<FreezePeriodContext> = {}): FreezePeriodContext {
  return {
    leagueId: "lg1",
    label: "Matchday 1",
    status: "closed",
    frozenAt: null,
    fixtureStatuses: ["completed", "completed"],
    ...overrides,
  };
}

function makeStore(overrides: Partial<CommishFreezeStore> = {}): CommishFreezeStore {
  return {
    getManagerLeagueId: vi.fn(async () => "lg1"),
    getPeriod: vi.fn(async () => settledPeriod()),
    freeze: vi.fn(async () => ({ auditId: "audit_f" })),
    unfreeze: vi.fn(async () => ({ auditId: "audit_u" })),
    countPendingDirty: vi.fn(async () => 0),
    ...overrides,
  };
}

function deps(
  store: CommishFreezeStore,
  outcome: SessionManagerOutcome = COMMISH,
): CommishFreezeDeps {
  return { resolveManager: async () => outcome, now: () => NOW, store };
}

// ── the shared guard predicates (pure — also drive the loader's `freezable`/`live` view flags) ──

describe("periodFreezable", () => {
  it("closed period is freezable regardless of fixture list", () => {
    expect(periodFreezable("closed", [])).toBe(true);
    expect(periodFreezable("closed", ["completed"])).toBe(true);
  });
  it("open period with ALL fixtures completed is freezable (early-finalize before the 6h window)", () => {
    expect(periodFreezable("open", ["completed", "completed"])).toBe(true);
  });
  it("live / future / anomalous / fixtureless waves are NOT freezable", () => {
    expect(periodFreezable("open", ["completed", "in_progress"])).toBe(false);
    expect(periodFreezable("open", ["scheduled"])).toBe(false);
    expect(periodFreezable("pending", [])).toBe(false);
    expect(periodFreezable("open", ["completed", "postponed"])).toBe(false);
  });
});

describe("periodLive", () => {
  it("live iff any fixture is in_progress", () => {
    expect(periodLive(["completed", "in_progress"])).toBe(true);
    expect(periodLive(["completed", "scheduled"])).toBe(false);
    expect(periodLive([])).toBe(false);
  });
});

// ── freeze ──────────────────────────────────────────────────────────────────────────────────────

describe("handleFreeze", () => {
  it("401 with no session, BEFORE any store read", async () => {
    const store = makeStore();
    const res = await handleFreeze(deps(store, { kind: "no-session" }), {
      periodId: "p1",
      reason: "r",
    });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "no_session" });
    expect(store.getPeriod).not.toHaveBeenCalled();
  });

  it("403 for a non-commissioner, BEFORE any store read", async () => {
    const store = makeStore();
    const res = await handleFreeze(deps(store, NON_COMMISH), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(403);
    expect(store.getPeriod).not.toHaveBeenCalled();
  });

  it("400 reason_required when the reason is blank", async () => {
    const store = makeStore();
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "   " });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
    expect(store.getPeriod).not.toHaveBeenCalled();
  });

  it("400 bad_request when periodId is missing", async () => {
    const res = await handleFreeze(deps(makeStore()), { periodId: "", reason: "r" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("404 invalid_period for an unknown period", async () => {
    const store = makeStore({ getPeriod: vi.fn(async () => null) });
    const res = await handleFreeze(deps(store), { periodId: "nope", reason: "r" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_period" });
  });

  it("404 invalid_period for a period in ANOTHER league (no cross-league writes, no existence leak)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () => settledPeriod({ leagueId: "other_league" })),
    });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "invalid_period" });
    expect(store.freeze).not.toHaveBeenCalled();
  });

  it("409 already_frozen when the period is already frozen (typed no-op — no write, no audit row)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () => settledPeriod({ frozenAt: new Date("2026-07-01T00:00:00Z") })),
    });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("already_frozen");
    expect(store.freeze).not.toHaveBeenCalled();
  });

  it("409 not_freezable for a live wave (fixture in_progress)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () =>
        settledPeriod({ status: "open", fixtureStatuses: ["completed", "in_progress"] }),
      ),
    });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not_freezable");
    expect(store.freeze).not.toHaveBeenCalled();
  });

  it("409 not_freezable for a future wave (all fixtures scheduled, status pending)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () =>
        settledPeriod({ status: "pending", fixtureStatuses: ["scheduled", "scheduled"] }),
      ),
    });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not_freezable");
  });

  it("freezes an all-FT period that is still status-open (early-finalize before the 6h window)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () =>
        settledPeriod({ status: "open", fixtureStatuses: ["completed", "completed"] }),
      ),
    });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "final now" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, frozenAt: NOW.toISOString(), auditId: "audit_f" });
  });

  it("passes the atomic write+audit payload to the store (period_freeze, targetRef periodId, reversible)", async () => {
    const store = makeStore();
    await handleFreeze(deps(store), { periodId: "p1", reason: "  early finalize  " });
    expect(store.freeze).toHaveBeenCalledWith({
      periodId: "p1",
      now: NOW,
      audit: expect.objectContaining({
        leagueId: "lg1",
        actorUserId: "user_c",
        actionType: "period_freeze",
        summary: "Period frozen: Matchday 1",
        reason: "early finalize",
        targetRef: { periodId: "p1" },
        reversible: true,
      }),
    });
  });

  it("409 already_frozen when the store loses the write race (conditional update matched 0 rows)", async () => {
    const store = makeStore({ freeze: vi.fn(async () => null) });
    const res = await handleFreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("already_frozen");
  });
});

// ── unfreeze ────────────────────────────────────────────────────────────────────────────────────

describe("handleUnfreeze", () => {
  const FROZEN = () => settledPeriod({ frozenAt: new Date("2026-07-01T00:00:00Z") });

  it("401 / 403 before any store read", async () => {
    const store = makeStore();
    const noSession = await handleUnfreeze(deps(store, { kind: "no-session" }), {
      periodId: "p1",
      reason: "r",
    });
    expect(noSession.status).toBe(401);
    const member = await handleUnfreeze(deps(store, NON_COMMISH), { periodId: "p1", reason: "r" });
    expect(member.status).toBe(403);
    expect(store.getPeriod).not.toHaveBeenCalled();
  });

  it("400 reason_required — an unfreeze must carry a reason", async () => {
    const store = makeStore({ getPeriod: vi.fn(async () => FROZEN()) });
    const res = await handleUnfreeze(deps(store), { periodId: "p1", reason: "" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "reason_required" });
    expect(store.unfreeze).not.toHaveBeenCalled();
  });

  it("404 invalid_period for unknown or cross-league periods", async () => {
    const unknown = makeStore({ getPeriod: vi.fn(async () => null) });
    expect((await handleUnfreeze(deps(unknown), { periodId: "p", reason: "r" })).status).toBe(404);
    const crossLeague = makeStore({
      getPeriod: vi.fn(async () => settledPeriod({ leagueId: "other", frozenAt: NOW })),
    });
    const res = await handleUnfreeze(deps(crossLeague), { periodId: "p", reason: "r" });
    expect(res.status).toBe(404);
    expect(crossLeague.unfreeze).not.toHaveBeenCalled();
  });

  it("409 not_frozen when the period is not frozen (typed no-op — no write, no audit row)", async () => {
    const store = makeStore(); // default period is unfrozen
    const res = await handleUnfreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not_frozen");
    expect(store.unfreeze).not.toHaveBeenCalled();
  });

  it("unfreezes: 200 with pendingDirty count + the re-freeze warning", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () => FROZEN()),
      countPendingDirty: vi.fn(async () => 3),
    });
    const res = await handleUnfreeze(deps(store), { periodId: "p1", reason: "late corrections" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      auditId: "audit_u",
      pendingDirty: 3,
      refreezeWarning: UNFREEZE_REFREEZE_WARNING,
    });
  });

  it("passes the atomic write+audit payload (period_unfreeze, pendingDirty in detail, reversible)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () => FROZEN()),
      countPendingDirty: vi.fn(async () => 2),
    });
    await handleUnfreeze(deps(store), { periodId: "p1", reason: "restate MD1" });
    expect(store.unfreeze).toHaveBeenCalledWith({
      periodId: "p1",
      audit: expect.objectContaining({
        leagueId: "lg1",
        actorUserId: "user_c",
        actionType: "period_unfreeze",
        summary: "Period unfrozen: Matchday 1",
        detail: expect.stringContaining("2 pending"),
        reason: "restate MD1",
        targetRef: { periodId: "p1" },
        reversible: true,
      }),
    });
  });

  it("409 not_frozen when the store loses the write race (conditional update matched 0 rows)", async () => {
    const store = makeStore({
      getPeriod: vi.fn(async () => FROZEN()),
      unfreeze: vi.fn(async () => null),
    });
    const res = await handleUnfreeze(deps(store), { periodId: "p1", reason: "r" });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not_frozen");
  });
});
