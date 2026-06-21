/**
 * Pure-logic suite for the prior-matchday selector helpers (T11) — IO-free, no DOM, no Prisma. This is the
 * loader contract test the three surfaces (lineup, vsfield, waivers) share: it pins the started-set
 * boundary, the canonical ordering, the read-only/done detection, and — the data-integrity line —
 * that a FUTURE/unstarted period is NEVER selectable and is rejected by the server-side resolver.
 */
import { describe, it, expect } from "vitest";
import type { MatchStatus } from "@app/shared";
import {
  MATCH_DURATION_MS,
  periodHasStarted,
  periodIsDone,
  resolveDisplayedPeriodId,
  selectableStartedPeriods,
  type PeriodForSelect,
} from "./selectablePeriods";

const NOW = new Date("2026-06-15T18:00:00.000Z");
const ms = (iso: string) => new Date(iso);

/** A period with one or more fixtures at the given kickoffs (status defaults to "scheduled"). */
function period(
  id: string,
  label: string,
  kickoffs: Array<{ at: string; status?: MatchStatus }>,
): PeriodForSelect {
  return {
    id,
    label,
    matches: kickoffs.map((k) => ({ kickoffAt: ms(k.at), status: k.status ?? "scheduled" })),
  };
}

// MD1: fully completed (last kickoff well in the past). MD2: live (first kicked off, last still within
// the window). MD3: future (first kickoff after NOW). Final: unseeded (no fixtures yet).
const MD1 = period("p-md1", "MD1", [
  { at: "2026-06-12T16:00:00.000Z", status: "completed" },
  { at: "2026-06-12T19:00:00.000Z", status: "completed" },
]);
const MD2 = period("p-md2", "MD2", [
  { at: "2026-06-15T16:00:00.000Z", status: "in_progress" }, // started, < NOW
  { at: "2026-06-15T19:00:00.000Z", status: "scheduled" }, // not yet kicked off
]);
const MD3 = period("p-md3", "MD3", [
  { at: "2026-06-18T16:00:00.000Z", status: "scheduled" },
  { at: "2026-06-18T19:00:00.000Z", status: "scheduled" },
]);
const FINAL_UNSEEDED = period("p-final", "Final", []);

describe("periodHasStarted", () => {
  it("is true once the first fixture's kickoff has arrived", () => {
    expect(periodHasStarted(MD1, NOW)).toBe(true);
    expect(periodHasStarted(MD2, NOW)).toBe(true);
  });
  it("is false for a future period whose first fixture is still scheduled and in the future", () => {
    expect(periodHasStarted(MD3, NOW)).toBe(false);
  });
  it("is true when the first fixture has left 'scheduled' even if kickoff time has not passed", () => {
    const early = period("x", "MD9", [{ at: "2026-06-20T00:00:00.000Z", status: "in_progress" }]);
    expect(periodHasStarted(early, NOW)).toBe(true);
  });
  it("is false for an unseeded period with no fixtures", () => {
    expect(periodHasStarted(FINAL_UNSEEDED, NOW)).toBe(false);
  });
});

describe("periodIsDone", () => {
  it("is true once the last fixture's match window has elapsed", () => {
    expect(periodIsDone(MD1, NOW)).toBe(true);
  });
  it("is false while the last fixture is still within the match window (live)", () => {
    expect(periodIsDone(MD2, NOW)).toBe(false);
  });
  it("is false for a future period", () => {
    expect(periodIsDone(MD3, NOW)).toBe(false);
  });
  it("flips exactly at last kickoff + MATCH_DURATION_MS", () => {
    const last = ms("2026-06-15T16:00:00.000Z");
    const p = period("x", "MD1", [{ at: last.toISOString() }]);
    expect(periodIsDone(p, new Date(last.getTime() + MATCH_DURATION_MS - 1))).toBe(false);
    expect(periodIsDone(p, new Date(last.getTime() + MATCH_DURATION_MS))).toBe(true);
  });
});

describe("selectableStartedPeriods", () => {
  it("includes completed priors and the live one, excludes future/unstarted, in canonical order", () => {
    // Deliberately pass periods out of order to prove the canonical sort (not input order, not alpha).
    const out = selectableStartedPeriods([MD3, FINAL_UNSEEDED, MD2, MD1], NOW);
    expect(out.map((p) => p.id)).toEqual(["p-md1", "p-md2"]);
    expect(out.map((p) => p.label)).toEqual(["MD1", "MD2"]);
  });

  it("tags the live period isLive and the completed prior isDone", () => {
    const out = selectableStartedPeriods([MD1, MD2, MD3], NOW);
    const md1 = out.find((p) => p.id === "p-md1")!;
    const md2 = out.find((p) => p.id === "p-md2")!;
    expect(md1).toMatchObject({ isLive: false, isDone: true });
    expect(md2).toMatchObject({ isLive: true, isDone: false });
  });

  it("NEVER includes a future/unstarted period (the reveal-safety line)", () => {
    const out = selectableStartedPeriods([MD1, MD2, MD3, FINAL_UNSEEDED], NOW);
    expect(out.some((p) => p.id === "p-md3")).toBe(false);
    expect(out.some((p) => p.id === "p-final")).toBe(false);
  });

  it("force-includes the default/current period via alwaysIncludeId even if not yet started (gap case)", () => {
    // Inter-matchday gap: the current wave (MD3) has been pinned by the surface but hasn't kicked off.
    const out = selectableStartedPeriods([MD1, MD2, MD3], NOW, "p-md3");
    expect(out.map((p) => p.id)).toEqual(["p-md1", "p-md2", "p-md3"]);
    // It is force-included but correctly tagged as not-yet-live.
    expect(out.find((p) => p.id === "p-md3")).toMatchObject({ isLive: false, isDone: false });
  });

  it("does not force-include a future period other than the named default", () => {
    const out = selectableStartedPeriods([MD1, MD2, MD3], NOW, "p-md2");
    expect(out.some((p) => p.id === "p-md3")).toBe(false);
  });
});

describe("resolveDisplayedPeriodId", () => {
  const periods = [MD1, MD2, MD3, FINAL_UNSEEDED];

  it("returns the default (no request) — the byte-identical pre-T11 path", () => {
    expect(resolveDisplayedPeriodId(periods, undefined, "p-md2", NOW)).toBe("p-md2");
    expect(resolveDisplayedPeriodId(periods, null, "p-md2", NOW)).toBe("p-md2");
  });

  it("honours a started prior request", () => {
    expect(resolveDisplayedPeriodId(periods, "p-md1", "p-md2", NOW)).toBe("p-md1");
  });

  it("REJECTS a future/unstarted request and falls back to the default (future never selectable)", () => {
    expect(resolveDisplayedPeriodId(periods, "p-md3", "p-md2", NOW)).toBe("p-md2");
    expect(resolveDisplayedPeriodId(periods, "p-final", "p-md2", NOW)).toBe("p-md2");
  });

  it("rejects an unknown id and falls back to the default", () => {
    expect(resolveDisplayedPeriodId(periods, "nope", "p-md2", NOW)).toBe("p-md2");
  });

  it("falls back to the default when the requested id equals a not-yet-started current default (gap)", () => {
    // requested == default == MD3 (the pinned current wave) which has not started → still returns it.
    expect(resolveDisplayedPeriodId(periods, "p-md3", "p-md3", NOW)).toBe("p-md3");
  });
});
