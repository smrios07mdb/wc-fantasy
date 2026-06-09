import { describe, it, expect, vi } from "vitest";
import type { SessionManagerOutcome } from "@app/auth";
import {
  handleClockUpdate,
  parseClockSeconds,
  type ClockUpdateHandlerDeps,
  type DraftClockRow,
} from "./handleClockUpdate";

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

function makeDeps(
  outcome: SessionManagerOutcome,
  draft: DraftClockRow | null = null,
): ClockUpdateHandlerDeps & {
  updateLeagueClock: ReturnType<typeof vi.fn>;
  updateDraftDeadline: ReturnType<typeof vi.fn>;
} {
  const updateLeagueClock = vi.fn().mockResolvedValue(undefined);
  const updateDraftDeadline = vi.fn().mockResolvedValue(undefined);
  return {
    resolveManager: () => Promise.resolve(outcome),
    updateLeagueClock,
    findDraft: () => Promise.resolve(draft),
    updateDraftDeadline,
    now: NOW,
  };
}

describe("parseClockSeconds", () => {
  it("returns null for non-object body", () => {
    expect(parseClockSeconds(null)).toBeNull();
    expect(parseClockSeconds("60")).toBeNull();
  });
  it("returns null when seconds is missing or not an integer", () => {
    expect(parseClockSeconds({})).toBeNull();
    expect(parseClockSeconds({ seconds: 60.5 })).toBeNull();
    expect(parseClockSeconds({ seconds: "60" })).toBeNull();
  });
  it("returns null when seconds is below 15 or above 600", () => {
    expect(parseClockSeconds({ seconds: 14 })).toBeNull();
    expect(parseClockSeconds({ seconds: 601 })).toBeNull();
  });
  it("returns the integer when valid", () => {
    expect(parseClockSeconds({ seconds: 15 })).toBe(15);
    expect(parseClockSeconds({ seconds: 90 })).toBe(90);
    expect(parseClockSeconds({ seconds: 600 })).toBe(600);
  });
});

describe("handleClockUpdate — validation + commissioner gate + update logic", () => {
  it("400 when seconds is below minimum (14)", async () => {
    const deps = makeDeps(commissionerOutcome);
    const res = await handleClockUpdate({ seconds: 14 }, deps);
    expect(res.status).toBe(400);
    expect(deps.updateLeagueClock).not.toHaveBeenCalled();
  });

  it("400 when seconds is above maximum (601)", async () => {
    const deps = makeDeps(commissionerOutcome);
    const res = await handleClockUpdate({ seconds: 601 }, deps);
    expect(res.status).toBe(400);
  });

  it("401 when there is no session", async () => {
    const deps = makeDeps({ kind: "no-session" });
    const res = await handleClockUpdate({ seconds: 60 }, deps);
    expect(res.status).toBe(401);
    expect(deps.updateLeagueClock).not.toHaveBeenCalled();
  });

  it("403 when the session manager is not the commissioner", async () => {
    const deps = makeDeps(memberOutcome);
    const res = await handleClockUpdate({ seconds: 60 }, deps);
    expect(res.status).toBe(403);
    expect(deps.updateLeagueClock).not.toHaveBeenCalled();
  });

  it("200 — timer off: updates league only, no deadline reset", async () => {
    const draft: DraftClockRow = { id: "d1", status: "active", timerEnabled: false };
    const deps = makeDeps(commissionerOutcome, draft);

    const res = await handleClockUpdate({ seconds: 120 }, deps);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ draftPickSeconds: 120 });
    expect(deps.updateLeagueClock).toHaveBeenCalledWith(120);
    expect(deps.updateDraftDeadline).not.toHaveBeenCalled();
  });

  it("200 — timer on + active draft: updates league AND resets pick_deadline_at", async () => {
    const draft: DraftClockRow = { id: "d1", status: "active", timerEnabled: true };
    const deps = makeDeps(commissionerOutcome, draft);

    const res = await handleClockUpdate({ seconds: 90 }, deps);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ draftPickSeconds: 90 });
    expect(deps.updateLeagueClock).toHaveBeenCalledWith(90);
    const expectedDeadline = new Date(NOW.getTime() + 90 * 1000);
    expect(deps.updateDraftDeadline).toHaveBeenCalledWith("d1", expectedDeadline);
  });

  it("200 — no draft row: updates league only (pre-draft clock change)", async () => {
    const deps = makeDeps(commissionerOutcome, null);

    const res = await handleClockUpdate({ seconds: 45 }, deps);

    expect(res.status).toBe(200);
    expect(deps.updateLeagueClock).toHaveBeenCalledWith(45);
    expect(deps.updateDraftDeadline).not.toHaveBeenCalled();
  });
});
