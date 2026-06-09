import { describe, it, expect } from "vitest";
import { MemoryDraftStore } from "@app/draft";
import type { SessionManagerOutcome } from "@app/auth";
import { handleStartDraft, type StartHandlerDeps } from "./handleStartDraft";

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

function pendingStore(): MemoryDraftStore {
  const store = new MemoryDraftStore();
  store.seedDraft({
    draftId: "d1",
    leagueId: "L1",
    orderedManagerIds: ["mgr-comm", "mgr-alice"],
    draftPickSeconds: 90,
    status: "pending",
  });
  store.seedPlayer("p1", "FWD");
  return store;
}

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
    pickDeadlineAt: new Date("2026-06-09T10:01:30Z"),
  });
  return store;
}

function deps(
  store: MemoryDraftStore,
  outcome: SessionManagerOutcome,
  hasDraft = true,
): StartHandlerDeps {
  return {
    resolveManager: () => Promise.resolve(outcome),
    store,
    findDraft: () =>
      Promise.resolve(
        hasDraft ? { id: "d1", status: store.draftRow("d1")?.status ?? "pending" } : null,
      ),
    now: NOW,
  };
}

describe("handleStartDraft — commissioner gate + controller delegation", () => {
  it("401 when there is no session", async () => {
    const res = await handleStartDraft(deps(pendingStore(), { kind: "no-session" }));
    expect(res.status).toBe(401);
  });

  it("403 when the session manager is not the commissioner", async () => {
    const res = await handleStartDraft(deps(pendingStore(), memberOutcome));
    expect(res.status).toBe(403);
  });

  it("409 when no draft row exists", async () => {
    const res = await handleStartDraft(deps(pendingStore(), commissionerOutcome, false));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "no_draft" });
  });

  it("200 { started: true } when draft is pending", async () => {
    const res = await handleStartDraft(deps(pendingStore(), commissionerOutcome));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ started: true });
  });

  it("200 { started: false } when draft is already active (idempotent)", async () => {
    const res = await handleStartDraft(deps(activeStore(), commissionerOutcome));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ started: false });
  });
});
