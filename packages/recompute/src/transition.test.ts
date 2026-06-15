import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  selectPlayoffField,
  cutScheduleFor,
  carryForwardWaiverOrder,
  MIN_PLAYOFF_FIELD,
  type SeededStanding,
  type WaiverOrderSlot,
} from "./transition";
import { KNOCKOUT_ROUNDS } from "@app/shared";

/** A standings fixture seeded 1..n in a deliberately SHUFFLED manager order (so we prove the field is
 *  picked by seed, not by array order). */
function shuffledStandings(n: number): SeededStanding[] {
  const rows: SeededStanding[] = [];
  for (let i = 1; i <= n; i++) rows.push({ managerId: `m${i}`, seed: i });
  // rotate so index 0 is NOT seed 1
  return [...rows.slice(3), ...rows.slice(0, 3)];
}

describe("selectPlayoffField", () => {
  it("takes the top-N by seed (1 = best), in seed order, seeds carried verbatim", () => {
    const field = selectPlayoffField(shuffledStandings(16), 8);
    expect(field).toEqual([
      { managerId: "m1", seed: 1 },
      { managerId: "m2", seed: 2 },
      { managerId: "m3", seed: 3 },
      { managerId: "m4", seed: 4 },
      { managerId: "m5", seed: 5 },
      { managerId: "m6", seed: 6 },
      { managerId: "m7", seed: 7 },
      { managerId: "m8", seed: 8 },
    ]);
  });

  it("handles the whole standings as the field (fieldSize === length)", () => {
    const field = selectPlayoffField(shuffledStandings(6), 6);
    expect(field.map((f) => f.seed)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects a field smaller than the 5-round minimum", () => {
    expect(() => selectPlayoffField(shuffledStandings(16), MIN_PLAYOFF_FIELD - 1)).toThrow(
      /minimum/,
    );
  });

  it("rejects a field larger than the manager pool", () => {
    expect(() => selectPlayoffField(shuffledStandings(7), 8)).toThrow(/exceeds/);
  });

  it("rejects non-integer field sizes", () => {
    expect(() => selectPlayoffField(shuffledStandings(16), 8.5)).toThrow(/integer/);
  });

  it("rejects corrupt standings with duplicate seeds", () => {
    const dup: SeededStanding[] = [
      { managerId: "a", seed: 1 },
      { managerId: "b", seed: 1 },
      { managerId: "c", seed: 3 },
      { managerId: "d", seed: 4 },
      { managerId: "e", seed: 5 },
      { managerId: "f", seed: 6 },
    ];
    expect(() => selectPlayoffField(dup, 6)).toThrow(/duplicate seeds/);
  });

  it("does not mutate the input array", () => {
    const input = shuffledStandings(8);
    const snapshot = [...input];
    selectPlayoffField(input, 6);
    expect(input).toEqual(snapshot);
  });
});

describe("cutScheduleFor", () => {
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  const counts = (n: number): number[] => cutScheduleFor(n).map((e) => e.cutCount);

  it("labels the 5 WC knockout rounds in order", () => {
    expect(cutScheduleFor(10).map((e) => e.round)).toEqual([...KNOCKOUT_ROUNDS]);
  });

  it("matches the locked example schedules", () => {
    expect(counts(6)).toEqual([1, 1, 1, 1, 1]);
    expect(counts(8)).toEqual([2, 2, 1, 1, 1]);
    expect(counts(10)).toEqual([2, 2, 2, 2, 1]);
    expect(counts(12)).toEqual([3, 2, 2, 2, 2]);
  });

  it("for EVERY legal field: sums to field−1, front-loaded non-increasing, each ≥ 1", () => {
    for (let field = MIN_PLAYOFF_FIELD; field <= 40; field++) {
      const c = counts(field);
      expect(c).toHaveLength(KNOCKOUT_ROUNDS.length);
      expect(sum(c)).toBe(field - 1); // exactly one champion remains
      for (let i = 1; i < c.length; i++) expect(c[i]!).toBeLessThanOrEqual(c[i - 1]!); // non-increasing
      expect(Math.min(...c)).toBeGreaterThanOrEqual(1); // each round cuts ≥ 1
    }
  });

  it("rejects a field below the minimum (cannot give each round ≥ 1)", () => {
    expect(() => cutScheduleFor(MIN_PLAYOFF_FIELD - 1)).toThrow(/minimum/);
  });

  it("rejects non-integer field sizes", () => {
    expect(() => cutScheduleFor(10.2)).toThrow(/integer/);
  });
});

describe("carryForwardWaiverOrder", () => {
  /** A contiguous live order m1..mN at positions 1..N. */
  const order = (n: number): WaiverOrderSlot[] =>
    Array.from({ length: n }, (_, i) => ({ managerId: `m${i + 1}`, waiverOrderPosition: i + 1 }));

  it("keeps survivors' relative order and re-packs to contiguous 1..K (gaps closed)", () => {
    // Eliminate m2, m4, m6 from a 6-long order → survivors m1,m3,m5 collapse to 1,2,3.
    const carried = carryForwardWaiverOrder(order(6), ["m1", "m3", "m5"]);
    expect(carried).toEqual([
      { managerId: "m1", position: 1 },
      { managerId: "m3", position: 2 },
      { managerId: "m5", position: 3 },
    ]);
  });

  it("ranks by the LIVE position, not the input array order", () => {
    // Live order says m3 (pos 1) is ahead of m1 (pos 3); the surviving-ids array is deliberately reversed.
    const live: WaiverOrderSlot[] = [
      { managerId: "m1", waiverOrderPosition: 3 },
      { managerId: "m2", waiverOrderPosition: 2 },
      { managerId: "m3", waiverOrderPosition: 1 },
    ];
    expect(carryForwardWaiverOrder(live, ["m1", "m3"])).toEqual([
      { managerId: "m3", position: 1 },
      { managerId: "m1", position: 2 },
    ]);
  });

  it("when every manager survives, re-packs to the same order (identity)", () => {
    expect(carryForwardWaiverOrder(order(4), ["m1", "m2", "m3", "m4"])).toEqual([
      { managerId: "m1", position: 1 },
      { managerId: "m2", position: 2 },
      { managerId: "m3", position: 3 },
      { managerId: "m4", position: 4 },
    ]);
  });

  it("sorts NULL-position survivors after positioned ones, deterministically by managerId", () => {
    const live: WaiverOrderSlot[] = [
      { managerId: "b", waiverOrderPosition: 2 },
      { managerId: "z", waiverOrderPosition: null },
      { managerId: "a", waiverOrderPosition: null },
      { managerId: "c", waiverOrderPosition: 1 },
    ];
    expect(carryForwardWaiverOrder(live, ["a", "b", "c", "z"])).toEqual([
      { managerId: "c", position: 1 }, // pos 1
      { managerId: "b", position: 2 }, // pos 2
      { managerId: "a", position: 3 }, // null → after positioned, managerId asc
      { managerId: "z", position: 4 }, // null
    ]);
  });

  it("returns [] when there are no survivors", () => {
    expect(carryForwardWaiverOrder(order(3), [])).toEqual([]);
  });

  it("throws when a surviving manager is absent from the current order", () => {
    expect(() => carryForwardWaiverOrder(order(3), ["m1", "ghost"])).toThrow(
      /absent from the current order/,
    );
  });

  it("throws on a duplicate surviving id (would mint a duplicate position)", () => {
    expect(() => carryForwardWaiverOrder(order(3), ["m1", "m1"])).toThrow(/duplicate/);
  });

  it("does not mutate the input array", () => {
    const input = order(5);
    const snapshot = structuredClone(input);
    carryForwardWaiverOrder(input, ["m1", "m4"]);
    expect(input).toEqual(snapshot);
  });
});

// Theme F: the transition DERIVATION must be IO-free — no db/clock/env/fetch — so a transition is
// recomputable from stored inputs exactly like a score (ARCHITECTURE.md §4). Grep the module source.
describe("transition.ts is IO-free (pure derivation)", () => {
  const src = readFileSync(new URL("./transition.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const FORBIDDEN: ReadonlyArray<{ label: string; re: RegExp }> = [
    { label: "@app/db", re: /@app\/db/ },
    { label: "@prisma/client", re: /@prisma\/client/ },
    { label: "@supabase import", re: /@supabase/ },
    { label: "process.env", re: /process\.env/ },
    { label: "fetch(", re: /\bfetch\s*\(/ },
    { label: "new Date(", re: /new\s+Date\s*\(/ },
    { label: "Date.now", re: /Date\.now/ },
  ];
  for (const { label, re } of FORBIDDEN) {
    it(`contains no ${label}`, () => {
      expect(re.test(src)).toBe(false);
    });
  }
});
