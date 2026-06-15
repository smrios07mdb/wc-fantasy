import { describe, it, expect } from "vitest";
import { runRoundAdvance, type AdvanceDeps, type AdvanceInput } from "./advance";
import { MemoryPlayoffAdvanceStore, type MemoryAdvanceSeed } from "./advanceStore";

/**
 * The `commish:advance` orchestrator (Theme C). It runs against the in-memory {@link
 * MemoryPlayoffAdvanceStore} (the production Prisma adapter is covered by `tsc` + the gated
 * `advanceStore.integration.test.ts`, mirroring the transition convention). We assert: the dry-run mutates
 * nothing; --apply flips the cut + writes the audit; the champion lands on the final round; a re-run is a
 * no-op; the frozen / ordering / commish / reason guards refuse; and a boundary tie is surfaced in dry-run
 * and resolved only by an explicit --break-tie (never an auto-cut).
 */
const NOW = new Date("2026-07-02T18:00:00Z");
const TS = NOW.toISOString();
const FROZEN = new Date("2026-07-01T12:00:00Z");
const COMMISH = { email: "smrios07@gmail.com", isCommissioner: true } as const;
const RANDO = { email: "rando@x.com", isCommissioner: false } as const;

const deps = (s: MemoryPlayoffAdvanceStore): AdvanceDeps & { logs: string[] } => {
  const logs: string[] = [];
  return { now: NOW, store: s, log: (l) => logs.push(l), logs };
};

const input = (over: Partial<AdvanceInput> = {}): AdvanceInput => ({
  actor: COMMISH,
  leagueId: "L1",
  roundLabel: "R32",
  reason: "applying the round cut",
  breakTie: null,
  allowIncomplete: false,
  apply: false,
  nameOf: { m1: "Team 1", m2: "Team 2", m3: "Team 3", m4: "Team 4" },
  timestamp: TS,
  ...over,
});

/** R32, cut 2, frozen; 4 alive with a clean (no-tie) ordering: m1 & m2 are the bottom two. */
function cleanR32(over: Partial<MemoryAdvanceSeed> = {}): MemoryPlayoffAdvanceStore {
  return new MemoryPlayoffAdvanceStore({
    rounds: [{ label: "R32", cutCount: 2, frozenAt: FROZEN }],
    entries: [{ managerId: "m1" }, { managerId: "m2" }, { managerId: "m3" }, { managerId: "m4" }],
    roundScores: { R32: { m1: 5, m2: 9, m3: 20, m4: 30 } },
    cumulativeTotals: { m1: 100, m2: 90, m3: 200, m4: 300 },
    ...over,
  });
}

// ── dry-run / apply / idempotency ───────────────────────────────────────────────────────
describe("runRoundAdvance — dry-run & apply", () => {
  it("DRY-RUN (default) returns the determined cut and mutates nothing", async () => {
    const s = cleanR32();
    const d = deps(s);
    const res = await runRoundAdvance(d, input());
    expect(res.status).toBe("planned");
    if (res.status === "planned") {
      expect(res.plan.resolution).toMatchObject({ kind: "determined", eliminated: ["m1", "m2"] });
      expect(res.plan.frozen).toBe(true);
    }
    expect(s.applyCount).toBe(0);
    expect(s.entries.get("m1")!.status).toBe("alive");
  });

  it("--apply flips the cut managers alive → eliminated and writes one audit line per cut", async () => {
    const s = cleanR32();
    const d = deps(s);
    const res = await runRoundAdvance(d, input({ apply: true }));
    expect(res.status).toBe("applied");
    expect(s.entries.get("m1")!.status).toBe("eliminated");
    expect(s.entries.get("m1")!.eliminatedRound).toBe("R32");
    expect(s.entries.get("m1")!.eliminatedAt).toEqual(NOW);
    expect(s.entries.get("m2")!.status).toBe("eliminated");
    expect(s.entries.get("m3")!.status).toBe("alive");
    if (res.status === "applied") {
      expect(res.audits).toHaveLength(2); // one per eliminated manager (no champion this round)
      const rec = JSON.parse(res.audits[0]!.replace(/^commish-override /, ""));
      expect(rec).toMatchObject({
        command: "advance",
        action: "eliminated",
        round: "R32",
        tieAdjudicated: false,
      });
    }
  });

  it("is idempotent — a round already cut is a no-op skip", async () => {
    const s = cleanR32({
      entries: [
        { managerId: "m1", status: "eliminated", eliminatedRound: "R32" },
        { managerId: "m2", status: "eliminated", eliminatedRound: "R32" },
        { managerId: "m3" },
        { managerId: "m4" },
      ],
    });
    const res = await runRoundAdvance(deps(s), input({ apply: true }));
    expect(res.status).toBe("skipped");
    expect(s.applyCount).toBe(0);
  });
});

// ── champion (final round) ────────────────────────────────────────────────────────────
describe("runRoundAdvance — champion", () => {
  function finalTwo(): MemoryPlayoffAdvanceStore {
    return new MemoryPlayoffAdvanceStore({
      rounds: [
        { label: "R32", cutCount: 1, frozenAt: FROZEN },
        { label: "R16", cutCount: 1, frozenAt: FROZEN },
        { label: "QF", cutCount: 1, frozenAt: FROZEN },
        { label: "SF", cutCount: 1, frozenAt: FROZEN },
        { label: "Final", cutCount: 1, frozenAt: FROZEN },
      ],
      // Prior rounds already cut so the ordering guard passes; two survivors reach the Final.
      entries: [
        { managerId: "x1", status: "eliminated", eliminatedRound: "R32" },
        { managerId: "x2", status: "eliminated", eliminatedRound: "R16" },
        { managerId: "x3", status: "eliminated", eliminatedRound: "QF" },
        { managerId: "x4", status: "eliminated", eliminatedRound: "SF" },
        { managerId: "m1" },
        { managerId: "m2" },
      ],
      roundScores: { Final: { m1: 10, m2: 40 } },
      cumulativeTotals: { m1: 500, m2: 600 },
    });
  }

  it("flips the lone survivor to champion on the final round", async () => {
    const s = finalTwo();
    const res = await runRoundAdvance(deps(s), input({ roundLabel: "Final", apply: true }));
    expect(res.status).toBe("applied");
    expect(s.entries.get("m1")!.status).toBe("eliminated");
    expect(s.entries.get("m2")!.status).toBe("champion");
    if (res.status === "applied") {
      expect(res.audits.some((a) => a.includes('"action":"champion"'))).toBe(true);
    }
  });

  it("refuses a lone-survivor result on a NON-final round (schedule inconsistency)", async () => {
    // Only two alive entering R32, cut 1 → leaves one survivor, but R32 is not the final round.
    const s = new MemoryPlayoffAdvanceStore({
      rounds: [{ label: "R32", cutCount: 1, frozenAt: FROZEN }],
      entries: [{ managerId: "m1" }, { managerId: "m2" }],
      roundScores: { R32: { m1: 5, m2: 50 } },
    });
    const res = await runRoundAdvance(deps(s), input({ apply: true }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/non-final round/);
  });

  it("refuses a final round that does not resolve to a single champion", async () => {
    const s = new MemoryPlayoffAdvanceStore({
      rounds: [
        { label: "R32", cutCount: 1, frozenAt: FROZEN },
        { label: "R16", cutCount: 1, frozenAt: FROZEN },
        { label: "QF", cutCount: 1, frozenAt: FROZEN },
        { label: "SF", cutCount: 1, frozenAt: FROZEN },
        { label: "Final", cutCount: 1, frozenAt: FROZEN },
      ],
      // Three reach the "Final" (prior rounds applied) → cut 1 leaves 2 → not a single champion.
      entries: [
        { managerId: "x1", status: "eliminated", eliminatedRound: "R32" },
        { managerId: "x2", status: "eliminated", eliminatedRound: "R16" },
        { managerId: "x3", status: "eliminated", eliminatedRound: "QF" },
        { managerId: "x4", status: "eliminated", eliminatedRound: "SF" },
        { managerId: "m1" },
        { managerId: "m2" },
        { managerId: "m3" },
      ],
      roundScores: { Final: { m1: 5, m2: 10, m3: 50 } },
    });
    const res = await runRoundAdvance(deps(s), input({ roundLabel: "Final", apply: true }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/single champion/);
  });
});

// ── preconditions / guards ──────────────────────────────────────────────────────────────
describe("runRoundAdvance — guards", () => {
  it("refuses a non-commissioner", async () => {
    const res = await runRoundAdvance(deps(cleanR32()), input({ actor: RANDO, apply: true }));
    expect(res.status).toBe("refused");
  });

  it("refuses an empty reason", async () => {
    const res = await runRoundAdvance(deps(cleanR32()), input({ reason: "   " }));
    expect(res.status).toBe("refused");
  });

  it("refuses an unknown round label", async () => {
    const res = await runRoundAdvance(deps(cleanR32()), input({ roundLabel: "R8" }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/unknown round/);
  });

  it("refuses when the round has no period", async () => {
    const s = new MemoryPlayoffAdvanceStore({
      rounds: [{ label: "R16", cutCount: 2, frozenAt: FROZEN }],
      entries: [],
    });
    const res = await runRoundAdvance(deps(s), input({ roundLabel: "R32" }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/no knockout round/);
  });

  it("refuses when cut_count is not seeded", async () => {
    const res = await runRoundAdvance(
      deps(cleanR32({ rounds: [{ label: "R32", cutCount: null, frozenAt: FROZEN }] })),
      input(),
    );
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/cut_count/);
  });

  it("refuses an out-of-order round (an earlier round not yet cut)", async () => {
    const s = new MemoryPlayoffAdvanceStore({
      rounds: [{ label: "QF", cutCount: 1, frozenAt: FROZEN }],
      entries: [{ managerId: "m1" }, { managerId: "m2" }],
      roundScores: { QF: { m1: 5, m2: 50 } },
    });
    const res = await runRoundAdvance(deps(s), input({ roundLabel: "QF", apply: true }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/earlier round.*R32, R16/);
  });

  it("refuses an unfrozen round without --allow-incomplete", async () => {
    const s = cleanR32({ rounds: [{ label: "R32", cutCount: 2, frozenAt: null }] });
    const res = await runRoundAdvance(deps(s), input({ apply: true }));
    expect(res.status).toBe("refused");
    if (res.status === "refused") expect(res.reason).toMatch(/not frozen/);
    expect(s.applyCount).toBe(0);
  });

  it("--allow-incomplete applies an unfrozen round (the irreversible-op override)", async () => {
    const s = cleanR32({ rounds: [{ label: "R32", cutCount: 2, frozenAt: null }] });
    const res = await runRoundAdvance(deps(s), input({ apply: true, allowIncomplete: true }));
    expect(res.status).toBe("applied");
    expect(s.entries.get("m1")!.status).toBe("eliminated");
  });
});

// ── boundary tie & --break-tie adjudication ─────────────────────────────────────────────
describe("runRoundAdvance — tie adjudication", () => {
  /** Four alive tie on round score with equal cumulative totals; cut 2 → a 4-way boundary tie. */
  function tiedR32(): MemoryPlayoffAdvanceStore {
    return new MemoryPlayoffAdvanceStore({
      rounds: [{ label: "R32", cutCount: 2, frozenAt: FROZEN }],
      entries: [{ managerId: "m1" }, { managerId: "m2" }, { managerId: "m3" }, { managerId: "m4" }],
      roundScores: { R32: { m1: 10, m2: 10, m3: 10, m4: 10 } },
      cumulativeTotals: { m1: 50, m2: 50, m3: 50, m4: 50 },
    });
  }

  it("surfaces the tie in the DRY-RUN (planned, nothing applied)", async () => {
    const s = tiedR32();
    const res = await runRoundAdvance(deps(s), input());
    expect(res.status).toBe("planned");
    if (res.status === "planned")
      expect(res.plan.resolution).toMatchObject({ kind: "needsCommissioner", cutsRemaining: 2 });
    expect(s.applyCount).toBe(0);
  });

  it("refuses --apply on an unbroken tie (never auto-cuts)", async () => {
    const s = tiedR32();
    const res = await runRoundAdvance(deps(s), input({ apply: true }));
    expect(res.status).toBe("needs-commissioner");
    expect(s.applyCount).toBe(0);
  });

  it("adjudicates --break-tie (exactly cutsRemaining of the tied set) and applies", async () => {
    const s = tiedR32();
    const res = await runRoundAdvance(deps(s), input({ apply: true, breakTie: ["m2", "m4"] }));
    expect(res.status).toBe("applied");
    expect(s.entries.get("m2")!.status).toBe("eliminated");
    expect(s.entries.get("m4")!.status).toBe("eliminated");
    expect(s.entries.get("m1")!.status).toBe("alive");
    expect(s.entries.get("m3")!.status).toBe("alive");
    if (res.status === "applied")
      expect(res.audits.every((a) => a.includes('"tieAdjudicated":true'))).toBe(true);
  });

  it("refuses a --break-tie with the wrong count", async () => {
    const res = await runRoundAdvance(deps(tiedR32()), input({ apply: true, breakTie: ["m2"] }));
    expect(res.status).toBe("refused");
  });

  it("refuses a --break-tie naming a manager outside the tied set", async () => {
    // m4 is in the tie, but here we name a non-tied id by abusing the field; any non-tied id refuses.
    const res = await runRoundAdvance(
      deps(tiedR32()),
      input({ apply: true, breakTie: ["m2", "zzz"] }),
    );
    expect(res.status).toBe("refused");
  });
});
