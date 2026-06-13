/**
 * Composition tests: selectDashboardPhase (draft-level) + selectTournamentPhase (match-level)
 * → correct DashboardPhase for all combinations the loader would encounter.
 *
 * The loader's logic (expressed as a pure decision):
 *   - selectDashboardPhase("pending")   → "pre-draft"         (draft not started)
 *   - selectDashboardPhase("active")    → "draft"             (draft live)
 *   - selectDashboardPhase("paused")    → "draft"             (draft paused = still draft)
 *   - selectDashboardPhase("complete") + selectTournamentPhase([]) → "pre-kickoff"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([group_md completed]) → "group"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([knockout_round in_progress]) → "playoff"
 *   - selectDashboardPhase("complete") + selectTournamentPhase([Final completed]) → "complete"
 *
 * Match summaries key on period.kind / period.label (NEVER fifa_match.round — Prompt 44).
 */
import { describe, it, expect } from "vitest";
import type { DraftStatus, MatchStatus, PeriodKind } from "@app/shared";
import { selectDashboardPhase, type DashboardPhase } from "./selectDashboardPhase";
import { selectTournamentPhase } from "./selectTournamentPhase";

function compose(
  draftStatus: DraftStatus,
  matches: Array<{
    status: MatchStatus;
    periodKind: PeriodKind | null;
    periodLabel: string | null;
  }>,
): DashboardPhase {
  const draftPhase = selectDashboardPhase(draftStatus);
  if (draftPhase !== "post-draft") return draftPhase;
  return selectTournamentPhase(matches);
}

describe("dashboard phase composition — draft phase unchanged for non-complete statuses", () => {
  it("pending → pre-draft regardless of match state", () => {
    expect(compose("pending", [])).toBe("pre-draft");
    expect(
      compose("pending", [{ status: "completed", periodKind: "group_md", periodLabel: "MD1" }]),
    ).toBe("pre-draft");
  });

  it("active → draft regardless of match state", () => {
    expect(compose("active", [])).toBe("draft");
    expect(
      compose("active", [{ status: "completed", periodKind: "group_md", periodLabel: "MD1" }]),
    ).toBe("draft");
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
    expect(
      compose("complete", [{ status: "scheduled", periodKind: "group_md", periodLabel: "MD1" }]),
    ).toBe("pre-kickoff");
  });

  it("complete + group match in_progress → group", () => {
    expect(
      compose("complete", [{ status: "in_progress", periodKind: "group_md", periodLabel: "MD1" }]),
    ).toBe("group");
  });

  it("complete + group match completed → group", () => {
    expect(
      compose("complete", [{ status: "completed", periodKind: "group_md", periodLabel: "MD1" }]),
    ).toBe("group");
  });

  it("complete + knockout match in_progress → playoff", () => {
    expect(
      compose("complete", [
        { status: "completed", periodKind: "group_md", periodLabel: "MD1" },
        { status: "in_progress", periodKind: "knockout_round", periodLabel: "R32" },
      ]),
    ).toBe("playoff");
  });

  it("complete + Final completed → complete", () => {
    expect(
      compose("complete", [
        { status: "completed", periodKind: "group_md", periodLabel: "MD1" },
        { status: "completed", periodKind: "knockout_round", periodLabel: "Final" },
      ]),
    ).toBe("complete");
  });
});
