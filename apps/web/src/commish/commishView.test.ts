import { describe, expect, it } from "vitest";
import { formatAgo, toAuditView, toInspector, type CommishManagerOption } from "./commishView";

const NOW = new Date("2026-07-01T18:00:00.000Z");

describe("formatAgo", () => {
  it("labels sub-minute as 'just now', then m/h/d", () => {
    expect(formatAgo("2026-07-01T17:59:30.000Z", NOW)).toBe("just now");
    expect(formatAgo("2026-07-01T17:53:00.000Z", NOW)).toBe("7m ago");
    expect(formatAgo("2026-07-01T15:00:00.000Z", NOW)).toBe("3h ago");
    expect(formatAgo("2026-06-28T18:00:00.000Z", NOW)).toBe("3d ago");
  });
});

describe("toAuditView", () => {
  it("maps a row + resolves the actor label (displayName wins over email) + reversed flag", () => {
    const v = toAuditView(
      {
        id: "a1",
        actionType: "stat_correction",
        summary: "Corrected L. Martínez — Goals 1 → 2",
        detail: "VAR-awarded goal",
        reason: "VAR review",
        delta: "+5 pts",
        reversible: true,
        reversedAt: null,
        createdAt: new Date("2026-07-01T17:53:00.000Z"),
        actor: { displayName: "Commish", email: "smrios07@gmail.com" },
      },
      NOW,
    );
    expect(v.actorLabel).toBe("Commish");
    expect(v.reversed).toBe(false);
    expect(v.whenLabel).toBe("7m ago");
    expect(v.createdAtIso).toBe("2026-07-01T17:53:00.000Z");
    expect(v.delta).toBe("+5 pts");
  });

  it("falls back to email when displayName is null, and null actor → system row", () => {
    const withEmail = toAuditView(baseRow({ actor: { displayName: null, email: "x@y.com" } }), NOW);
    expect(withEmail.actorLabel).toBe("x@y.com");
    const system = toAuditView(baseRow({ actor: null }), NOW);
    expect(system.actorLabel).toBeNull();
  });

  it("marks reversed when reversedAt is set", () => {
    const v = toAuditView(baseRow({ reversedAt: new Date("2026-07-01T17:59:00.000Z") }), NOW);
    expect(v.reversed).toBe(true);
  });
});

describe("toInspector", () => {
  const option: CommishManagerOption = {
    managerId: "m1",
    displayName: "Marlon",
    isCommissioner: false,
    isViewer: false,
  };

  it("assembles record/seed/rank/qualified from the standings row + budget + roster", () => {
    const insp = toInspector(
      option,
      { w: 8, l: 3, d: 0, points: 512, seed: 4, rank: 4, qualified: true },
      73,
      [
        {
          playerId: "p1",
          name: "Player One",
          position: "FWD",
          country: "AR",
          teamName: "Argentina",
        },
      ],
    );
    expect(insp.record).toEqual({ w: 8, l: 3, d: 0, points: 512 });
    expect(insp.seed).toBe(4);
    expect(insp.rank).toBe(4);
    expect(insp.qualified).toBe(true);
    expect(insp.faabBudget).toBe(73);
    expect(insp.rosterCount).toBe(1);
    expect(insp.roster[0]!.name).toBe("Player One");
  });

  it("nulls record/seed/rank/qualified when standings are unavailable, keeps budget + roster count", () => {
    const insp = toInspector(option, null, 100, []);
    expect(insp.record).toBeNull();
    expect(insp.seed).toBeNull();
    expect(insp.rank).toBeNull();
    expect(insp.qualified).toBeNull();
    expect(insp.faabBudget).toBe(100);
    expect(insp.rosterCount).toBe(0);
  });
});

function baseRow(
  over: Partial<Parameters<typeof toAuditView>[0]>,
): Parameters<typeof toAuditView>[0] {
  return {
    id: "a1",
    actionType: "penalty_applied",
    summary: "s",
    detail: null,
    reason: null,
    delta: null,
    reversible: false,
    reversedAt: null,
    createdAt: new Date("2026-07-01T17:53:00.000Z"),
    actor: { displayName: "C", email: "c@x.com" },
    ...over,
  };
}
