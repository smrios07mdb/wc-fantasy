/**
 * Tests for the single-sourced playoff fillability helpers (`squadCoversFormation` + `canFieldPlayoffXI`).
 * These live alongside `playoffBounds()` so there is ONE source of "can these position counts supply a
 * legal playoff XI", consumed by both the @app/faab release validator and apps/web's `formationFillable`.
 */
import { describe, expect, it } from "vitest";
import type { Position } from "@app/shared";
import { canFieldPlayoffXI, squadCoversFormation } from "./validate";

const counts = (c: Partial<Record<Position, number>>): Record<Position, number> => ({
  GK: 0,
  DEF: 0,
  MID: 0,
  FWD: 0,
  ...c,
});

describe("squadCoversFormation", () => {
  it("covers a formation when the squad owns >= its count in every position", () => {
    expect(
      squadCoversFormation(counts({ GK: 1, DEF: 3, MID: 3, FWD: 2 }), {
        GK: 1,
        DEF: 2,
        MID: 3,
        FWD: 1,
      }),
    ).toBe(true);
  });

  it("does not cover when short in a single position", () => {
    expect(
      squadCoversFormation(counts({ GK: 1, DEF: 2, MID: 3, FWD: 1 }), {
        GK: 1,
        DEF: 3, // squad has only 2
        MID: 2,
        FWD: 1,
      }),
    ).toBe(false);
  });
});

describe("canFieldPlayoffXI", () => {
  it("accepts a full 9-man playoff squad (2 GK optional / 3 DEF / 3 MID / 2 FWD covers every shape)", () => {
    expect(canFieldPlayoffXI(counts({ GK: 1, DEF: 3, MID: 3, FWD: 2 }))).toBe(true);
  });

  it.each([
    ["2-2-2", { GK: 1, DEF: 2, MID: 2, FWD: 2 }],
    ["2-3-1", { GK: 1, DEF: 2, MID: 3, FWD: 1 }],
    ["3-2-1", { GK: 1, DEF: 3, MID: 2, FWD: 1 }],
  ])("accepts an exact 7-man %s shape", (_label, c) => {
    expect(canFieldPlayoffXI(counts(c))).toBe(true);
  });

  it("rejects a squad with no goalkeeper", () => {
    expect(canFieldPlayoffXI(counts({ GK: 0, DEF: 3, MID: 3, FWD: 3 }))).toBe(false);
  });

  it.each([
    ["too few DEF", { GK: 1, DEF: 1, MID: 3, FWD: 3 }],
    ["too few MID", { GK: 1, DEF: 3, MID: 1, FWD: 3 }],
    ["no FWD", { GK: 1, DEF: 3, MID: 3, FWD: 0 }],
  ])("rejects when a lane is below the playoff minimum (%s)", (_label, c) => {
    expect(canFieldPlayoffXI(counts(c))).toBe(false);
  });

  it("rejects a 6-outfield-short squad whose lanes meet the mins but cannot reach 6 starters", () => {
    // 1 GK + 2 DEF + 2 MID + 1 FWD = 6 players: mins met, but only 5 outfield — no shape reaches 6.
    expect(canFieldPlayoffXI(counts({ GK: 1, DEF: 2, MID: 2, FWD: 1 }))).toBe(false);
  });

  it("accepts an over-cap squad that still has the bodies (extra GK)", () => {
    expect(canFieldPlayoffXI(counts({ GK: 2, DEF: 3, MID: 3, FWD: 2 }))).toBe(true);
  });
});
