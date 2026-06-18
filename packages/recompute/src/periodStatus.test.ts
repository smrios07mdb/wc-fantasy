import { describe, it, expect } from "vitest";
import { selectPeriodStatusTransitions } from "./periodStatus";
import type { TransitionPeriod, TransitionFixture } from "./periodStatus";

// ─── helpers ──────────────────────────────────────────────────────────────────

const K0 = new Date("2026-06-15T20:00:00Z");
const kickoff = (hoursOffset = 0): Date => new Date(K0.getTime() + hoursOffset * 60 * 60 * 1_000);

const fixture = (status: TransitionFixture["status"], offset = 0): TransitionFixture => ({
  kickoffAt: kickoff(offset),
  status,
});
const done = (offset = 0): TransitionFixture => fixture("completed", offset);

/** Period stub with an explicit lifecycle status. `frozenAt` defaults to null (unfrozen). */
const period = (
  id: string,
  label: string,
  status: TransitionPeriod["status"],
  frozenAt: Date | null = null,
): TransitionPeriod => ({ id, label, status, frozenAt });

// ─── toClose ────────────────────────────────────────────────────────────────────

describe("selectPeriodStatusTransitions — close", () => {
  it("closes an open period once every fixture is completed, and opens the next pending wave", () => {
    const periods = [period("md1", "MD1", "open"), period("md2", "MD2", "pending")];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(0), done(2)],
      md2: [fixture("scheduled", 72), fixture("scheduled", 74)],
    });
    expect(result).toEqual({ toClose: ["md1"], toOpen: ["md2"] });
  });

  it("does NOT close while a scheduled fixture remains", () => {
    const periods = [period("md1", "MD1", "open")];
    expect(
      selectPeriodStatusTransitions(periods, { md1: [done(0), fixture("scheduled", 2)] }),
    ).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT close while an in_progress fixture remains", () => {
    const periods = [period("md1", "MD1", "open")];
    expect(
      selectPeriodStatusTransitions(periods, { md1: [done(0), fixture("in_progress", 2)] }),
    ).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT close a period with a postponed fixture (anomaly — left for the commissioner)", () => {
    const periods = [period("md1", "MD1", "open")];
    expect(
      selectPeriodStatusTransitions(periods, { md1: [done(0), fixture("postponed", 2)] }),
    ).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT close a period with an abandoned fixture (anomaly)", () => {
    const periods = [period("md1", "MD1", "open")];
    expect(
      selectPeriodStatusTransitions(periods, { md1: [done(0), fixture("abandoned", 2)] }),
    ).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT close a period with no fixtures", () => {
    const periods = [period("md1", "MD1", "open")];
    expect(selectPeriodStatusTransitions(periods, {})).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT re-close an already-closed period (idempotent)", () => {
    const periods = [period("md1", "MD1", "closed"), period("md2", "MD2", "open")];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(0)],
      md2: [fixture("in_progress", 72)],
    });
    expect(result).toEqual({ toClose: [], toOpen: [] });
  });

  it("closes a pending period too (status !== closed), not only an open one", () => {
    // Defensive: a wave that was never promoted to open but whose fixtures all completed.
    const periods = [period("md1", "MD1", "pending")];
    const result = selectPeriodStatusTransitions(periods, { md1: [done(0), done(1)] });
    expect(result.toClose).toEqual(["md1"]);
  });
});

// ─── toOpen / one-open invariant ─────────────────────────────────────────────────

describe("selectPeriodStatusTransitions — open / one-open invariant", () => {
  it("steady state (open wave still in progress) is a no-op", () => {
    const periods = [
      period("md1", "MD1", "closed"),
      period("md2", "MD2", "open"),
      period("md3", "MD3", "pending"),
    ];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(0)],
      md2: [fixture("in_progress", 72)],
      md3: [fixture("scheduled", 144)],
    });
    expect(result).toEqual({ toClose: [], toOpen: [] });
  });

  it("does NOT promote a second open period when the current wave is already open", () => {
    // md1 not closeable (still live), md2 already open → nothing to open.
    const periods = [period("md1", "MD1", "open"), period("md2", "MD2", "open")];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [fixture("in_progress", 0)],
      md2: [fixture("scheduled", 72)],
    });
    expect(result.toOpen).toEqual([]);
  });

  it("close→open hand-off maintains exactly one open period", () => {
    const periods = [
      period("md1", "MD1", "closed"),
      period("md2", "MD2", "open"),
      period("md3", "MD3", "pending"),
    ];
    // md2's matches are now all done → close md2, promote md3.
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(-48)],
      md2: [done(0), done(2)],
      md3: [fixture("scheduled", 72)],
    });
    expect(result).toEqual({ toClose: ["md2"], toOpen: ["md3"] });
  });

  it("hands off across the group→knockout boundary in canonical order (MD3 → R32)", () => {
    const periods = [
      period("md1", "MD1", "closed"),
      period("md2", "MD2", "closed"),
      period("md3", "MD3", "open"),
      period("r32", "R32", "pending"),
      period("r16", "R16", "pending"),
    ];
    const result = selectPeriodStatusTransitions(periods, {
      md3: [done(0)],
      r32: [fixture("scheduled", 120)],
      r16: [fixture("scheduled", 240)],
    });
    expect(result).toEqual({ toClose: ["md3"], toOpen: ["r32"] });
  });

  it("picks the earliest pending by tournament order, not string order (MD2 before MD10)", () => {
    const periods = [period("md10", "MD10", "pending"), period("md2", "MD2", "pending")];
    // Bootstrap: no open period, nothing closeable → promote the earliest by rank (MD2).
    const result = selectPeriodStatusTransitions(periods, {
      md2: [fixture("scheduled", 0)],
      md10: [fixture("scheduled", 200)],
    });
    expect(result).toEqual({ toClose: [], toOpen: ["md2"] });
  });
});

// ─── bootstrap / tournament end ──────────────────────────────────────────────────

describe("selectPeriodStatusTransitions — bootstrap & end", () => {
  it("bootstrap: no open period yet → promotes the earliest non-closed pending", () => {
    const periods = [
      period("md1", "MD1", "pending"),
      period("md2", "MD2", "pending"),
      period("final", "Final", "pending"),
    ];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [fixture("scheduled", 0)],
      md2: [fixture("scheduled", 72)],
      final: [fixture("scheduled", 600)],
    });
    expect(result).toEqual({ toClose: [], toOpen: ["md1"] });
  });

  it("bootstrap where the earliest pending is itself closeable: closes it and opens the next", () => {
    // MD1 already fully played before any status was advanced (the live MD1 incident shape).
    const periods = [period("md1", "MD1", "pending"), period("md2", "MD2", "pending")];
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(0), done(2)],
      md2: [fixture("scheduled", 72)],
    });
    expect(result).toEqual({ toClose: ["md1"], toOpen: ["md2"] });
  });

  it("tournament end (every remaining wave closeable) → no opens", () => {
    const periods = [period("sf", "SF", "closed"), period("final", "Final", "open")];
    const result = selectPeriodStatusTransitions(periods, {
      sf: [done(-48)],
      final: [done(0)],
    });
    expect(result).toEqual({ toClose: ["final"], toOpen: [] });
  });

  it("fully-closed tournament → empty transitions", () => {
    const periods = [period("sf", "SF", "closed"), period("final", "Final", "closed")];
    expect(selectPeriodStatusTransitions(periods, { sf: [done(-48)], final: [done(0)] })).toEqual({
      toClose: [],
      toOpen: [],
    });
  });

  it("multiple waves completing in one run: closes all completed, opens the first still-pending", () => {
    const periods = [
      period("md1", "MD1", "open"),
      period("md2", "MD2", "pending"),
      period("md3", "MD3", "pending"),
    ];
    // Cron was down; MD1 and MD2 both fully completed by the time it runs again.
    const result = selectPeriodStatusTransitions(periods, {
      md1: [done(-48)],
      md2: [done(0)],
      md3: [fixture("scheduled", 72)],
    });
    expect(result.toClose.sort()).toEqual(["md1", "md2"]);
    expect(result.toOpen).toEqual(["md3"]);
  });
});
