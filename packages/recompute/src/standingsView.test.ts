import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildStandingsView,
  DEFAULT_PLAYOFF_FIELD_SIZE,
  type StandingsViewInput,
} from "./standingsView";
import { computeStandings, type PeriodScores } from "./standing";

/**
 * standingsView — PURE view-model for the dedicated /standings page (T10). Both tabs (Matchday +
 * Cumulative) are derived from the SAME period point-maps, reusing the locked all-play-all helpers
 * (`periodRecords` → per-period W/L/D with tie=Draw; `computeStandings` → cumulative seed). These
 * tests pin: the matchday W-then-points ranking + the T9 tie-is-a-Draw guard + joint rank, the
 * cumulative no-drift-vs-engine guarantee, the joint-rank display, `move` vs completed-only, the
 * live-period default selection, and purity.
 */

const managers = [
  { managerId: "A", displayName: "Ana" },
  { managerId: "B", displayName: "Bea" },
  { managerId: "C", displayName: "Cid" },
  { managerId: "D", displayName: "Dom" },
];

// MD1 completed: A=10, B=10 (tie at the top), C=5, D=0.
const MD1 = [
  { managerId: "A", points: 10 },
  { managerId: "B", points: 10 },
  { managerId: "C", points: 5 },
  { managerId: "D", points: 0 },
];
// MD2 completed: A=5, B=8, C=8 (B/C tie), D=3.
const MD2 = [
  { managerId: "A", points: 5 },
  { managerId: "B", points: 8 },
  { managerId: "C", points: 8 },
  { managerId: "D", points: 3 },
];
// MD3 LIVE: A=12, B=4, C=6, D=6 (C/D tie).
const MD3 = [
  { managerId: "A", points: 12 },
  { managerId: "B", points: 4 },
  { managerId: "C", points: 6 },
  { managerId: "D", points: 6 },
];

const periods = [
  { id: "md1", label: "MD1", name: "Matchday 1", live: false },
  { id: "md2", label: "MD2", name: "Matchday 2", live: false },
  { id: "md3", label: "MD3", name: "Matchday 3", live: true },
];

function baseInput(overrides: Partial<StandingsViewInput> = {}): StandingsViewInput {
  return {
    periods,
    pointsByPeriod: { md1: MD1, md2: MD2, md3: MD3 },
    managers,
    meId: "A",
    ...overrides,
  };
}

describe("buildStandingsView — matchday tab (within-period all-play-all)", () => {
  it("ranks a period by W desc then points desc", () => {
    const view = buildStandingsView(baseInput());
    // MD3: A=12 (W3), then C=6 & D=6 (W1 each, tie), then B=4 (W0).
    const md3 = view.matchday.md3!;
    expect(md3.map((r) => r.managerId)).toEqual(["A", "C", "D", "B"]);
    expect(md3[0]).toMatchObject({ managerId: "A", w: 3, l: 0, d: 0, points: 12, rank: 1 });
    expect(md3[3]).toMatchObject({ managerId: "B", w: 0, l: 3, d: 0, points: 4 });
  });

  it("records a points-tie as a Draw — NOT a loss (the T9 guard: L ≠ N−1−W)", () => {
    const view = buildStandingsView(baseInput());
    // MD1: A and B both 10 → they tie each other (D), beat C and D (W). N=4 ⇒ N−1=3.
    const md1 = view.matchday.md1!;
    const a = md1.find((r) => r.managerId === "A")!;
    const b = md1.find((r) => r.managerId === "B")!;
    expect(a).toMatchObject({ w: 2, l: 0, d: 1 });
    expect(b).toMatchObject({ w: 2, l: 0, d: 1 });
    // The T9 bug would charge the tie as a loss → L = N−1−W = 1. The Draw rule keeps L = 0.
    const N = managers.length;
    expect(a.l).not.toBe(N - 1 - a.w);
    expect(a.l).toBe(0);
    expect(a.w + a.l + a.d).toBe(N - 1);
  });

  it("co-ranks a genuine matchday points-tie (joint rank, next rank skips)", () => {
    const view = buildStandingsView(baseInput());
    // MD1: A and B both 10 → joint rank 1; C is next at rank 3 (2 is skipped).
    const md1 = view.matchday.md1!;
    const a = md1.find((r) => r.managerId === "A")!;
    const b = md1.find((r) => r.managerId === "B")!;
    const c = md1.find((r) => r.managerId === "C")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(a.tiedAtRank).toBe(true);
    expect(b.tiedAtRank).toBe(true);
    expect(c.rank).toBe(3);
    expect(c.tiedAtRank).toBe(false);
  });

  it("marks the viewer (isMe) and leaves seed null on matchday rows", () => {
    const view = buildStandingsView(baseInput());
    const a = view.matchday.md1!.find((r) => r.managerId === "A")!;
    expect(a.isMe).toBe(true);
    expect(a.seed).toBeNull();
    expect(view.matchday.md1!.find((r) => r.managerId === "B")!.isMe).toBe(false);
  });
});

describe("buildStandingsView — cumulative tab (season standings)", () => {
  it("sums W/L/D + points across periods and matches computeStandings exactly (no drift)", () => {
    const view = buildStandingsView(baseInput());
    const periodScores: PeriodScores[] = [
      { periodId: "md1", scores: MD1 },
      { periodId: "md2", scores: MD2 },
      { periodId: "md3", scores: MD3 },
    ];
    const engine = computeStandings(periodScores);
    const engineById = new Map(engine.map((r) => [r.managerId, r]));
    for (const row of view.cumulative) {
      const e = engineById.get(row.managerId)!;
      expect(row.w).toBe(e.allPlayAllW);
      expect(row.l).toBe(e.allPlayAllL);
      expect(row.d).toBe(e.allPlayAllD);
      expect(row.points).toBe(e.totalPoints);
      expect(row.seed).toBe(e.seed);
    }
  });

  it("separates equal-W managers by total points (the locked tiebreak)", () => {
    const view = buildStandingsView(baseInput());
    // A: W6 (seed 1). B & C both W4 — B has 22 pts, C has 19 → B ranks above C. D: W1 (seed 4).
    expect(view.cumulative.map((r) => r.managerId)).toEqual(["A", "B", "C", "D"]);
    const b = view.cumulative.find((r) => r.managerId === "B")!;
    const c = view.cumulative.find((r) => r.managerId === "C")!;
    expect(b.w).toBe(c.w); // level on wins
    expect(b.points).toBeGreaterThan(c.points);
    expect(b.seed!).toBeLessThan(c.seed!);
    // The level-on-wins flag drives the PF "tiebreak" underline in the table.
    expect(b.tiedWins).toBe(true);
    expect(c.tiedWins).toBe(true);
  });

  it("attaches the per-period form strip (W/L/D + points per period)", () => {
    const view = buildStandingsView(baseInput());
    const a = view.cumulative.find((r) => r.managerId === "A")!;
    expect(a.perPeriod).toBeDefined();
    expect(a.perPeriod!.map((p) => p.periodId)).toEqual(["md1", "md2", "md3"]);
    expect(a.perPeriod![0]).toMatchObject({ w: 2, l: 0, d: 1, points: 10, live: false });
    expect(a.perPeriod![2]).toMatchObject({ w: 3, l: 0, d: 0, points: 12, live: true });
  });
});

describe("buildStandingsView — joint rank vs deterministic seed", () => {
  it("co-ranks two fully-level managers (W + points), but the seed still distinguishes them", () => {
    // One period; A and B identical (10 each) → fully level on W AND points. C above both, D below.
    const view = buildStandingsView({
      periods: [{ id: "p", label: "MD1", name: "Matchday 1", live: false }],
      pointsByPeriod: {
        p: [
          { managerId: "A", points: 10 },
          { managerId: "B", points: 10 },
          { managerId: "C", points: 20 },
          { managerId: "D", points: 5 },
        ],
      },
      managers,
      meId: "A",
    });
    const rows = view.cumulative;
    const a = rows.find((r) => r.managerId === "A")!;
    const b = rows.find((r) => r.managerId === "B")!;
    const d = rows.find((r) => r.managerId === "D")!;
    // C is rank 1; A & B share rank 2; D is rank 4 (3 is skipped by the joint pair).
    expect(a.rank).toBe(2);
    expect(b.rank).toBe(2);
    expect(a.tiedAtRank).toBe(true);
    expect(b.tiedAtRank).toBe(true);
    expect(d.rank).toBe(4);
    // The deterministic seed (managerId fallback) still separates A and B for bracket purposes.
    expect(a.seed).not.toBe(b.seed);
    expect(a.seed! < b.seed!).toBe(true);
  });
});

describe("buildStandingsView — movement vs completed periods only", () => {
  it("computes move excluding the live period from the prior snapshot", () => {
    const view = buildStandingsView(baseInput());
    // Prior (MD1+MD2 only): B=W4(18pts) pos1, A=W3(15) pos2, C=W3(13) pos3, D=W0 pos4.
    // Current (all 3): A pos1, B pos2, C pos3, D pos4. move = prior − current.
    const byId = new Map(view.cumulative.map((r) => [r.managerId, r]));
    expect(byId.get("A")!.move).toBe(1); // 2 → 1 (climbed one)
    expect(byId.get("B")!.move).toBe(-1); // 1 → 2 (dropped one)
    expect(byId.get("C")!.move).toBe(0);
    expect(byId.get("D")!.move).toBe(0);
  });
});

describe("buildStandingsView — live flag + default matchday selection", () => {
  it("flags the live period and default-selects it", () => {
    const view = buildStandingsView(baseInput());
    expect(view.defaultMatchdayPeriodId).toBe("md3");
    expect(view.periods.find((p) => p.id === "md3")!.live).toBe(true);
  });

  it("falls back to the latest SCORED period when none is live", () => {
    // No live period; md3 has no score rows → default is the latest scored period (md2).
    const view = buildStandingsView({
      periods: [
        { id: "md1", label: "MD1", name: "Matchday 1", live: false },
        { id: "md2", label: "MD2", name: "Matchday 2", live: false },
        { id: "md3", label: "MD3", name: "Matchday 3", live: false },
      ],
      pointsByPeriod: { md1: MD1, md2: MD2, md3: [] },
      managers,
      meId: "A",
    });
    expect(view.defaultMatchdayPeriodId).toBe("md2");
  });

  it("returns null default when there are no periods", () => {
    const view = buildStandingsView({
      periods: [],
      pointsByPeriod: {},
      managers,
      meId: "A",
    });
    expect(view.defaultMatchdayPeriodId).toBeNull();
    expect(view.cumulative).toHaveLength(managers.length); // all directory managers still listed
  });
});

describe("buildStandingsView — provisional playoff cut context", () => {
  it("qualifies exactly fieldSize managers by deterministic seed position", () => {
    const view = buildStandingsView(baseInput({ fieldSize: 2 }));
    const qualified = view.cumulative.filter((r) => r.qualified);
    expect(qualified).toHaveLength(2);
    expect(qualified.map((r) => r.managerId)).toEqual(["A", "B"]);
    expect(view.fieldSize).toBe(2);
  });

  it("defaults the provisional field size when unset (Theme C: flexible, default)", () => {
    const view = buildStandingsView(baseInput());
    expect(view.fieldSize).toBe(DEFAULT_PLAYOFF_FIELD_SIZE);
  });
});

describe("standingsView.ts — purity (no IO / clock / env / db / feed)", () => {
  // Strip comments first so the module's own prose (which mentions @app/db etc. in the padding note)
  // can't mask — or fake — a violation. Mirrors @app/vsfield's purity guard.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const here = dirname(fileURLToPath(import.meta.url));
  const code = stripComments(readFileSync(resolve(here, "standingsView.ts"), "utf8"));
  const raw = readFileSync(resolve(here, "standingsView.ts"), "utf8");

  it("imports no side-effecting module and uses no clock / env / network", () => {
    expect(code).not.toMatch(/@app\/db/);
    expect(code).not.toMatch(/@app\/feed/);
    expect(code).not.toMatch(/@prisma\/client/);
    expect(code).not.toMatch(/@supabase/);
    expect(code).not.toMatch(/from\s+["']next/);
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/new\s+Date\s*\(/);
    expect(code).not.toMatch(/Date\.now/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  it("reuses the locked all-play-all helpers (proof of no re-derivation)", () => {
    expect(raw).toMatch(/periodRecords/);
    expect(raw).toMatch(/computeStandings/);
  });
});
