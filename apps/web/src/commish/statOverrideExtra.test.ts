/**
 * Pure unit tests for the 2b write-side helpers (no Prisma). Cover the write-boundary allowlist/Int≥0 guard,
 * the read-modify-write extra merge (rolePlayed preserved; clear-all → null), and the audit delta strings.
 */
import { describe, expect, it } from "vitest";
import {
  formatStatOverrideDelta,
  mergeStatOverridesIntoExtra,
  validateStatOverrides,
} from "./statOverrideExtra";

describe("validateStatOverrides — write boundary (allowlist + Int≥0)", () => {
  it("accepts allowlisted integer values", () => {
    expect(validateStatOverrides({ goals: 2, assists: 1, saves: 4 })).toEqual({
      ok: true,
      overrides: { goals: 2, assists: 1, saves: 4 },
    });
  });

  it("accepts an explicit 0 (a legitimate 'correct this stat down to zero')", () => {
    expect(validateStatOverrides({ goals: 0 })).toEqual({ ok: true, overrides: { goals: 0 } });
  });

  it("accepts an empty map (clear-all)", () => {
    expect(validateStatOverrides({})).toEqual({ ok: true, overrides: {} });
  });

  it("REJECTS an unknown key (typo / phantom stat) with unknown_stat_key", () => {
    expect(validateStatOverrides({ goalz: 2 })).toEqual({ ok: false, error: "unknown_stat_key" });
  });

  it("REJECTS an inert (never-scored) key — dribblesAttempted is not in the allowlist", () => {
    expect(validateStatOverrides({ dribblesAttempted: 3 })).toEqual({
      ok: false,
      error: "unknown_stat_key",
    });
  });

  it("REJECTS a negative or fractional value with bad_request (n() does not clamp)", () => {
    expect(validateStatOverrides({ goals: -1 })).toEqual({ ok: false, error: "bad_request" });
    expect(validateStatOverrides({ goals: 1.5 })).toEqual({ ok: false, error: "bad_request" });
  });
});

describe("mergeStatOverridesIntoExtra — read-modify-write (rolePlayed preserved)", () => {
  it("sets statOverrides on a fresh (null) extra", () => {
    expect(mergeStatOverridesIntoExtra(null, { goals: 2 })).toEqual({
      statOverrides: { goals: 2 },
    });
  });

  it("PRESERVES rolePlayed (and any other key) when setting overrides", () => {
    expect(mergeStatOverridesIntoExtra({ rolePlayed: "GK" }, { saves: 4 })).toEqual({
      rolePlayed: "GK",
      statOverrides: { saves: 4 },
    });
  });

  it("clear-all removes ONLY statOverrides, leaving rolePlayed", () => {
    expect(
      mergeStatOverridesIntoExtra({ rolePlayed: "GK", statOverrides: { goals: 2 } }, {}),
    ).toEqual({ rolePlayed: "GK" });
  });

  it("clear-all on an extra with nothing else → null (store persists SQL NULL)", () => {
    expect(mergeStatOverridesIntoExtra({ statOverrides: { goals: 2 } }, {})).toBeNull();
    expect(mergeStatOverridesIntoExtra(null, {})).toBeNull();
  });

  it("replaces the prior statOverrides wholesale (absolute overlay), preserving siblings", () => {
    expect(
      mergeStatOverridesIntoExtra(
        { rolePlayed: "GK", statOverrides: { goals: 2, assists: 1 } },
        { goals: 3 },
      ),
    ).toEqual({ rolePlayed: "GK", statOverrides: { goals: 3 } });
  });
});

describe("formatStatOverrideDelta — audit strings (field changes, not points)", () => {
  it("feed→N for a newly-set field", () => {
    const d = formatStatOverrideDelta({}, { goals: 2 });
    expect(d).toMatchObject({ changed: true, delta: "goals feed→2" });
    expect(d.summary).toContain("1 field");
  });

  it("N→M for a changed field; deterministic allowlist order for multiple", () => {
    const d = formatStatOverrideDelta({ assists: 1 }, { goals: 2, assists: 3 });
    expect(d.delta).toBe("goals feed→2 · assists 1→3"); // goals precedes assists in the allowlist
    expect(d.summary).toContain("2 fields");
  });

  it("N→feed when a field is cleared (removed from the map)", () => {
    const d = formatStatOverrideDelta({ goals: 2, assists: 1 }, { assists: 1 });
    expect(d).toMatchObject({ changed: true, delta: "goals 2→feed" });
  });

  it("clear-all → 'cleared all overrides' summary", () => {
    const d = formatStatOverrideDelta({ goals: 2 }, {});
    expect(d.changed).toBe(true);
    expect(d.summary).toContain("cleared all");
    expect(d.delta).toBe("goals 2→feed");
  });

  it("idempotent re-submit → changed:false, 'no change'", () => {
    expect(formatStatOverrideDelta({ goals: 2 }, { goals: 2 })).toEqual({
      changed: false,
      delta: "no change",
      summary: "Stat correction (no change)",
    });
  });
});
