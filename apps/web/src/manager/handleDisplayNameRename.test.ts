import { describe, it, expect, vi } from "vitest";
import type { ManagerRecord, SessionManagerOutcome } from "@app/auth";
import {
  handleDisplayNameRename,
  NameTakenError,
  type RenameHandlerDeps,
} from "./handleDisplayNameRename";

const aliceManager: ManagerRecord = {
  id: "mgr-alice",
  userId: "uid-alice",
  email: "alice@example.com",
  isCommissioner: false,
  displayName: "Alice",
};

function makeDeps(
  outcome: SessionManagerOutcome,
  updateFn: RenameHandlerDeps["update"] = vi.fn().mockResolvedValue(undefined),
): { deps: RenameHandlerDeps; updateSpy: ReturnType<typeof vi.fn> } {
  const updateSpy = updateFn as ReturnType<typeof vi.fn>;
  return {
    deps: { resolveManager: () => Promise.resolve(outcome), update: updateFn },
    updateSpy,
  };
}

const okOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: aliceManager,
  isCommissioner: false,
};

describe("handleDisplayNameRename — identity gate BEFORE mutation", () => {
  it("401 + no update when there is no session", async () => {
    const { deps, updateSpy } = makeDeps({ kind: "no-session" });
    const res = await handleDisplayNameRename(deps, { name: "NewName" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "no_session" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("403 + no update when the email is not allowlisted", async () => {
    const { deps, updateSpy } = makeDeps({ kind: "not-allowlisted", email: "x@y.com" });
    const res = await handleDisplayNameRename(deps, { name: "NewName" });
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("403 + no update when no manager is linked", async () => {
    const { deps, updateSpy } = makeDeps({ kind: "no-manager", userId: "uid-alice" });
    const res = await handleDisplayNameRename(deps, { name: "NewName" });
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("handleDisplayNameRename — validation gate BEFORE mutation", () => {
  it("400 with reason 'empty' for empty string", async () => {
    const { deps, updateSpy } = makeDeps(okOutcome);
    const res = await handleDisplayNameRename(deps, { name: "" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "empty" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("400 with reason 'empty' for whitespace-only string", async () => {
    const { deps, updateSpy } = makeDeps(okOutcome);
    const res = await handleDisplayNameRename(deps, { name: "   " });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "empty" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("400 with reason 'too_long' for a 41-char name", async () => {
    const { deps, updateSpy } = makeDeps(okOutcome);
    const res = await handleDisplayNameRename(deps, { name: "A".repeat(41) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "too_long" });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("handleDisplayNameRename — happy path + unique violation", () => {
  it("200 with normalized displayName and calls update once", async () => {
    const { deps, updateSpy } = makeDeps(okOutcome);
    const res = await handleDisplayNameRename(deps, { name: "  Alice  Smith  " });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: "Alice Smith" });
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith("mgr-alice", "Alice Smith");
  });

  it("update is called with the session manager's own id (self-only)", async () => {
    const { deps, updateSpy } = makeDeps(okOutcome);
    await handleDisplayNameRename(deps, { name: "ValidName" });
    expect(updateSpy).toHaveBeenCalledWith(aliceManager.id, "ValidName");
  });

  it("409 name_taken when update throws NameTakenError", async () => {
    const throwingUpdate = vi.fn().mockRejectedValue(new NameTakenError());
    const { deps, updateSpy } = makeDeps(okOutcome, throwingUpdate);
    const res = await handleDisplayNameRename(deps, { name: "TakenName" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "name_taken" });
    expect(updateSpy).toHaveBeenCalledOnce();
  });

  it("re-throws unexpected errors from update", async () => {
    const boom = new Error("db_connection_lost");
    const { deps } = makeDeps(okOutcome, vi.fn().mockRejectedValue(boom));
    await expect(handleDisplayNameRename(deps, { name: "ValidName" })).rejects.toThrow(
      "db_connection_lost",
    );
  });
});
