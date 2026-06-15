/**
 * `commish:trim` orchestrator (DECISIONS §D trim-down). The playoff force-trim backstop reuses the SAME
 * `@app/faab` release primitive the manager route uses (validateRelease + releaseRoster), so it keeps
 * ownership / the 7-floor / the cap / lock-on-play; the only relaxations are flag-gated (--allow-locked-slot
 * + the unfillable auto-confirm on --apply). Exercised against the in-memory release store double.
 */
import { describe, it, expect, vi } from "vitest";
import { MemoryFaabReleaseStore } from "@app/faab";
import type { Position } from "@app/shared";
import { runTrimOverride, runTrimReport } from "./trim";

const COMMISH = { email: "smrios07@gmail.com", isCommissioner: false };
const RANDO = { email: "rando@example.com", isCommissioner: false };
const NOW = new Date("2026-06-20T08:00:00Z");
const TS = NOW.toISOString();

function roster(
  spec: Partial<Record<Position, number>>,
): { playerId: string; position: Position }[] {
  const out: { playerId: string; position: Position }[] = [];
  for (const [pos, n] of Object.entries(spec) as [Position, number][]) {
    for (let i = 1; i <= n; i++) out.push({ playerId: `${pos}${i}`, position: pos });
  }
  return out;
}

function store(
  over: {
    roster?: { playerId: string; position: Position }[];
    rosterCap?: number;
    lockedPlayerIds?: string[];
    isPlayoffPhase?: boolean;
  } = {},
) {
  return new MemoryFaabReleaseStore({
    managers: [
      {
        managerId: "M",
        leagueId: "L",
        roster: over.roster ?? roster({ GK: 1, DEF: 3, MID: 3, FWD: 3 }), // 10
        rosterCap: over.rosterCap ?? 9,
        lockedPlayerIds: over.lockedPlayerIds,
        isPlayoffPhase: over.isPlayoffPhase ?? true,
        isPlayoffParticipant: true,
        currentPeriodId: "R32",
      },
    ],
  });
}

const deps = (s: MemoryFaabReleaseStore) => ({ now: NOW, store: s, log: vi.fn() });
const baseInput = (over: Partial<Parameters<typeof runTrimOverride>[1]> = {}) => ({
  actor: COMMISH,
  managerId: "M",
  teamLabel: "Los Dragones",
  selection: { kind: "drop" as const, ids: ["FWD3"] },
  nameOf: { FWD3: "Forward Three" },
  reason: "they never trimmed",
  apply: false,
  allowLocked: false,
  timestamp: TS,
  ...over,
});

describe("runTrimOverride — guards", () => {
  it("refuses a non-commissioner actor", async () => {
    const res = await runTrimOverride(deps(store()), baseInput({ actor: RANDO }));
    expect(res.status).toBe("refused");
  });

  it("refuses an empty reason", async () => {
    const res = await runTrimOverride(deps(store()), baseInput({ reason: "  " }));
    expect(res.status).toBe("refused");
  });

  it("refuses outside the playoff phase", async () => {
    const res = await runTrimOverride(
      deps(store({ isPlayoffPhase: false, rosterCap: 15 })),
      baseInput(),
    );
    expect(res.status).toBe("refused");
    expect(res.status === "refused" && res.reason).toMatch(/playoff phase/i);
  });
});

describe("runTrimOverride — dry-run vs apply", () => {
  it("dry-run plans without mutating", async () => {
    const s = store();
    const res = await runTrimOverride(deps(s), baseInput({ apply: false }));
    expect(res.status).toBe("planned");
    expect(res.status === "planned" && res.plan.dropNames).toEqual(["Forward Three"]);
    expect(res.status === "planned" && res.plan.after).toBe(9);
    expect(s.rosterOf("M")).toHaveLength(10); // unchanged
  });

  it("applies the cut, drops the player, and writes a trim audit line", async () => {
    const s = store();
    const res = await runTrimOverride(deps(s), baseInput({ apply: true }));
    expect(res.status).toBe("applied");
    expect(s.rosterOf("M")).not.toContain("FWD3");
    expect(s.rosterOf("M")).toHaveLength(9);
    if (res.status === "applied") {
      expect(res.audit).toContain('"command":"trim"');
      expect(res.audit).toContain('"released":["Forward Three"]');
      expect(res.audit).toContain('"lockOverride":false');
    }
  });
});

describe("runTrimOverride — --keep resolution", () => {
  it("drops the complement of the keep set", async () => {
    // 10-man squad; keep a legal 9 → drop the one omitted.
    const keep = ["GK1", "DEF1", "DEF2", "DEF3", "MID1", "MID2", "MID3", "FWD1", "FWD2"];
    const s = store();
    const res = await runTrimOverride(
      deps(s),
      baseInput({ apply: true, selection: { kind: "keep", ids: keep } }),
    );
    expect(res.status).toBe("applied");
    expect(s.rosterOf("M").sort()).toEqual([...keep].sort());
    expect(s.rosterOf("M")).not.toContain("FWD3");
  });
});

describe("runTrimOverride — fillability + locks", () => {
  it("hard-blocks dropping below the 7-floor", async () => {
    const res = await runTrimOverride(
      deps(store()),
      baseInput({ selection: { kind: "drop", ids: ["GK1", "DEF1", "DEF2", "DEF3"] } }), // 10 → 6
    );
    expect(res.status).toBe("refused");
    expect(res.status === "refused" && res.reason).toContain("release-below-floor");
  });

  it("flags an unfillable end state in the plan but still applies on --apply", async () => {
    const s = store({ roster: roster({ GK: 1, DEF: 1, MID: 5, FWD: 3 }) }); // 10
    const plan = await runTrimOverride(
      deps(s),
      baseInput({ selection: { kind: "drop", ids: ["FWD3"] } }),
    );
    expect(plan.status === "planned" && plan.plan.unfillable).toBe(true);

    const applied = await runTrimOverride(
      deps(s),
      baseInput({ apply: true, selection: { kind: "drop", ids: ["FWD3"] } }),
    );
    expect(applied.status).toBe("applied");
    expect(s.rosterOf("M")).toHaveLength(9);
  });

  it("refuses a locked drop by default, but releases it under --allow-locked-slot", async () => {
    const locked = ["FWD3"];
    const refused = await runTrimOverride(
      deps(store({ lockedPlayerIds: locked })),
      baseInput({ apply: true, allowLocked: false }),
    );
    expect(refused.status).toBe("refused");
    expect(refused.status === "refused" && refused.reason).toContain("release-locked");

    const s = store({ lockedPlayerIds: locked });
    const applied = await runTrimOverride(deps(s), baseInput({ apply: true, allowLocked: true }));
    expect(applied.status).toBe("applied");
    expect(s.rosterOf("M")).not.toContain("FWD3");
    if (applied.status === "applied") expect(applied.audit).toContain('"lockOverride":true');
  });
});

describe("runTrimReport", () => {
  it("lists survivors over cap (commissioner only)", async () => {
    const s = store(); // M has 10 > cap 9
    const res = await runTrimReport({ store: s }, { actor: COMMISH, leagueId: "L" });
    expect(res.status).toBe("report");
    expect(res.status === "report" && res.survivors).toEqual([
      { managerId: "M", rosterCount: 10, rosterCap: 9 },
    ]);
  });

  it("refuses a non-commissioner", async () => {
    const res = await runTrimReport({ store: store() }, { actor: RANDO, leagueId: "L" });
    expect(res.status).toBe("refused");
  });
});
