/**
 * Unit tests for the PURE tournament-stats builder (Prompt 54, Part A). Covers the load-bearing
 * guarantees: position-aware tile/line selection (mirrors the design's PC_TILEKEYS/PC_LINEKEYS),
 * NULL-safety (null columns → 0 in totals, null line cells — never NaN/throw), totals math,
 * ascending order, scoreline orientation, and the empty-input case.
 */
import { describe, it, expect } from "vitest";
import type { Position } from "@app/shared";
import {
  buildPlayerTournamentStats,
  type PlayerTournamentMatchInput,
  type TournamentStatLine,
} from "./buildPlayerTournamentStats";

const FULL_STATS: TournamentStatLine = {
  minutesPlayed: 90,
  goals: 1,
  assists: 1,
  keyPasses: 2,
  tacklesWon: 3,
  dribblesCompleted: 4,
  saves: 5,
  shotsOnTarget: 2,
};

const NULL_STATS: TournamentStatLine = {
  minutesPlayed: null,
  goals: null,
  assists: null,
  keyPasses: null,
  tacklesWon: null,
  dribblesCompleted: null,
  saves: null,
  shotsOnTarget: null,
};

function row(overrides: Partial<PlayerTournamentMatchInput> = {}): PlayerTournamentMatchInput {
  return {
    periodLabel: "MD1",
    periodOrder: 1,
    kickoff: new Date("2026-06-11T18:00:00Z"),
    opponentTeamName: "Brazil",
    isHome: true,
    homeScore: 2,
    awayScore: 0,
    points: 8,
    stats: { ...FULL_STATS },
    ...overrides,
  };
}

const keys = (cells: ReadonlyArray<{ key: string }>) => cells.map((c) => c.key);
const labels = (cells: ReadonlyArray<{ label: string }>) => cells.map((c) => c.label);

describe("buildPlayerTournamentStats — position-aware tile/line selection", () => {
  const cases: Record<
    Position,
    { tileKeys: string[]; tileLabels: string[]; lineKeys: string[]; lineLabels: string[] }
  > = {
    GK: {
      tileKeys: ["matches", "saves", "cleanSheets", "conceded", "points"],
      tileLabels: ["Matches", "Saves", "Clean sheets", "Conceded", "Points"],
      lineKeys: ["saves", "conceded", "cleanSheets"],
      lineLabels: ["SV", "GA", "CS"],
    },
    DEF: {
      tileKeys: ["matches", "goals", "assists", "cleanSheets", "points"],
      tileLabels: ["Matches", "Goals", "Assists", "Clean sheets", "Points"],
      lineKeys: ["goals", "assists", "tackles", "cleanSheets"],
      lineLabels: ["G", "A", "TKL", "CS"],
    },
    MID: {
      tileKeys: ["matches", "goals", "assists", "keyPasses", "points"],
      tileLabels: ["Matches", "Goals", "Assists", "Key passes", "Points"],
      lineKeys: ["goals", "assists", "keyPasses", "tackles"],
      lineLabels: ["G", "A", "KP", "TKL"],
    },
    FWD: {
      tileKeys: ["matches", "goals", "assists", "shots", "points"],
      tileLabels: ["Matches", "Goals", "Assists", "Shots", "Points"],
      lineKeys: ["goals", "assists", "shots", "dribbles"],
      lineLabels: ["G", "A", "SH", "DRB"],
    },
  };

  (Object.keys(cases) as Position[]).forEach((position) => {
    it(`${position}: 5 tiles + correct line keys`, () => {
      const out = buildPlayerTournamentStats({ position, rows: [row()] });
      expect(keys(out.tiles)).toEqual(cases[position].tileKeys);
      expect(labels(out.tiles)).toEqual(cases[position].tileLabels);
      expect(out.tiles).toHaveLength(5);
      expect(keys(out.games[0]!.lines)).toEqual(cases[position].lineKeys);
      expect(labels(out.games[0]!.lines)).toEqual(cases[position].lineLabels);
    });
  });

  it("FWD Shots tile sources shots_on_target (not raw shots)", () => {
    const out = buildPlayerTournamentStats({
      position: "FWD",
      rows: [row({ stats: { ...FULL_STATS, shotsOnTarget: 7 } })],
    });
    const shotsTile = out.tiles.find((t) => t.key === "shots");
    expect(shotsTile?.value).toBe(7);
  });
});

describe("buildPlayerTournamentStats — NULL-safety", () => {
  it("null stat columns → 0 in totals/tiles and null line cells (never NaN/throw)", () => {
    const out = buildPlayerTournamentStats({
      position: "MID",
      // scores present so the match is real, but every stat column is null (the live duels NULL issue).
      rows: [
        row({ stats: { ...NULL_STATS }, homeScore: 1, awayScore: 1, isHome: true, points: 2 }),
      ],
    });

    // Totals: null columns summed as 0; points still counted.
    expect(out.totals.goals).toBe(0);
    expect(out.totals.assists).toBe(0);
    expect(out.totals.keyPasses).toBe(0);
    expect(out.totals.tackles).toBe(0);
    expect(out.totals.points).toBe(2);
    for (const tile of out.tiles) expect(Number.isNaN(tile.value)).toBe(false);

    // Line cells: a null source column → null value (renders "—").
    const byKey = Object.fromEntries(out.games[0]!.lines.map((l) => [l.key, l.value]));
    expect(byKey.goals).toBeNull();
    expect(byKey.assists).toBeNull();
    expect(byKey.keyPasses).toBeNull();
    expect(byKey.tackles).toBeNull();
    expect(out.games[0]!.minutes).toBeNull();
  });

  it("null scores → scoreline/result/conceded/cleanSheet null, totals still finite", () => {
    const out = buildPlayerTournamentStats({
      position: "GK",
      rows: [row({ homeScore: null, awayScore: null, stats: { ...FULL_STATS } })],
    });
    const g = out.games[0]!;
    expect(g.scoreline).toBeNull();
    expect(g.result).toBeNull();
    const byKey = Object.fromEntries(g.lines.map((l) => [l.key, l.value]));
    expect(byKey.conceded).toBeNull();
    expect(byKey.cleanSheets).toBeNull();
    expect(byKey.saves).toBe(5); // a non-null stat still renders
    expect(out.totals.conceded).toBe(0);
    expect(out.totals.cleanSheets).toBe(0);
    expect(Number.isNaN(out.totals.conceded)).toBe(false);
  });
});

describe("buildPlayerTournamentStats — totals math + match count", () => {
  it("sums points/goals/assists across rows and matches = rows.length", () => {
    const out = buildPlayerTournamentStats({
      position: "FWD",
      rows: [
        row({
          periodLabel: "MD1",
          periodOrder: 1,
          points: 5,
          stats: { ...FULL_STATS, goals: 1, assists: 0 },
        }),
        row({
          periodLabel: "MD2",
          periodOrder: 2,
          points: 9,
          stats: { ...FULL_STATS, goals: 2, assists: 1 },
        }),
      ],
    });
    expect(out.totals.matches).toBe(2);
    expect(out.totals.points).toBe(14);
    expect(out.totals.goals).toBe(3);
    expect(out.totals.assists).toBe(1);
    expect(out.games).toHaveLength(2);
  });

  it("clean sheet derived: conceded 0 AND ≥60' → 1; conceded > 0 → 0", () => {
    const cs = buildPlayerTournamentStats({
      position: "DEF",
      rows: [
        row({
          homeScore: 1,
          awayScore: 0,
          isHome: true,
          stats: { ...FULL_STATS, minutesPlayed: 90 },
        }),
      ],
    });
    expect(cs.totals.cleanSheets).toBe(1);

    const noCs = buildPlayerTournamentStats({
      position: "DEF",
      rows: [
        row({
          homeScore: 1,
          awayScore: 2,
          isHome: true,
          stats: { ...FULL_STATS, minutesPlayed: 90 },
        }),
      ],
    });
    expect(noCs.totals.cleanSheets).toBe(0);

    const sub = buildPlayerTournamentStats({
      position: "DEF",
      rows: [
        row({
          homeScore: 1,
          awayScore: 0,
          isHome: true,
          stats: { ...FULL_STATS, minutesPlayed: 45 },
        }),
      ],
    });
    expect(sub.totals.cleanSheets).toBe(0); // played < 60'
  });
});

describe("buildPlayerTournamentStats — ascending order", () => {
  it("MD2 before MD1 in input → MD1 first in output", () => {
    const out = buildPlayerTournamentStats({
      position: "MID",
      rows: [
        row({ periodLabel: "MD2", periodOrder: 2 }),
        row({ periodLabel: "MD1", periodOrder: 1 }),
      ],
    });
    expect(out.games.map((g) => g.periodLabel)).toEqual(["MD1", "MD2"]);
  });

  it("within the same period, earlier kickoff sorts first", () => {
    const out = buildPlayerTournamentStats({
      position: "MID",
      rows: [
        row({
          periodLabel: "MD1",
          periodOrder: 1,
          kickoff: new Date("2026-06-11T21:00:00Z"),
          opponentTeamName: "Late",
        }),
        row({
          periodLabel: "MD1",
          periodOrder: 1,
          kickoff: new Date("2026-06-11T15:00:00Z"),
          opponentTeamName: "Early",
        }),
      ],
    });
    expect(out.games.map((g) => g.opponentTeamName)).toEqual(["Early", "Late"]);
  });
});

describe("buildPlayerTournamentStats — scoreline orientation + flag", () => {
  it("home: scoreline = for–against, result W; opponent flag from team name", () => {
    const out = buildPlayerTournamentStats({
      position: "FWD",
      rows: [row({ isHome: true, homeScore: 2, awayScore: 0, opponentTeamName: "Brazil" })],
    });
    expect(out.games[0]!.scoreline).toBe("2–0");
    expect(out.games[0]!.result).toBe("W");
    expect(out.games[0]!.opponentIso2).toBe("BR");
  });

  it("away: scoreline is flipped to the player's perspective, result L", () => {
    const out = buildPlayerTournamentStats({
      position: "FWD",
      rows: [row({ isHome: false, homeScore: 2, awayScore: 0, opponentTeamName: "Argentina" })],
    });
    expect(out.games[0]!.scoreline).toBe("0–2");
    expect(out.games[0]!.result).toBe("L");
    expect(out.games[0]!.isHome).toBe(false);
  });

  it("a draw resolves to result D", () => {
    const out = buildPlayerTournamentStats({
      position: "FWD",
      rows: [row({ isHome: true, homeScore: 1, awayScore: 1 })],
    });
    expect(out.games[0]!.result).toBe("D");
  });
});

describe("buildPlayerTournamentStats — empty input", () => {
  it("zero rows → empty games, zeroed totals, 5 tiles, no throw", () => {
    const out = buildPlayerTournamentStats({ position: "GK", rows: [] });
    expect(out.games).toEqual([]);
    expect(out.totals.matches).toBe(0);
    expect(out.totals.points).toBe(0);
    expect(out.tiles).toHaveLength(5);
    expect(out.tiles.every((t) => t.value === 0)).toBe(true);
  });
});
