import { describe, it, expect, vi } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import { handleQueue, type QueueHandlerDeps } from "./handleQueue";

const managerOutcome: SessionManagerOutcome = {
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

function deps(overrides: Partial<QueueHandlerDeps> = {}): QueueHandlerDeps {
  return {
    resolveManager: () => Promise.resolve(managerOutcome),
    getDraftStatus: () => Promise.resolve("active"),
    playerIdsExist: () => Promise.resolve(true),
    replaceQueue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("handleQueue — auth gate fires before any DB access", () => {
  it("401 when there is no session", async () => {
    const replace = vi.fn();
    const res = await handleQueue(
      deps({
        resolveManager: () => Promise.resolve({ kind: "no-session" }),
        replaceQueue: replace,
      }),
      { playerIds: ["p1"] },
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "no_session" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("403 when the email is not allowlisted", async () => {
    const replace = vi.fn();
    const res = await handleQueue(
      deps({
        resolveManager: () => Promise.resolve({ kind: "not-allowlisted", email: "x@y.com" }),
        replaceQueue: replace,
      }),
      { playerIds: ["p1"] },
    );
    expect(res.status).toBe(403);
    expect(replace).not.toHaveBeenCalled();
  });

  it("403 when no manager row is linked", async () => {
    const replace = vi.fn();
    const res = await handleQueue(
      deps({
        resolveManager: () => Promise.resolve({ kind: "no-manager", userId: "uid-x" }),
        replaceQueue: replace,
      }),
      { playerIds: ["p1"] },
    );
    expect(res.status).toBe(403);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("handleQueue — domain guards", () => {
  it("400 DRAFT_COMPLETE when draft status is complete", async () => {
    const replace = vi.fn();
    const res = await handleQueue(
      deps({ getDraftStatus: () => Promise.resolve("complete"), replaceQueue: replace }),
      { playerIds: ["p1"] },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "DRAFT_COMPLETE" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("400 INVALID_PLAYER when a playerId does not exist", async () => {
    const replace = vi.fn();
    const res = await handleQueue(
      deps({ playerIdsExist: () => Promise.resolve(false), replaceQueue: replace }),
      { playerIds: ["bad-id"] },
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "INVALID_PLAYER" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("handleQueue — success paths", () => {
  it("200 with the saved order and calls replaceQueue with the manager id", async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const res = await handleQueue(deps({ replaceQueue: replace }), { playerIds: ["p1", "p2"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ queue: ["p1", "p2"] });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("mgr-alice", ["p1", "p2"]);
  });

  it("skips playerIdsExist and succeeds for an empty queue", async () => {
    const playerIdsExist = vi.fn();
    const replace = vi.fn().mockResolvedValue(undefined);
    const res = await handleQueue(deps({ playerIdsExist, replaceQueue: replace }), {
      playerIds: [],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ queue: [] });
    expect(playerIdsExist).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("mgr-alice", []);
  });

  it("allows a null (no draft) status — queue can be set before draft starts", async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const res = await handleQueue(
      deps({ getDraftStatus: () => Promise.resolve(null), replaceQueue: replace }),
      { playerIds: ["p1"] },
    );
    expect(res.status).toBe(200);
    expect(replace).toHaveBeenCalled();
  });
});
