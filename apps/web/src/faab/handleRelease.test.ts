import { describe, it, expect } from "vitest";
import { MemoryFaabReleaseStore } from "@app/faab";
import type { SessionManagerOutcome } from "@app/auth";
import type { Position } from "@app/shared";
import { handleRelease } from "./handleRelease";

/**
 * The gated drop-only release route (DECISIONS §D trim-down). Identity FIRST (the bid-route template),
 * then the D4 participant gate, the playoff-phase gate, and the pure `validateRelease` — including the
 * unfillable confirm round-trip. Exercised against the in-memory release store double.
 */
const NOW = new Date("2026-06-20T08:00:00Z");

const okOutcome: SessionManagerOutcome = {
  kind: "ok",
  manager: { id: "A", userId: "uid-a", email: "a@x.com", isCommissioner: false, displayName: "A" },
  isCommissioner: false,
};
const noSession: SessionManagerOutcome = { kind: "no-session" };

/** Build a roster of (position → count) with ids like "DEF1". */
function roster(
  spec: Partial<Record<Position, number>>,
): { playerId: string; position: Position }[] {
  const out: { playerId: string; position: Position }[] = [];
  for (const [pos, n] of Object.entries(spec) as [Position, number][]) {
    for (let i = 1; i <= n; i++) out.push({ playerId: `${pos}${i}`, position: pos });
  }
  return out;
}

function store(over: Partial<Parameters<typeof makeMgr>[0]> = {}) {
  return new MemoryFaabReleaseStore({ managers: [makeMgr(over)] });
}
function makeMgr(
  over: {
    roster?: { playerId: string; position: Position }[];
    rosterCap?: number;
    lockedPlayerIds?: string[];
    isPlayoffPhase?: boolean;
    isPlayoffParticipant?: boolean;
  } = {},
) {
  return {
    managerId: "A",
    leagueId: "L",
    roster: over.roster ?? roster({ GK: 1, DEF: 3, MID: 3, FWD: 3 }), // 10 players
    rosterCap: over.rosterCap ?? 9,
    lockedPlayerIds: over.lockedPlayerIds,
    isPlayoffPhase: over.isPlayoffPhase ?? true,
    isPlayoffParticipant: over.isPlayoffParticipant ?? true,
    currentPeriodId: "R32",
  };
}

const deps = (
  s: MemoryFaabReleaseStore,
  resolve: () => Promise<SessionManagerOutcome> = async () => okOutcome,
) => ({
  resolveManager: resolve,
  store: s,
  now: NOW,
});

describe("handleRelease", () => {
  it("releases down to the cap and drops the named player (200)", async () => {
    const s = store();
    const res = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["FWD3"],
      confirmedUnfillable: false,
    });
    expect(res.status).toBe(200);
    expect(s.rosterOf("A")).not.toContain("FWD3");
    expect(s.rosterOf("A")).toHaveLength(9);
  });

  it("401 with no session — never touches the store", async () => {
    const s = store();
    const res = await handleRelease(
      deps(s, async () => noSession),
      {
        managerId: "A",
        dropIds: ["FWD3"],
        confirmedUnfillable: false,
      },
    );
    expect(res.status).toBe(401);
    expect(s.rosterOf("A")).toHaveLength(10);
  });

  it("D4: a playoff non-participant is blocked (409 not-participant) without dropping", async () => {
    const s = store({ isPlayoffParticipant: false });
    const res = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["FWD3"],
      confirmedUnfillable: false,
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("not-participant");
    expect(s.rosterOf("A")).toHaveLength(10);
  });

  it("group phase: release is not allowed (409 release-not-allowed)", async () => {
    const s = store({ isPlayoffPhase: false, rosterCap: 15 });
    const res = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["FWD3"],
      confirmedUnfillable: false,
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("release-not-allowed");
  });

  it("hard-blocks dropping below the 7-starter floor (409 release-below-floor)", async () => {
    const s = store();
    const res = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["GK1", "DEF1", "DEF2", "DEF3"], // 10 → 6
      confirmedUnfillable: false,
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toBe("release-below-floor");
  });

  it("unfillable 7–9: 409 release-unfillable + needsConfirm, then 200 once confirmed", async () => {
    // {GK1, DEF1, MID1-5, FWD1-3} = 10; drop a FWD → {GK1, DEF1, MID5, FWD2} = 9, DEF too thin.
    const s = store({ roster: roster({ GK: 1, DEF: 1, MID: 5, FWD: 3 }) });
    const first = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["FWD3"],
      confirmedUnfillable: false,
    });
    expect(first.status).toBe(409);
    expect(first.body).toMatchObject({ error: "release-unfillable", needsConfirm: true });
    expect(s.rosterOf("A")).toHaveLength(10); // nothing dropped yet

    const second = await handleRelease(deps(s), {
      managerId: "A",
      dropIds: ["FWD3"],
      confirmedUnfillable: true,
    });
    expect(second.status).toBe(200);
    expect(s.rosterOf("A")).toHaveLength(9);
  });
});
