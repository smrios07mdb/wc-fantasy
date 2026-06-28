/**
 * T-3RD invariant + write-path guardrails for the 3rd-place play-off (DECISIONS → 3rd-place). These pin the
 * properties that keep the consolation fixture POOL-ONLY: it scores/validates as a 2-way knockout pick, and
 * it can NEVER leak into the guillotine cut ladder. The render/scoring proofs live in poolView.test.ts; the
 * ingest "period_id stays NULL" proof (which is what keeps the match invisible to lineups / player scoring /
 * loadPlayoffs / playoffsView, all of which are period-keyed) lives in packages/ingest/src/ingest.test.ts.
 */
import { describe, it, expect } from "vitest";
import { validatePickSubmission } from "@app/pool";
import { KNOCKOUT_ROUNDS } from "@app/shared";
import { resolvePoolPeriod, THIRD_PLACE_POOL_LABEL } from "./resolvePoolPeriod";

const future = new Date("2026-07-18T18:00:00.000Z");
const now = new Date("2026-07-01T00:00:00.000Z");
// The exact DB shape of the 3rd-place match: flagged, and ALWAYS period-less (period_id NULL).
const thirdPlaceSource = { isThirdPlace: true, period: null } as const;

describe("T-3RD write path (resolvePoolPeriod → validatePickSubmission, as prismaStore.getMatchFacts does)", () => {
  it("rejects a DRAW on the 3rd-place play-off (a 2-way knockout, not a 1X2 group game)", () => {
    const { periodKind } = resolvePoolPeriod(thirdPlaceSource);
    const err = validatePickSubmission(
      "DRAW",
      { status: "scheduled", periodKind, kickoffAt: future },
      now,
    );
    expect(err?.code).toBe("draw-not-allowed-knockout");
  });

  it("allows a HOME/AWAY pick on the 3rd-place play-off", () => {
    const { periodKind } = resolvePoolPeriod(thirdPlaceSource);
    expect(
      validatePickSubmission("HOME", { status: "scheduled", periodKind, kickoffAt: future }, now),
    ).toBeNull();
    expect(
      validatePickSubmission("AWAY", { status: "scheduled", periodKind, kickoffAt: future }, now),
    ).toBeNull();
  });

  it("documents the bug Option B fixes: WITHOUT synthesis a period-less match wrongly accepts DRAW", () => {
    // periodKind null (raw, pre-synthesis) → validatePickSubmission PERMITS DRAW (the permissive write rule).
    expect(
      validatePickSubmission(
        "DRAW",
        { status: "scheduled", periodKind: null, kickoffAt: future },
        now,
      ),
    ).toBeNull();
  });
});

describe("T-3RD guillotine isolation (the property Option A would have broken)", () => {
  it("keeps the guillotine cut ladder EXACTLY the 5 canonical rounds — the pool label is segregated", () => {
    expect([...KNOCKOUT_ROUNDS]).toEqual(["R32", "R16", "QF", "SF", "Final"]);
  });

  it("synthesizes a pool label that is NOT a cut round, so the 3rd-place match can never be a guillotine round", () => {
    const { periodLabel } = resolvePoolPeriod(thirdPlaceSource);
    expect(periodLabel).toBe(THIRD_PLACE_POOL_LABEL);
    expect((KNOCKOUT_ROUNDS as readonly string[]).includes(THIRD_PLACE_POOL_LABEL)).toBe(false);
  });
});
