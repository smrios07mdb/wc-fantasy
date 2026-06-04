import { describe, it, expect } from "vitest";
import {
  comparePeriodPairwise,
  periodRecords,
  computeStandings,
  type ManagerPeriodPoints,
  type PeriodScores,
} from "./standing";

/** Shorthand for a period's manager→points map as the store hands it over. */
const pts = (rows: Record<string, number>): ManagerPeriodPoints[] =>
  Object.entries(rows).map(([managerId, points]) => ({ managerId, points }));

describe("comparePeriodPairwise (reusable H2H helper)", () => {
  it("emits one directed outcome per ordered pair, deterministically ordered", () => {
    const outcomes = comparePeriodPairwise(pts({ B: 10, A: 20, C: 10 }));
    // N=3 → N*(N-1)=6 directed outcomes; sorted by (managerId, opponentId).
    expect(outcomes.map((o) => `${o.managerId}>${o.opponentId}:${o.result}`)).toEqual([
      "A>B:win",
      "A>C:win",
      "B>A:loss",
      "B>C:tie",
      "C>A:loss",
      "C>B:tie",
    ]);
  });

  it("carries both managers' points so the UI can render the per-opponent margin", () => {
    const [first] = comparePeriodPairwise(pts({ A: 7, B: 3 }));
    expect(first).toEqual({
      managerId: "A",
      opponentId: "B",
      result: "win",
      points: 7,
      opponentPoints: 3,
    });
  });
});

describe("periodRecords — strict W/L (a tie is NEITHER)", () => {
  it("W = strictly-below count, L = strictly-above count for distinct scores", () => {
    const recs = periodRecords(pts({ A: 30, B: 20, C: 10 }));
    const byId = Object.fromEntries(recs.map((r) => [r.managerId, r]));
    expect(byId.A).toMatchObject({ w: 2, l: 0 });
    expect(byId.B).toMatchObject({ w: 1, l: 1 });
    expect(byId.C).toMatchObject({ w: 0, l: 2 });
  });

  it("a tied pair gets neither a W nor an L — and L ≠ N−1−W", () => {
    // N=3: A above, B and C tied below.
    const recs = periodRecords(pts({ A: 50, B: 20, C: 20 }));
    const byId = Object.fromEntries(recs.map((r) => [r.managerId, r]));

    expect(byId.B).toMatchObject({ w: 0, l: 1 }); // loses to A only; the B–C tie is neither
    expect(byId.C).toMatchObject({ w: 0, l: 1 });
    // The whole point of the spec: the buggy `L = N−1−W` would have charged B a 2nd loss.
    const N = 3;
    const b = byId.B!;
    expect(b.l).not.toBe(N - 1 - b.w); // 1 ≠ (3−1−0)=2
    expect(b.w + b.l).toBeLessThan(N - 1); // 0+1 < 2 because of the tie
  });

  it("two inactive 0s tie (neither charged) while an active manager banks the free win", () => {
    const recs = periodRecords(pts({ Active: 12, IdleX: 0, IdleY: 0 }));
    const byId = Object.fromEntries(recs.map((r) => [r.managerId, r]));
    expect(byId.Active).toMatchObject({ w: 2, l: 0 }); // free win over each idle 0
    expect(byId.IdleX).toMatchObject({ w: 0, l: 1 }); // loses to Active; ties IdleY → neither
    expect(byId.IdleY).toMatchObject({ w: 0, l: 1 });
  });
});

describe("computeStandings — cumulative all-play-all + seeding", () => {
  const periods = (...maps: Record<string, number>[]): PeriodScores[] =>
    maps.map((m, i) => ({ periodId: `MD${i + 1}`, scores: pts(m) }));

  it("sums Ws/Ls/points across periods", () => {
    const rows = computeStandings(
      periods(
        { A: 30, B: 20, C: 10 }, // A:2-0, B:1-1, C:0-2
        { A: 5, B: 25, C: 15 }, // A:0-2, B:2-0, C:1-1
      ),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.managerId, r]));
    expect(byId.A).toMatchObject({ allPlayAllW: 2, allPlayAllL: 2, totalPoints: 35 });
    expect(byId.B).toMatchObject({ allPlayAllW: 3, allPlayAllL: 1, totalPoints: 45 });
    expect(byId.C).toMatchObject({ allPlayAllW: 1, allPlayAllL: 3, totalPoints: 25 });
  });

  it("seeds by W desc when records differ (the primary key)", () => {
    const rows = computeStandings(periods({ A: 30, B: 20, C: 10 }, { A: 5, B: 25, C: 15 }));
    // Cumulative W: B=3, A=2, C=1 → all distinct, so W alone orders them.
    expect(rows.map((r) => `${r.managerId}#${r.seed}`)).toEqual(["B#1", "A#2", "C#3"]);
  });

  it("breaks an EQUAL-W tie by total_points — and only the points term gives the right order", () => {
    // Two periods. `zara` finishes 1st then 2nd; `abby` 2nd then 1st → BOTH end 3W-1L (W ties, so the
    // W key can't separate them). The first period scores far higher, so zara (1st there) outtotals
    // abby. Crucially zara's id sorts AFTER abby's: if the total_points term were dropped/inverted, the
    // managerId fallback would (wrongly) seed abby first — so this case has teeth the W-distinct cases lack.
    const rows = computeStandings(
      periods({ zara: 100, abby: 90, cleo: 10 }, { abby: 20, zara: 15, cleo: 5 }),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.managerId, r]));
    expect(byId.zara).toMatchObject({ allPlayAllW: 3, allPlayAllL: 1, totalPoints: 115 });
    expect(byId.abby).toMatchObject({ allPlayAllW: 3, allPlayAllL: 1, totalPoints: 110 });
    expect(rows.map((r) => `${r.managerId}#${r.seed}`)).toEqual(["zara#1", "abby#2", "cleo#3"]);
  });

  it("resolves a fully-tied pair (equal W AND total_points) by the deterministic managerId fallback", () => {
    // Two managers with identical period scores → identical W and total_points.
    const rows = computeStandings(periods({ zeta: 20, alpha: 20 }));
    // Both 0-0 (their mutual game is a tie), both 20 pts → fallback to managerId asc.
    expect(rows.map((r) => `${r.managerId}#${r.seed}`)).toEqual(["alpha#1", "zeta#2"]);
    expect(rows.every((r) => r.allPlayAllW === 0 && r.allPlayAllL === 0)).toBe(true);
  });

  it("is a pure function of its inputs (no mutation of the argument)", () => {
    const input = periods({ A: 10, B: 5 });
    const snapshot = JSON.stringify(input);
    computeStandings(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
