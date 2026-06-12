/**
 * Exhaustive tests for buildPlayerBox. Pure function — all inputs injected, no DB or clock.
 * Covers: total == sum of scored lines, empty/not-played inputs, negative lines, nation from
 * fixture join, section grouping, tracked stats, state derivation, season passthrough.
 */
import { describe, expect, it } from "vitest";
import { buildPlayerBox } from "./buildPlayerBox";
import type { BuildPlayerBoxInput, PlayerBoxFixtureInput, PlayerBoxPlayerInput } from "./types";

// ─── fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-18T20:00:00Z");

const BASE_PLAYER: PlayerBoxPlayerInput = {
  id: "p1",
  displayName: "Marcus Rashford",
  firstName: "Marcus",
  lastName: "Rashford",
  position: "FWD",
  nation: "England",
  teamId: "eng",
};

const BASE_FIXTURE: PlayerBoxFixtureInput = {
  kickoffAt: new Date("2026-06-18T18:00:00Z"),
  status: "completed",
  homeTeamId: "eng",
  awayTeamId: "usa",
  homeTeamName: "England",
  awayTeamName: "USA",
};

function makeInput(overrides: Partial<BuildPlayerBoxInput> = {}): BuildPlayerBoxInput {
  return {
    player: BASE_PLAYER,
    fixture: BASE_FIXTURE,
    score: {
      points: 8,
      breakdown: {
        total: 8,
        lines: [
          { category: "rating", points: 2, detail: "rating 7.8 (scrape) → +2" },
          { category: "appearance", points: 2, detail: "played 90 min → +2" },
          { category: "goals", points: 4, detail: "1 goal as FWD → +4" },
        ],
      },
    },
    stats: {
      minutesPlayed: 90,
      goals: 1,
      assists: 0,
      keyPasses: 3,
      dribblesAttempted: 4,
      dribblesCompleted: 2,
      duelsWon: 5,
      duelsLost: 3,
      passesTotal: 42,
      passesAccurate: 38,
      longBallsTotal: 6,
      longBallsAccurate: 4,
      wasFouled: 2,
      clearances: 0,
      interceptions: 1,
      tacklesWon: 2,
      blockedShots: 0,
      saves: null,
      savesInsideBox: null,
      punches: null,
      highClaims: null,
      possessionLost: 5,
    },
    now: NOW,
    ...overrides,
  };
}

// ─── total == sum of scored lines (the honesty contract) ──────────────────────

describe("buildPlayerBox — total integrity", () => {
  it("header.periodTotal equals breakdown.total", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.header.periodTotal).toBe(8);
    expect(v.header.periodTotal).toBe(
      v.sections.flatMap((s) => s.lines).reduce((a, l) => a + l.points, 0),
    );
  });

  it("periodTotal matches sum for a large realistic breakdown", () => {
    const input = makeInput({
      score: {
        points: 14,
        breakdown: {
          total: 14,
          lines: [
            { category: "rating", points: 3 },
            { category: "appearance", points: 2 },
            { category: "goals", points: 4 },
            { category: "assists", points: 3 },
            { category: "tackles_won", points: 1 },
            { category: "yellow_card", points: -1 },
            { category: "dribbles", points: 2 },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const sumFromLines = v.sections.flatMap((s) => s.lines).reduce((a, l) => a + l.points, 0);
    expect(v.header.periodTotal).toBe(14);
    expect(sumFromLines).toBe(14);
  });

  it("periodTotal is 0 when no score row (not-yet-played)", () => {
    const v = buildPlayerBox(makeInput({ score: null }));
    expect(v.header.periodTotal).toBe(0);
  });

  it("periodTotal is 0 when score.points is 0", () => {
    const input = makeInput({
      score: { points: 0, breakdown: { total: 0, lines: [] } },
    });
    const v = buildPlayerBox(input);
    expect(v.header.periodTotal).toBe(0);
    expect(v.sections).toHaveLength(0);
  });
});

// ─── empty / not-yet-played states ───────────────────────────────────────────

describe("buildPlayerBox — empty states", () => {
  it("returns state=not-started when fixture is scheduled", () => {
    const v = buildPlayerBox(
      makeInput({
        score: null,
        fixture: { ...BASE_FIXTURE, status: "scheduled" },
      }),
    );
    expect(v.state).toBe("not-started");
    expect(v.sections).toHaveLength(0);
  });

  it("returns state=in-progress-no-score when match in progress but no score row", () => {
    const v = buildPlayerBox(
      makeInput({
        score: null,
        fixture: { ...BASE_FIXTURE, status: "in_progress" },
      }),
    );
    expect(v.state).toBe("in-progress-no-score");
    expect(v.sections).toHaveLength(0);
  });

  it("returns state=in-progress when match in progress + score row exists", () => {
    const v = buildPlayerBox(makeInput({ fixture: { ...BASE_FIXTURE, status: "in_progress" } }));
    expect(v.state).toBe("in-progress");
  });

  it("returns state=played when match completed", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.state).toBe("played");
  });

  it("returns state=no-fixture when fixture is null", () => {
    const v = buildPlayerBox(makeInput({ fixture: null }));
    expect(v.state).toBe("no-fixture");
    expect(v.header.fixture).toBeNull();
  });

  it("sections is empty when score.breakdown.lines is empty", () => {
    const input = makeInput({
      score: { points: 0, breakdown: { total: 0, lines: [] } },
    });
    const v = buildPlayerBox(input);
    expect(v.sections).toHaveLength(0);
  });

  it("trackedStats is empty when stats is null", () => {
    const v = buildPlayerBox(makeInput({ stats: null }));
    expect(v.trackedStats).toHaveLength(0);
  });
});

// ─── negative lines (cards, own goals) ───────────────────────────────────────

describe("buildPlayerBox — negative lines", () => {
  it("renders negative points signed correctly", () => {
    const input = makeInput({
      score: {
        points: 1,
        breakdown: {
          total: 1,
          lines: [
            { category: "appearance", points: 2 },
            { category: "yellow_card", points: -1, detail: "booked 34'" },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const discLines = v.sections.find((s) => s.sectionLabel === "Discipline")?.lines ?? [];
    expect(discLines).toHaveLength(1);
    expect(discLines[0]?.points).toBe(-1);
    expect(discLines[0]?.detail).toBe("booked 34'");
    expect(v.header.periodTotal).toBe(1);
  });

  it("red card with own goal aggregates to correct total", () => {
    const input = makeInput({
      score: {
        points: -3,
        breakdown: {
          total: -3,
          lines: [
            { category: "red_card", points: -3, detail: "straight red 72'" },
            { category: "own_goal", points: -4, detail: "own goal 45'" },
            { category: "appearance", points: 2 },
            { category: "goals", points: 2 },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const sum = v.sections.flatMap((s) => s.lines).reduce((a, l) => a + l.points, 0);
    expect(sum).toBe(v.header.periodTotal);
    expect(sum).toBe(-3);
  });
});

// ─── nation from the fifa_team join ─────────────────────────────────────────

describe("buildPlayerBox — nation", () => {
  it("nation comes from player.nation (not player.country)", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.header.nation).toBe("England");
  });

  it("nation is null when team join is missing", () => {
    const input = makeInput({
      player: { ...BASE_PLAYER, nation: null },
    });
    const v = buildPlayerBox(input);
    expect(v.header.nation).toBeNull();
  });
});

// ─── short name ──────────────────────────────────────────────────────────────

describe("buildPlayerBox — shortName", () => {
  it("formats as F. Surname when both names present", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.header.shortName).toBe("M. Rashford");
  });

  it("falls back to lastName when firstName is null", () => {
    const input = makeInput({ player: { ...BASE_PLAYER, firstName: null } });
    const v = buildPlayerBox(input);
    expect(v.header.shortName).toBe("Rashford");
  });

  it("falls back to displayName when both name parts are null", () => {
    const input = makeInput({
      player: { ...BASE_PLAYER, firstName: null, lastName: null },
    });
    const v = buildPlayerBox(input);
    expect(v.header.shortName).toBe("Marcus Rashford");
  });
});

// ─── fixture view ─────────────────────────────────────────────────────────────

describe("buildPlayerBox — fixture view", () => {
  it("minuteLabel is FT for completed match", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.header.fixture?.minuteLabel).toBe("FT");
  });

  it("minuteLabel is KO soon for scheduled match", () => {
    const v = buildPlayerBox(makeInput({ fixture: { ...BASE_FIXTURE, status: "scheduled" } }));
    expect(v.header.fixture?.minuteLabel).toBe("KO soon");
  });

  it("minuteLabel is approximate minute for in-progress match", () => {
    // kickoff was 35 min ago
    const kickoffAt = new Date(NOW.getTime() - 35 * 60_000);
    const v = buildPlayerBox(
      makeInput({
        fixture: { ...BASE_FIXTURE, status: "in_progress", kickoffAt },
      }),
    );
    expect(v.header.fixture?.minuteLabel).toBe("35'");
  });

  it("caps approximate minute at 90", () => {
    // kickoff was 120 min ago
    const kickoffAt = new Date(NOW.getTime() - 120 * 60_000);
    const v = buildPlayerBox(
      makeInput({
        fixture: { ...BASE_FIXTURE, status: "in_progress", kickoffAt },
      }),
    );
    expect(v.header.fixture?.minuteLabel).toBe("90'");
  });

  it("isHome true when player teamId matches homeTeamId", () => {
    const v = buildPlayerBox(makeInput()); // teamId="eng", homeTeamId="eng"
    expect(v.header.fixture?.isHome).toBe(true);
  });

  it("isHome false when player teamId matches awayTeamId", () => {
    const input = makeInput({ player: { ...BASE_PLAYER, teamId: "usa" } });
    const v = buildPlayerBox(input);
    expect(v.header.fixture?.isHome).toBe(false);
  });

  it("isHome false when teamId is null", () => {
    const input = makeInput({ player: { ...BASE_PLAYER, teamId: null } });
    const v = buildPlayerBox(input);
    expect(v.header.fixture?.isHome).toBe(false);
  });
});

// ─── section grouping ─────────────────────────────────────────────────────────

describe("buildPlayerBox — section grouping", () => {
  it("groups lines into SCORING.md sections in §1→§8 order", () => {
    const input = makeInput({
      score: {
        points: 5,
        breakdown: {
          total: 5,
          lines: [
            { category: "yellow_card", points: -1 },
            { category: "goals", points: 4 },
            { category: "rating", points: 2 },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const labels = v.sections.map((s) => s.sectionLabel);
    expect(labels).toEqual(["Performance Rating", "Attacking", "Discipline"]);
  });

  it("multiple lines within same section appear together", () => {
    const input = makeInput({
      score: {
        points: 10,
        breakdown: {
          total: 10,
          lines: [
            { category: "goals", points: 4 },
            { category: "assists", points: 3 },
            { category: "rating", points: 3 },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const attackSection = v.sections.find((s) => s.sectionLabel === "Attacking");
    expect(attackSection?.lines).toHaveLength(2);
    expect(attackSection?.lines.map((l) => l.category)).toEqual(["goals", "assists"]);
  });

  it("renders detail verbatim from ScoreLine.detail", () => {
    const v = buildPlayerBox(makeInput());
    const ratingLine = v.sections.flatMap((s) => s.lines).find((l) => l.category === "rating");
    expect(ratingLine?.detail).toBe("rating 7.8 (scrape) → +2");
  });

  it("detail is null when ScoreLine.detail is absent", () => {
    const input = makeInput({
      score: {
        points: 2,
        breakdown: {
          total: 2,
          lines: [{ category: "appearance", points: 2 }],
        },
      },
    });
    const v = buildPlayerBox(input);
    const appLine = v.sections.flatMap((s) => s.lines).find((l) => l.category === "appearance");
    expect(appLine?.detail).toBeNull();
  });

  it("unknown category keys are skipped gracefully", () => {
    const input = makeInput({
      score: {
        points: 3,
        breakdown: {
          total: 3,
          lines: [
            { category: "appearance", points: 2 },
            { category: "__future_cat__", points: 1 },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const allCategories = v.sections.flatMap((s) => s.lines).map((l) => l.category);
    expect(allCategories).not.toContain("__future_cat__");
    expect(allCategories).toContain("appearance");
  });
});

// ─── tracked stats ────────────────────────────────────────────────────────────

describe("buildPlayerBox — tracked stats", () => {
  it("includes minutes played when present", () => {
    const v = buildPlayerBox(makeInput());
    const mins = v.trackedStats.find((r) => r.label === "Minutes played");
    expect(mins?.count).toBe(90);
  });

  it("includes dribbles attempted and duels lost as unscored context", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.trackedStats.find((r) => r.label === "Dribbles attempted")?.count).toBe(4);
    expect(v.trackedStats.find((r) => r.label === "Duels lost")?.count).toBe(3);
  });

  it("omits stats with null or zero values", () => {
    const input = makeInput({
      stats: {
        minutesPlayed: 45,
        goals: null,
        assists: null,
        keyPasses: null,
        dribblesAttempted: 0,
        dribblesCompleted: null,
        duelsWon: null,
        duelsLost: null,
        passesTotal: null,
        passesAccurate: null,
        longBallsTotal: null,
        longBallsAccurate: null,
        wasFouled: null,
        clearances: null,
        interceptions: null,
        tacklesWon: null,
        blockedShots: null,
        saves: null,
        savesInsideBox: null,
        punches: null,
        highClaims: null,
        possessionLost: null,
      },
    });
    const v = buildPlayerBox(input);
    expect(v.trackedStats).toHaveLength(1); // only minutesPlayed
    expect(v.trackedStats[0]?.label).toBe("Minutes played");
  });
});

// ─── season passthrough ───────────────────────────────────────────────────────

describe("buildPlayerBox — season", () => {
  it("season is null by default (server injects when available)", () => {
    const v = buildPlayerBox(makeInput());
    expect(v.season).toBeNull();
  });
});

// ─── GK-specific categories ──────────────────────────────────────────────────

describe("buildPlayerBox — GK categories", () => {
  it("groups save lines into Goalkeeping section", () => {
    const gkPlayer: PlayerBoxPlayerInput = {
      ...BASE_PLAYER,
      position: "GK",
      displayName: "Alisson Becker",
      firstName: "Alisson",
      lastName: "Becker",
    };
    const input = makeInput({
      player: gkPlayer,
      score: {
        points: 12,
        breakdown: {
          total: 12,
          lines: [
            { category: "rating", points: 3 },
            { category: "appearance", points: 2 },
            { category: "clean_sheet", points: 4 },
            { category: "save_inside_box", points: 2, detail: "4 saves ÷ 2 = +2" },
            { category: "save_outside_box", points: 1, detail: "3 saves ÷ 3 = +1" },
          ],
        },
      },
    });
    const v = buildPlayerBox(input);
    const gkSection = v.sections.find((s) => s.sectionLabel === "Goalkeeping");
    expect(gkSection?.lines).toHaveLength(2);
    expect(gkSection?.lines.map((l) => l.category)).toEqual([
      "save_inside_box",
      "save_outside_box",
    ]);
    const roleSection = v.sections.find((s) => s.sectionLabel === "Role Outcomes");
    expect(roleSection?.lines.find((l) => l.category === "clean_sheet")).toBeTruthy();
  });
});
