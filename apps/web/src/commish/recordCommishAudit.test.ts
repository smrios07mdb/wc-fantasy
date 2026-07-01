import { describe, expect, it } from "vitest";
import type { Prisma } from "@app/db";
import { recordCommishAudit } from "./recordCommishAudit";

/** A spy insert that captures the data handed to the owner client — no database touched. */
function spyInsert() {
  const calls: Prisma.CommishAuditUncheckedCreateInput[] = [];
  const insert = async (data: Prisma.CommishAuditUncheckedCreateInput) => {
    calls.push(data);
    return { id: "audit-row-1" };
  };
  return { calls, insert };
}

describe("recordCommishAudit — the commish_audit write seam", () => {
  it("maps a minimal input, applying nullable defaults and omitting targetRef", async () => {
    const { calls, insert } = spyInsert();
    const res = await recordCommishAudit(
      { leagueId: "lg1", actorUserId: "u1", actionType: "stat_correction", summary: "Corrected X" },
      insert,
    );

    expect(res).toEqual({ id: "audit-row-1" });
    const data = calls[0]!;
    expect(data.leagueId).toBe("lg1");
    expect(data.actorUserId).toBe("u1");
    expect(data.actionType).toBe("stat_correction");
    expect(data.summary).toBe("Corrected X");
    expect(data.detail).toBeNull();
    expect(data.reason).toBeNull();
    expect(data.delta).toBeNull();
    expect(data.reversible).toBe(false);
    // Json? column: omitted (not null) so it stays SQL NULL.
    expect("targetRef" in data).toBe(false);
  });

  it("passes targetRef through and honors explicit reversible + a null actor", async () => {
    const { calls, insert } = spyInsert();
    await recordCommishAudit(
      {
        leagueId: "lg1",
        actorUserId: null, // system row
        actionType: "field_locked",
        summary: "Locked playoff field",
        detail: "8-team field",
        reason: "League vote",
        delta: "+0",
        reversible: true,
        targetRef: { periodId: "p9" },
      },
      insert,
    );

    const data = calls[0]!;
    expect(data.actorUserId).toBeNull();
    expect(data.reversible).toBe(true);
    expect(data.detail).toBe("8-team field");
    expect(data.reason).toBe("League vote");
    expect(data.targetRef).toEqual({ periodId: "p9" });
  });
});
