/**
 * Pure view-model builder for the player box-score modal. Transforms injected DB rows into the
 * display model the modal renders. No IO, no DB, no clock (now is injected). The detail string in
 * each ScoreLine is rendered verbatim — the engine already computed the human-readable derivation.
 */
import { SCORE_CATEGORIES } from "@app/scoring";
import type {
  BoxState,
  BuildPlayerBoxInput,
  FixtureView,
  PlayerBoxHeader,
  PlayerBoxView,
  ScoreLineView,
  SectionView,
  TrackedStatRow,
} from "./types";

// ─── category metadata ────────────────────────────────────────────────────────

const CAT = SCORE_CATEGORIES;

/** SCORING.md section + display metadata for every canonical category, in §1→§8 order. */
const CATEGORY_META: Record<string, { section: string; label: string; tag: string }> = {
  [CAT.rating]: { section: "Performance Rating", label: "Performance Rating", tag: "RTG" },
  [CAT.appearance]: { section: "Appearance", label: "Appearance", tag: "APP" },
  [CAT.goals]: { section: "Attacking", label: "Goal", tag: "GOAL" },
  [CAT.assists]: { section: "Attacking", label: "Assist", tag: "AST" },
  [CAT.keyPasses]: { section: "Accumulators", label: "Key passes", tag: "KPS" },
  [CAT.dribbles]: { section: "Accumulators", label: "Dribbles", tag: "DRB" },
  [CAT.duels]: { section: "Accumulators", label: "Duels won", tag: "DUL" },
  [CAT.passing]: { section: "Accumulators", label: "Accurate passes", tag: "PSS" },
  [CAT.longBalls]: { section: "Accumulators", label: "Accurate long balls", tag: "LB" },
  [CAT.wasFouled]: { section: "Accumulators", label: "Was fouled", tag: "FLD" },
  [CAT.clearances]: { section: "Accumulators", label: "Clearances", tag: "CLR" },
  [CAT.blockedShots]: { section: "Accumulators", label: "Blocked shots", tag: "BLK" },
  [CAT.interceptions]: { section: "Accumulators", label: "Interceptions", tag: "INT" },
  [CAT.tacklesWon]: { section: "Accumulators", label: "Tackles won", tag: "TCK" },
  [CAT.saveInsideBox]: { section: "Goalkeeping", label: "Saves inside box", tag: "SIB" },
  [CAT.saveOutsideBox]: { section: "Goalkeeping", label: "Saves outside box", tag: "SOB" },
  [CAT.penaltySaved]: { section: "Goalkeeping", label: "Penalty saved", tag: "PNS" },
  [CAT.punchesHighClaims]: {
    section: "Goalkeeping",
    label: "Punches + high claims",
    tag: "PHC",
  },
  [CAT.cleanSheet]: { section: "Role Outcomes", label: "Clean sheet", tag: "CS" },
  [CAT.goalsConceded]: { section: "Role Outcomes", label: "Goals conceded", tag: "GCA" },
  [CAT.penaltyWon]: { section: "Penalties", label: "Penalty won", tag: "PNW" },
  [CAT.penaltyCommitted]: { section: "Penalties", label: "Penalty committed", tag: "PNC" },
  [CAT.penaltyMissed]: { section: "Penalties", label: "Penalty missed", tag: "PNM" },
  [CAT.yellowCard]: { section: "Discipline", label: "Yellow card", tag: "YEL" },
  [CAT.secondYellow]: { section: "Discipline", label: "Second yellow", tag: "2YL" },
  [CAT.redCard]: { section: "Discipline", label: "Red card", tag: "RED" },
  [CAT.ownGoal]: { section: "Discipline", label: "Own goal", tag: "OG" },
  [CAT.possessionLost]: { section: "Discipline", label: "Possession lost", tag: "PLT" },
};

/** Canonical section order matching SCORING.md §1→§8. */
const SECTION_ORDER = [
  "Performance Rating",
  "Appearance",
  "Attacking",
  "Accumulators",
  "Goalkeeping",
  "Role Outcomes",
  "Penalties",
  "Discipline",
];

// ─── helpers ──────────────────────────────────────────────────────────────────

/** "F. Surname" — first initial + surname, falling back to displayName. */
function shortName(displayName: string, firstName: string | null, lastName: string | null): string {
  if (firstName && lastName) return `${firstName[0]}. ${lastName}`;
  return lastName ?? displayName;
}

/**
 * Approximate match minute from kickoff. Returns a floor-capped minute string ("45'" etc.) for
 * in-progress matches, capping at 90 so the display never shows impossible values.
 */
function approxMinute(kickoffAt: Date, now: Date): string {
  const elapsed = Math.floor((now.getTime() - kickoffAt.getTime()) / 60_000);
  return `${Math.min(90, Math.max(1, elapsed))}'`;
}

function buildFixtureView(
  fixture: BuildPlayerBoxInput["fixture"],
  teamId: string | null,
  now: Date,
): FixtureView | null {
  if (!fixture) return null;
  const { kickoffAt, status, homeTeamId, homeTeamName, awayTeamName } = fixture;

  let minuteLabel: string;
  if (status === "completed") {
    minuteLabel = "FT";
  } else if (status === "in_progress") {
    minuteLabel = approxMinute(kickoffAt, now);
  } else {
    minuteLabel = "KO soon";
  }

  return {
    homeTeamName,
    awayTeamName,
    kickoffIso: kickoffAt.toISOString(),
    minuteLabel,
    isHome: teamId !== null && teamId === homeTeamId,
  };
}

function deriveState(
  fixture: BuildPlayerBoxInput["fixture"],
  score: BuildPlayerBoxInput["score"],
): BoxState {
  if (!fixture) return "no-fixture";
  const { status } = fixture;
  if (status === "scheduled" || status === "postponed" || status === "abandoned") {
    return "not-started";
  }
  if (status === "in_progress") {
    return score ? "in-progress" : "in-progress-no-score";
  }
  return "played";
}

/** Group scored lines by section, preserving SCORING.md §1→§8 order. */
function buildSections(score: BuildPlayerBoxInput["score"]): SectionView[] {
  if (!score || score.breakdown.lines.length === 0) return [];

  const bySection = new Map<string, ScoreLineView[]>();

  for (const line of score.breakdown.lines) {
    const meta = CATEGORY_META[line.category];
    if (!meta) continue; // unknown category — skip gracefully

    const view: ScoreLineView = {
      category: line.category,
      tag: meta.tag,
      label: meta.label,
      points: line.points,
      detail: line.detail ?? null,
    };

    const existing = bySection.get(meta.section);
    if (existing) {
      existing.push(view);
    } else {
      bySection.set(meta.section, [view]);
    }
  }

  return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({
    sectionLabel: s,
    lines: bySection.get(s)!,
  }));
}

/**
 * Stat counts that are NOT direct scoring categories — shown as informational context rows so the
 * modal reads as "categories AND stats". Only non-null, positive values are included.
 */
function buildTrackedStats(stats: BuildPlayerBoxInput["stats"]): TrackedStatRow[] {
  if (!stats) return [];

  const rows: TrackedStatRow[] = [];

  const add = (label: string, count: number | null) => {
    if (count !== null && count > 0) rows.push({ label, count });
  };

  // These are the stat columns that don't map directly to a SCORE_CATEGORY value.
  add("Minutes played", stats.minutesPlayed);
  add("Dribbles attempted", stats.dribblesAttempted);
  add("Duels lost", stats.duelsLost);
  add("Total passes", stats.passesTotal);
  add("Total long balls", stats.longBallsTotal);
  add("Total saves", stats.saves);

  return rows;
}

// ─── main export ─────────────────────────────────────────────────────────────

export function buildPlayerBox(input: BuildPlayerBoxInput): PlayerBoxView {
  const { player, fixture, score, stats, now } = input;

  const fixtureView = buildFixtureView(fixture, player.teamId, now);
  const state = deriveState(fixture, score);

  const header: PlayerBoxHeader = {
    displayName: player.displayName,
    shortName: shortName(player.displayName, player.firstName, player.lastName),
    position: player.position,
    nation: player.nation,
    fixture: fixtureView,
    periodTotal: score?.points ?? 0,
  };

  return {
    header,
    state,
    sections: buildSections(score),
    trackedStats: buildTrackedStats(stats),
    season: null, // TODO(confirm): season sum injected by the API route when available
  };
}
