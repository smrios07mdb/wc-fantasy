import { describe, it, expect } from "vitest";
import { MemoryDraftStore } from "@app/draft";
import type { SessionManagerOutcome } from "@app/auth";
import { handleForcePick, type ForcePickHandlerDeps } from "./handleForcePick";

const NOW = new Date("2026-06-09T10:00:00Z");

const commissionerOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr-comm",
    userId: "uid-comm",
    email: "comm@example.com",
    isCommissioner: true,
    displayName: "Commissioner",
  },
  isCommissioner: true,
};

const memberOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: {
    id: "mgr-alice",
    userId: "uid-alice",
    email: "alice@example.com",
    isCommissioner: false,
    displayName: "Alice",
  },
  isCommissioner: false,
};

function activeStore(): MemoryDraftStore {
  const store = new MemoryDraftStore();
  store.seedDraft({
    draftId: "d1",
    leagueId: "L1",
    orderedManagerIds: ["mgr-comm", "mgr-alice"],
    draftPickSeconds: 90,
    status: "active",
    currentPickNo: 1,
    currentManagerId: "mgr-comm",
    pickDeadlineAt: null,
    timerEnabled: false,
  });
  store.seedPlayer("p1", "MID");
  return store;
}

function deps(
  store: MemoryDraftStore,
  outcome: SessionManagerOutcome,
  hasActiveDraft = true,
): ForcePickHandlerDeps {
  return {
    resolveManager: () => Promise.resolve(outcome),
    store,
    findActiveDraft: () => Promise.resolve(hasActiveDraft ? { id: "d1" } : null),
    now: NOW,
  };
}

describe("handleForcePick — commissioner gate + forceAutopick delegation", () => {
  it("401 when there is no session", async () => {
    const res = await handleForcePick(deps(activeStore(), { kind: "no-session" }));
    expect(res.status).toBe(401);
  });

  it("403 when the session manager is not the commissioner", async () => {
    const res = await handleForcePick(deps(activeStore(), memberOutcome));
    expect(res.status).toBe(403);
  });

  it("409 when there is no active draft", async () => {
    const res = await handleForcePick(deps(activeStore(), commissionerOutcome, false));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "no_active_draft" });
  });

  it("200 { acted: true } when draft is active and a player is available", async () => {
    const res = await handleForcePick(deps(activeStore(), commissionerOutcome));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ acted: true });
  });

  it("200 { acted: false, reason: 'no-eligible-player' } on stall — not an HTTP error", async () => {
    const store = new MemoryDraftStore();
    store.seedDraft({
      draftId: "d1",
      leagueId: "L1",
      orderedManagerIds: ["mgr-comm", "mgr-alice"],
      draftPickSeconds: 90,
      status: "active",
      currentPickNo: 1,
      currentManagerId: "mgr-comm",
      pickDeadlineAt: null,
      timerEnabled: false,
    });
    // No players seeded — pool is empty.
    const res = await handleForcePick(deps(store, commissionerOutcome));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ acted: false, reason: "no-eligible-player" });
  });
});
