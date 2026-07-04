import { describe, it, expect } from "vitest";
import { selectAutoFireCut, type AutoFireRound } from "./selectors";

/**
 * The PURE auto-fire decision (feat/autofire-round-cut). It fires an IRREVERSIBLE cut only when EVERY
 * guard holds — enabled + closed + settle-elapsed + not-cut + a fully DETERMINED resolution — and targets
 * the EARLIEST uncut closed knockout round. A boundary tie / invalid tiebreak is surfaced as an `alert`,
 * never auto-cut. No DB, no network, no clock — every fact is injected.
 */

const LAST_FT = new Date("2026-07-04T20:00:00.000Z").getTime();
const SETTLE_MS = 5 * 60_000;
/** Exactly at the settle boundary — elapsed (the check is `>=`). */
const ELAPSED = new Date(LAST_FT + SETTLE_MS);
/** One ms short of the settle boundary. */
const NOT_ELAPSED = new Date(LAST_FT + SETTLE_MS - 1);

function round(over: Partial<AutoFireRound> & { label: string }): AutoFireRound {
  return {
    periodId: `p-${over.label}`,
    status: "closed",
    lastFtMs: LAST_FT,
    alreadyCut: false,
    resolutionKind: "determined",
    ...over,
  };
}

function call(over: { now?: Date; enabled?: boolean; settleMs?: number; rounds: AutoFireRound[] }) {
  return selectAutoFireCut({
    now: over.now ?? ELAPSED,
    enabled: over.enabled ?? true,
    settleMs: over.settleMs ?? SETTLE_MS,
    rounds: over.rounds,
  });
}

describe("selectAutoFireCut — the pure auto-fire decision", () => {
  it("fires the determined cut once every gate passes", () => {
    expect(call({ rounds: [round({ label: "R32", resolutionKind: "determined" })] })).toEqual({
      action: "fire",
      periodId: "p-R32",
      label: "R32",
    });
  });

  it("disabled (kill-switch off) NEVER fires — the byte-identical no-op default", () => {
    expect(call({ enabled: false, rounds: [round({ label: "R32" })] })).toEqual({
      action: "none",
      reason: "disabled",
    });
  });

  it("does not fire while the round's period is not yet closed", () => {
    expect(call({ rounds: [round({ label: "R32", status: "open" })] })).toMatchObject({
      action: "none",
    });
    expect(call({ rounds: [round({ label: "R32", status: "pending" })] })).toMatchObject({
      action: "none",
    });
  });

  it("does not fire until the settle window elapses", () => {
    expect(call({ now: NOT_ELAPSED, rounds: [round({ label: "R32" })] })).toEqual({
      action: "none",
      reason: "settle window not elapsed",
    });
  });

  it("fires exactly at the settle boundary (>=)", () => {
    expect(call({ now: ELAPSED, rounds: [round({ label: "R32" })] })).toMatchObject({
      action: "fire",
    });
  });

  it("skips a round that is already cut (idempotent — the ledger of eliminated_round)", () => {
    expect(call({ rounds: [round({ label: "R32", alreadyCut: true })] })).toMatchObject({
      action: "none",
    });
  });

  it("targets the EARLIEST uncut closed knockout round in bracket order", () => {
    // R32 already cut; R16 + QF both closed & uncut → picks R16 (earlier in the bracket).
    const rounds = [
      round({ label: "QF", resolutionKind: "determined" }),
      round({ label: "R16", resolutionKind: "determined" }),
      round({ label: "R32", alreadyCut: true }),
    ];
    expect(call({ rounds })).toEqual({ action: "fire", periodId: "p-R16", label: "R16" });
  });

  it("alerts (never cuts) on a boundary tie", () => {
    expect(
      call({ rounds: [round({ label: "R32", resolutionKind: "needsCommissioner" })] }),
    ).toEqual({
      action: "alert",
      periodId: "p-R32",
      label: "R32",
      resolution: "needsCommissioner",
    });
  });

  it("alerts (never cuts) on an invalid tiebreak", () => {
    expect(call({ rounds: [round({ label: "R32", resolutionKind: "invalid-tiebreak" })] })).toEqual(
      {
        action: "alert",
        periodId: "p-R32",
        label: "R32",
        resolution: "invalid-tiebreak",
      },
    );
  });

  it("asks the caller to resolve when the resolution is not yet computed", () => {
    expect(call({ rounds: [round({ label: "R32", resolutionKind: null })] })).toEqual({
      action: "resolve",
      periodId: "p-R32",
      label: "R32",
    });
  });

  it("does not fire a round with no fixtures to anchor the settle window", () => {
    expect(call({ rounds: [round({ label: "R32", lastFtMs: null })] })).toMatchObject({
      action: "none",
    });
  });

  it("ignores non-knockout periods (only R32…Final labels are candidates)", () => {
    expect(call({ rounds: [round({ label: "MD3", status: "closed" })] })).toMatchObject({
      action: "none",
    });
  });

  it("no knockout rounds at all ⇒ none", () => {
    expect(call({ rounds: [] })).toMatchObject({ action: "none" });
  });
});
