/**
 * PURE draft-ranking core (Prompt 27). Turns pre-tournament betting signal — per-match player props +
 * team tournament-winner odds — into a projected fantasy-point ranking for every 2026 WC squad player.
 * No IO, no clock, no env: the CLI fetcher (cli.ts `rank:generate`) gathers the GOAT data, shapes it
 * into a {@link RankingInput}, and calls {@link computeRanking}; the output is written to a CSV that
 * Sergio reviews before the existing `rank` command commits `default_rank` to the DB.
 *
 * The algorithm is deliberately boring and testable with literals (see rankGenerate.test.ts). Scoring
 * weights are REPLICATED from SCORING.md — NOT imported from @app/scoring — because this is a standalone
 * projection, not the live scoring engine, and must not drift if the engine's internals change.
 */

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface SquadPlayer {
  balldontlieId: number;
  name: string;
  position: Position;
  teamId: number;
}

export interface MatchProps {
  matchId: number;
  playerId: number;
  propType: "anytime_goal" | "assists" | "shots" | "shots_on_target" | "first_goal";
  /** Threshold the prop covers: 1 = ≥1, 2 = ≥2, … */
  lineValue: number;
  /** Implied probability for that threshold, 0–1 (the CLI averages DK + FanDuel before building this). */
  impliedProb: number;
}

export interface RankingInput {
  /** All 2026 squad players with their BALLDONTLIE id and position. */
  players: SquadPlayer[];
  /** Per-match player props (group-stage matches only; the CLI filters before passing them in). */
  props: MatchProps[];
  /** Team tournament-winner odds (American), keyed by team_id. */
  teamWinOdds: Record<number, number>;
  /** Which team each player belongs to (playerId → teamId). */
  playerTeam: Record<number, number>;
}

export interface RankedPlayer {
  balldontlieId: number;
  name: string;
  position: string;
  projectedPts: number;
  expectedMatches: number;
  hasProps: boolean;
}

// Scoring weights, replicated verbatim from SCORING.md (see file header for why they are not imported).
const GOAL_WEIGHT: Record<Position, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 };
const ASSIST_WEIGHT: Record<Position, number> = { GK: 4, DEF: 4, MID: 3, FWD: 3 };

// Conservative per-match baseline for players the books don't quote a goal prop on (most GKs/DEFs/depth).
const BASELINE_PTS: Record<Position, number> = { GK: 5.0, DEF: 3.5, MID: 3.0, FWD: 3.5 };

// Appearance points credited per group-stage match a prop-covered player is assumed to start (Step 3).
const APPEARANCE_PTS = 2.0;

// The group stage is 3 matches; projectedPts scales group-stage output to full tournament depth (Step 4).
const GROUP_STAGE_MATCHES = 3;

// Draft-value priority when projectedPts ties: a forward is worth more than a keeper at equal projection.
const POSITION_PRIORITY: Record<string, number> = { FWD: 0, MID: 1, DEF: 2, GK: 3 };

/**
 * American moneyline odds → implied probability (0–1).
 *   positive (underdog): 100 / (odds + 100)
 *   negative (favorite): |odds| / (|odds| + 100)
 * +100 and -100 both map to 0.50.
 */
export function americanOddsToProb(odds: number): number {
  return odds >= 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Map a team's tournament-winner American odds to an expected total-matches multiplier (Step 2). Shorter
 * win odds ⇒ the team is expected to advance further ⇒ more matches ⇒ more fantasy volume. Undefined
 * (no futures quote) defaults to a group-stage-only 3.0.
 */
export function expectedMatchesFromOdds(odds: number | undefined): number {
  if (odds === undefined) return 3.0;
  if (odds <= 600) return 6.5;
  if (odds <= 1200) return 5.5;
  if (odds <= 2500) return 4.5;
  if (odds <= 5000) return 3.8;
  if (odds <= 10000) return 3.3;
  return 3.0;
}

/** Sum implied probs for the given prop type at the given line thresholds: E[count] = Σ P(≥ line). */
function expectedCount(
  byType: Map<string, Map<number, number>>,
  propType: string,
  lines: readonly number[],
): number {
  const lineProbs = byType.get(propType);
  if (!lineProbs) return 0;
  let sum = 0;
  for (const line of lines) sum += lineProbs.get(line) ?? 0;
  return sum;
}

/**
 * Compute the projected-points ranking (Steps 1–7). Every input player appears exactly once in the
 * output, sorted descending by projectedPts with ties broken by position priority then name.
 */
export function computeRanking(input: RankingInput): RankedPlayer[] {
  // Index props by player → match → propType → line → impliedProb. Last write wins on a duplicate key.
  const propsByPlayer = new Map<number, Map<number, Map<string, Map<number, number>>>>();
  for (const p of input.props) {
    let byMatch = propsByPlayer.get(p.playerId);
    if (!byMatch) propsByPlayer.set(p.playerId, (byMatch = new Map()));
    let byType = byMatch.get(p.matchId);
    if (!byType) byMatch.set(p.matchId, (byType = new Map()));
    let byLine = byType.get(p.propType);
    if (!byLine) byType.set(p.propType, (byLine = new Map()));
    byLine.set(p.lineValue, p.impliedProb);
  }

  const ranked: RankedPlayer[] = input.players.map((player) => {
    const teamId = input.playerTeam[player.balldontlieId] ?? player.teamId;
    const expectedMatches = expectedMatchesFromOdds(input.teamWinOdds[teamId]);

    // A player "has props" iff at least one group-stage match carries an anytime_goal entry (Step 7).
    const matches = propsByPlayer.get(player.balldontlieId);
    const matchesWithGoalProps = matches
      ? [...matches.entries()].filter(([, byType]) => byType.has("anytime_goal"))
      : [];

    let projectedPts: number;
    if (matchesWithGoalProps.length > 0) {
      // Step 3 — sum E[pts per match] over the matches the books quote a goal prop on.
      let groupStagePts = 0;
      for (const [, byType] of matchesWithGoalProps) {
        const eGoals = expectedCount(byType, "anytime_goal", [1, 2, 3]);
        const eAssists = expectedCount(byType, "assists", [1, 2]);
        groupStagePts +=
          eGoals * GOAL_WEIGHT[player.position] +
          eAssists * ASSIST_WEIGHT[player.position] +
          APPEARANCE_PTS;
      }
      // Step 4 — scale the group-stage projection to full tournament depth.
      projectedPts = groupStagePts * (expectedMatches / GROUP_STAGE_MATCHES);
    } else {
      // Step 5 — no goal props: conservative position baseline across the team's expected matches.
      projectedPts = BASELINE_PTS[player.position] * expectedMatches;
    }

    return {
      balldontlieId: player.balldontlieId,
      name: player.name,
      position: player.position,
      projectedPts,
      expectedMatches,
      hasProps: matchesWithGoalProps.length > 0,
    };
  });

  // Step 6 — sort: projectedPts desc, then position priority (FWD > MID > DEF > GK), then name asc.
  ranked.sort((a, b) => {
    if (b.projectedPts !== a.projectedPts) return b.projectedPts - a.projectedPts;
    const pa = POSITION_PRIORITY[a.position] ?? 99;
    const pb = POSITION_PRIORITY[b.position] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return ranked;
}

// ── CSV (pure) ──────────────────────────────────────────────────────────────────
// The CLI assembles these from computeRanking output + a teamId→name map, writes them to a gitignored
// ranking-draft.csv for review, then the `rank` command reads the same CSV back via parseRankingCsvIds.

/** One CSV row: a ranked player plus its 1-based rank and resolved team name. */
export interface RankingCsvRow {
  rank: number;
  balldontlieId: number;
  name: string;
  position: string;
  team: string;
  projectedPts: number;
  expectedMatches: number;
  hasProps: boolean;
}

const CSV_HEADER = "rank,balldontlieId,name,position,team,projectedPts,expectedMatches,hasProps";

/** Quote a field iff it contains a comma, double-quote, or newline (doubling embedded quotes). */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize ranked rows to CSV text (header + one row each). projectedPts is fixed to 2 decimals. */
export function toRankingCsv(rows: RankingCsvRow[]): string {
  const lines = rows.map((r) =>
    [
      r.rank,
      r.balldontlieId,
      csvEscape(r.name),
      r.position,
      csvEscape(r.team),
      r.projectedPts.toFixed(2),
      r.expectedMatches,
      r.hasProps,
    ].join(","),
  );
  return [CSV_HEADER, ...lines].join("\n") + "\n";
}

/** Split one CSV line into fields, honouring double-quoted fields with embedded commas / "" escapes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

/**
 * Read the `balldontlieId` column (index 1) from ranking CSV text, in row order, skipping the header and
 * any blank lines. The order IS the ranking the `rank` command writes to default_rank — so a reviewer can
 * reorder rows in the CSV and have it take effect.
 */
export function parseRankingCsvIds(csv: string): number[] {
  const ids: number[] = [];
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === "") continue;
    const id = Number(splitCsvLine(line)[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}
