/**
 * Composition tests: selectDashboardPhase (draft-level) + selectTournamentPhase (match-level)
 * → correct DashboardPhase for all combinations the loader would encounter.
 *
 * The loader's logic (expressed as a pure decision):
 *   - selectDashboardPhase("pending")   → "pre-draft"         (draft not started)
 *   - selectDashboardPhase("active")    → "draft"             (draft live)
 *   - selectDashboardPhase("paused")    → "draft"             (draft paused = still draft)
 *   - selectDashboardPhase("complete") + selectTournamentPhase([]) → "pre-kickoff"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([group completed]) → "group"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([knockout in_progress]) → "playoff"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([Final completed]) → "complete"
 */
import { describe, it, expect } from "vitest";
import type { DraftStatus, MatchStatus } from "@app/shared";
import { selectDashboardPhase, type DashboardPhase } from "./selectDashboardPhase";
import { selectTournamentPhase } from "./selectTournamentPhase";

function compose(
  draftStatus: DraftStatus,
  matches: Array<{ status: MatchStatus; round: string | null }>,
): DashboardPhase {
  const draftPhase = selectDashboardPhase(draftStatus);
  if (draftPhase !== "post-draft") return draftPhase;
  return selectTournamentPhase(matches);
}

describe("dashboard phase composition — draft phase unchanged for non-complete statuses", () => {
  it("pending → pre-draft regardless of match state", () => {
    expect(compose("pending", [])).toBe("pre-draft");
    expect(compose("pending", [{ status: "completed", round: null }])).toBe("pre-draft");
  });

  it("active → draft regardless of match state", () => {
    expect(compose("active", [])).toBe("draft");
    expect(compose("active", [{ status: "completed", round: null }])).toBe("draft");
  });

  it("paused → draft regardless of match state", () => {
    expect(compose("paused", [])).toBe("draft");
  });
});

describe("dashboard phase composition — draft complete refines to tournament phase", () => {
  it("complete + no matches → pre-kickoff (no fixtures loaded)", () => {
    expect(compose("complete", [])).toBe("pre-kickoff");
  });

  it("complete + all scheduled → pre-kickoff (not kicked off)", () => {
    expect(compose("complete", [{ status: "scheduled", round: null }])).toBe("pre-kickoff");
  });

  it("complete + group match in_progress → group", () => {
    expect(compose("complete", [{ status: "in_progress", round: null }])).toBe("group");
  });

  it("complete + group match completed → group", () => {
    expect(compose("complete", [{ status: "completed", round: null }])).toBe("group");
  });

  it("complete + knockout match in_progress → playoff", () => {
    expect(
      compose("complete", [
        { status: "completed", round: null },
        { status: "in_progress", round: "R32" },
      ]),
    ).toBe("playoff");
  });

  it("complete + Final completed → complete", () => {
    expect(
      compose("complete", [
        { status: "completed", round: null },
        { status: "completed", round: "Final" },
      ]),
    ).toBe("complete");
  });
});
