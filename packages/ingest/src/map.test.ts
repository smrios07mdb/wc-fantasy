import { describe, it, expect } from "vitest";
import {
  mapStatLine,
  mapEvent,
  mapShot,
  mapRating,
  mapTeamStat,
  mapMatchRow,
  derivePeriodLabel,
  normalizeStatus,
  mapPosition,
} from "./map";
import { FeedShapeMismatchError } from "./errors";

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

  it("throws FeedShapeMismatchError when a structurally-required id is missing", () => {
    expect(() => mapStatLine({ match_id: 1 } as never)).toThrow(FeedShapeMismatchError);
    expect(() => mapStatLine({ player_id: 2 } as never)).toThrow(/match_id/);
  });

  it("retains un-promoted feed fields verbatim in `extra` (incl. an unknown forward-compat field)", () => {
    const row = mapStatLine({
      match_id: 1,
      player_id: 2,
      // identity / separate-path — must NOT land in extra
      team_id: 7,
      is_home: true,
      rating: 7.8,
      // promoted columns — handled by their own columns, must NOT land in extra
      goals: 1,
      possession_lost: 9,
      // un-promoted feed fields — these ARE the payload extra exists for
      expected_goals: 0.42,
      expected_assists: 0.1,
      shots_on_target: 3,
      crosses_total: 5,
      crosses_accurate: 2,
      tackles: 4,
      aerial_duels_won: 6,
      aerial_duels_lost: 1,
      fouls_committed: 2,
      touches: 88,
      ball_recoveries: 7,
      big_chances_created: 1,
      big_chances_missed: 0,
      // a field the feed didn't have when this code was written — must survive untouched
      teleport_assists: 3,
    } as never);

    // every un-promoted field is present with its exact value
    expect(row.extra).toEqual({
      expected_goals: 0.42,
      expected_assists: 0.1,
      shots_on_target: 3,
      crosses_total: 5,
      crosses_accurate: 2,
      tackles: 4,
      aerial_duels_won: 6,
      aerial_duels_lost: 1,
      fouls_committed: 2,
      touches: 88,
      ball_recoveries: 7,
      big_chances_created: 1,
      big_chances_missed: 0,
      teleport_assists: 3, // forward-compat: an unknown field is retained
    });
    // no promoted column nor identity field leaks into extra
    for (const leaked of [
      "match_id",
      "player_id",
      "team_id",
      "is_home",
      "rating",
      "goals",
      "possession_lost",
    ]) {
      expect(row.extra).not.toHaveProperty(leaked);
    }
  });

  it("keeps an explicit null value but omits keys the feed didn't send", () => {
    const row = mapStatLine({
      match_id: 1,
      player_id: 2,
      expected_goals: null, // sent, but null → retained as null
      // shots_on_target absent → must NOT appear as a key
    } as never);
    expect(row.extra).toEqual({ expected_goals: null });
    expect(row.extra).not.toHaveProperty("shots_on_target");
  });

  it("returns null `extra` when only promoted + identity keys are present", () => {
    const row = mapStatLine({
      match_id: 1,
      player_id: 2,
      team_id: 7,
      is_home: false,
      rating: 6.5,
      minutes_played: 90,
      goals: 0,
      saves: 4,
      possession_lost: 12,
    });
    expect(row.extra).toBeNull();
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
  it("sources the minute from time_minute (NOT a flat `minute`) and derives is_penalty from situation", () => {
    // Documented GOAT /shots shape: time_minute, time_seconds, xg/xgot, body_part, goal_type, coords.
    const pen = mapShot({
      id: 5073,
      match_id: 1030,
      player_id: 8760,
      team_id: 20,
      is_home: false,
      shot_type: "goal",
      situation: "penalty",
      body_part: "right-foot",
      goal_type: "penalty",
      xg: 0.7884,
      xgot: 0.9937,
      time_minute: 16,
      added_time: null,
      time_seconds: 949,
    });
    expect(pen).toMatchObject({
      bdlId: 5073,
      matchBdlId: 1030,
      playerBdlId: 8760,
      isPenalty: true,
      shotType: "goal",
      situation: "penalty",
      minute: 16,
    });
    const open = mapShot({
      id: 6,
      match_id: 1,
      player_id: 2,
      shot_type: "save",
      situation: "open_play",
    });
    expect(open.isPenalty).toBe(false);
    expect(open.minute).toBeNull();
  });

  it("throws FeedShapeMismatchError when a structurally-required id is missing", () => {
    expect(() => mapShot({ match_id: 1 } as never)).toThrow(FeedShapeMismatchError);
    expect(() => mapShot({ id: 5 } as never)).toThrow(/match_id/);
  });
});

describe("mapEvent", () => {
  it("extracts ?.id from the NESTED player/assist/in/out objects and carries incident_class verbatim", () => {
    // Documented GOAT /events shape: player et al. are nested objects, NOT flat *_id fields.
    const e = mapEvent({
      id: 3713,
      match_id: 1030,
      incident_type: "goal",
      incident_class: "penalty",
      time_minute: 16,
      added_time: null,
      period: null,
      is_home: false,
      player: { id: 8760, name: "Enner Valencia", position: "F", country_code: "ECU" },
      assist_player: null,
      player_in: null,
      player_out: null,
      home_score: 0,
      away_score: 1,
      rescinded: null,
    });
    expect(e).toMatchObject({
      bdlId: 3713,
      matchBdlId: 1030,
      incidentType: "goal",
      incidentClass: "penalty",
      timeMinute: 16,
      playerBdlId: 8760,
      assistPlayerBdlId: null,
      playerInBdlId: null,
      playerOutBdlId: null,
      rescinded: false,
    });
  });

  it("extracts the substitution in/out player ids from their nested objects", () => {
    const e = mapEvent({
      id: 900,
      match_id: 50,
      incident_type: "substitution",
      player: null,
      player_in: { id: 7, name: "Sub In" },
      player_out: { id: 2, name: "Sub Out" },
      time_minute: 61,
      added_time: 1,
    });
    expect(e).toMatchObject({ playerInBdlId: 7, playerOutBdlId: 2, playerBdlId: null });
  });

  it("throws FeedShapeMismatchError on the OLD flat shape (a raw number where a nested object is documented)", () => {
    // Guards against silently reverting to the pre-fix flat-id reads.
    expect(() =>
      mapEvent({ id: 9, match_id: 1, incident_type: "goal", player: 4 } as never),
    ).toThrow(FeedShapeMismatchError);
  });

  it("throws FeedShapeMismatchError when incident_type is missing", () => {
    expect(() => mapEvent({ id: 9, match_id: 1 } as never)).toThrow(/incident_type/);
  });
});

describe("mapTeamStat", () => {
  it("sources possession from possession_pct (NOT a flat `possession`) and maps offsides/shots_blocked", () => {
    // Documented GOAT /team-stats shape: possession_pct (not `possession`).
    const row = mapTeamStat({
      match_id: 1,
      team_id: 8,
      is_home: true,
      possession_pct: 60,
      shots_blocked: 3,
      offsides: 2,
    });
    expect(row).toMatchObject({
      matchBdlId: 1,
      teamBdlId: 8,
      possession: 60,
      shotsBlocked: 3,
      offsides: 2,
    });
  });

  it("throws FeedShapeMismatchError when team_id is missing", () => {
    expect(() => mapTeamStat({ match_id: 1 } as never)).toThrow(/team_id/);
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

  it("extracts the referee NAME from the nested referee object (documented as an object, not a string)", () => {
    const row = mapMatchRow({
      id: 102,
      status: "completed",
      datetime: "2026-06-10T18:00:00Z",
      referee: {
        id: 55,
        name: "Ismail Elfath",
        country_code: "USA",
        country_name: "United States",
      },
    });
    expect(row.referee).toBe("Ismail Elfath");
    const noRef = mapMatchRow({ id: 103, status: "scheduled", datetime: "x" });
    expect(noRef.referee).toBeNull();
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
