import { describe, it, expect } from "vitest";
import {
  mapStatLine,
  mapEvent,
  mapShot,
  mapRating,
  mapMatchRow,
  derivePeriodLabel,
  normalizeStatus,
  mapPosition,
} from "./map";

describe("mapPosition", () => {
  it("maps the feed's single-letter codes (G/D/M/F) to the Position enum", () => {
    expect(mapPosition("G")).toBe("GK");
    expect(mapPosition("D")).toBe("DEF");
    expect(mapPosition("M")).toBe("MID");
    expect(mapPosition("F")).toBe("FWD");
  });
  it("is case-insensitive and trims", () => {
    expect(mapPosition("g")).toBe("GK");
    expect(mapPosition(" f ")).toBe("FWD");
  });
  it("falls back to MID for null/empty/unknown codes (defensive; all 2026 rows are G/D/M/F)", () => {
    expect(mapPosition(null)).toBe("MID");
    expect(mapPosition(undefined)).toBe("MID");
    expect(mapPosition("")).toBe("MID");
    expect(mapPosition("X")).toBe("MID");
  });
});

describe("mapStatLine", () => {
  it("maps every consumed column and leaves absent fields null", () => {
    const row = mapStatLine({
      match_id: 1,
      player_id: 2,
      minutes_played: 90,
      goals: 1,
      saves: 3,
      saves_inside_box: 2,
    });
    expect(row).toMatchObject({
      matchBdlId: 1,
      playerBdlId: 2,
      minutesPlayed: 90,
      goals: 1,
      saves: 3,
      savesInsideBox: 2,
    });
    expect(row.assists).toBeNull();
    expect(row.possessionLost).toBeNull();
  });
});

describe("mapRating", () => {
  it("extracts the native balldontlie rating (null when absent)", () => {
    expect(mapRating({ match_id: 1, player_id: 2, rating: 7.4 })).toEqual({
      matchBdlId: 1,
      playerBdlId: 2,
      rating: 7.4,
    });
    expect(mapRating({ match_id: 1, player_id: 2 }).rating).toBeNull();
  });
});

describe("mapShot", () => {
  it("derives is_penalty from situation==='penalty' and preserves shot_type/situation", () => {
    const pen = mapShot({
      id: 5,
      match_id: 1,
      player_id: 2,
      shot_type: "goal",
      situation: "penalty",
      minute: 30,
    });
    expect(pen).toMatchObject({
      bdlId: 5,
      isPenalty: true,
      shotType: "goal",
      situation: "penalty",
      minute: 30,
    });
    const open = mapShot({
      id: 6,
      match_id: 1,
      player_id: 2,
      shot_type: "save",
      situation: "open_play",
    });
    expect(open.isPenalty).toBe(false);
  });
});

describe("mapEvent", () => {
  it("carries incident_class through verbatim (no pre-collapsing)", () => {
    const e = mapEvent({
      id: 9,
      match_id: 1,
      incident_type: "card",
      incident_class: "yellowRed",
      time_minute: 75,
      added_time: 2,
      player_id: 4,
    });
    expect(e).toMatchObject({
      bdlId: 9,
      incidentType: "card",
      incidentClass: "yellowRed",
      timeMinute: 75,
      addedTime: 2,
    });
  });
});

describe("normalizeStatus", () => {
  it("normalizes feed status strings to the MatchStatus vocabulary", () => {
    expect(normalizeStatus("In Progress")).toBe("in_progress");
    expect(normalizeStatus("Finished")).toBe("completed");
    expect(normalizeStatus("Scheduled")).toBe("scheduled");
    expect(normalizeStatus("Postponed")).toBe("postponed");
  });
});

describe("mapMatchRow", () => {
  it("maps nested teams/stage/group + renamed ET/penalty fields and normalizes status", () => {
    const row = mapMatchRow({
      id: 100,
      status: "completed",
      datetime: "2026-06-10T18:00:00Z",
      stage: { id: 7, name: "Final" },
      round_name: "Final",
      home_team: { id: 1, name: "Mexico" },
      away_team: { id: 2, name: "Brazil" },
      home_score: 2,
      away_score: 1,
      extra_time_home_score: 2,
      extra_time_away_score: 2,
      home_score_penalties: 4,
      away_score_penalties: 3,
    });
    expect(row).toMatchObject({
      bdlId: 100,
      kickoffAtIso: "2026-06-10T18:00:00Z",
      status: "completed",
      round: "Final",
      stage: "Final",
      homeTeamBdlId: 1,
      awayTeamBdlId: 2,
      homeScore: 2,
      awayScore: 1,
      homeScoreEt: 2,
      awayScoreEt: 2,
      homeScorePens: 4,
      awayScorePens: 3,
    });
  });

  it("uses round_number for the label and tolerates absent teams (knockout TBD)", () => {
    const row = mapMatchRow({
      id: 101,
      status: "scheduled",
      datetime: "2026-06-12T18:00:00Z",
      stage: { id: 1, name: "Group Stage" },
      group: { id: 1, name: "Group A" },
      round_number: 2,
    });
    expect(row).toMatchObject({
      bdlId: 101,
      round: "2",
      stage: "Group Stage",
      group: "Group A",
      homeTeamBdlId: null,
      awayTeamBdlId: null,
    });
  });
});

describe("derivePeriodLabel", () => {
  it("maps each knockout stage name to its canonical label", () => {
    const ko = (name: string) =>
      derivePeriodLabel({ id: 1, status: "scheduled", datetime: "x", stage: { id: 1, name } });
    expect(ko("Round of 32")).toEqual({ kind: "knockout_round", label: "R32" });
    expect(ko("Round of 16")).toEqual({ kind: "knockout_round", label: "R16" });
    expect(ko("Quarter-finals")).toEqual({ kind: "knockout_round", label: "QF" });
    expect(ko("Semi-finals")).toEqual({ kind: "knockout_round", label: "SF" });
    expect(ko("Final")).toEqual({ kind: "knockout_round", label: "Final" });
  });

  it("maps a group fixture to MD{round_number}", () => {
    expect(
      derivePeriodLabel({
        id: 1,
        status: "scheduled",
        datetime: "x",
        stage: { id: 1, name: "Group Stage" },
        group: { id: 1, name: "Group A" },
        round_number: 1,
      }),
    ).toEqual({ kind: "group_md", label: "MD1" });
    expect(
      derivePeriodLabel({
        id: 1,
        status: "scheduled",
        datetime: "x",
        stage: { id: 1, name: "Group Stage" },
        round_number: 3,
      }),
    ).toEqual({ kind: "group_md", label: "MD3" });
  });

  it("returns null for a group fixture with no round_number", () => {
    expect(
      derivePeriodLabel({
        id: 1,
        status: "scheduled",
        datetime: "x",
        stage: { id: 1, name: "Group Stage" },
      }),
    ).toBeNull();
  });

  it("falls back to round_name when the stage name isn't a clean knockout label", () => {
    expect(
      derivePeriodLabel({
        id: 1,
        status: "scheduled",
        datetime: "x",
        stage: { id: 9, name: "Knockout Stage" },
        round_name: "Round of 16",
      }),
    ).toEqual({ kind: "knockout_round", label: "R16" });
  });
});
