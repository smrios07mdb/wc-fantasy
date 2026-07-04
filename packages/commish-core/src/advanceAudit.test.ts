import { describe, it, expect } from "vitest";
import { buildAdvanceAuditRow } from "./advanceAudit";

/**
 * Pins the shared advance-audit row shape (feat/autofire-round-cut FIX 2) BYTE-IDENTICAL to the web path —
 * `apps/web/src/commish/handleAdvance.buildAdvanceAudit` (summary/detail/delta/target_ref) + `recordCommishAudit`
 * (field mapping). commish-core cannot import `apps/web`, so the web shape is encoded here as the expected
 * literal; any drift in either side breaks this test. Covers both `auto_advance` (null actor, no champion)
 * and `round_advance` (actor, champion, tie-adjudicated) so the parameterization matches the web builder.
 */
describe("buildAdvanceAuditRow — matches the web round_advance shape", () => {
  it("auto_advance: null actor, eliminated + released, no champion", () => {
    const row = buildAdvanceAuditRow({
      leagueId: "L",
      actorUserId: null,
      actionType: "auto_advance",
      roundLabel: "R32",
      eliminated: ["m1", "m2"],
      champion: null,
      released: { m1: ["p1", "p2"], m2: ["p3"] },
      reason: "auto-fire: R32 closed & settle-elapsed — automated guillotine cut",
      tieAdjudicated: false,
      nameOf: { m1: "Team 1", m2: "Team 2" },
    });

    expect(row).toEqual({
      leagueId: "L",
      actorUserId: null,
      actionType: "auto_advance",
      summary: "Round cut applied: R32 — eliminated 2 (Team 1, Team 2), released 3 to the wire",
      detail:
        "Irreversible — playoff_entry flipped alive → eliminated for Team 1, Team 2. 3 roster players released to the free-agent wire.",
      reason: "auto-fire: R32 closed & settle-elapsed — automated guillotine cut",
      delta: "−2 alive, −3 owned",
      reversible: false,
      targetRef: {
        roundLabel: "R32",
        eliminated: ["m1", "m2"],
        champion: null,
        released: { m1: ["p1", "p2"], m2: ["p3"] },
        releasedCount: 3,
      },
    });
  });

  it("round_advance: actor id, singular release wording, champion + tie-adjudicated detail", () => {
    const row = buildAdvanceAuditRow({
      leagueId: "L",
      actorUserId: "u1",
      actionType: "round_advance",
      roundLabel: "Final",
      eliminated: ["m1"],
      champion: "m3",
      released: { m1: ["p1"] },
      reason: "final cut",
      tieAdjudicated: true,
      nameOf: { m1: "Team 1", m3: "Team 3" },
    });

    expect(row.actorUserId).toBe("u1");
    expect(row.actionType).toBe("round_advance");
    expect(row.summary).toBe(
      "Round cut applied: Final — eliminated 1 (Team 1), released 1 to the wire",
    );
    expect(row.detail).toBe(
      "Irreversible — playoff_entry flipped alive → eliminated for Team 1. 1 roster player released to the free-agent wire. Team 3 is the champion. Boundary tie adjudicated by the commissioner.",
    );
    expect(row.delta).toBe("−1 alive, −1 owned");
  });
});
