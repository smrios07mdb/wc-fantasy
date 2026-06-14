/**
 * PURE tournament-stats builder for the player card's **Stats** tab (Prompt 54). Given a player's
 * completed-match rows (one per fifa_match, already joined to score + stat columns by the loader),
 * it produces the position-aware `{ totals, tiles, games }` the `.pc-*` Stats body renders.
 *
 * No Prisma, no DB, no clock — deterministic over its inputs so it unit-tests cleanly. The only
 * import is the PURE `toIso2` flag resolver (apps/web/src/draft/flag.ts — no IO), used to derive
 * each opponent's flag from its fifa_team.name (the P34 nation-from-team pattern; `player.country`
 * is never populated).
 *
 * Position-awareness mirrors the design's `PC_TILEKEYS` / `PC_LINEKEYS` exactly
 * (design/design_reference/screens_2026-06-13/playercard/playercard.jsx):
 *   GK  → Saves / Clean sheets / Conceded      · lines SV · GA · CS
 *   DEF → Goals / Assists / Clean sheets        · lines G · A · TKL · CS
 *   MID → Goals / Assists / Key passes          · lines G · A · KP · TKL
 *   FWD → Goals / Assists / Shots(on target)    · lines G · A · SH · DRB
 *
 * NULL-safety is load-bearing: any stat column may be null on live data (the active WC2026
 * duels NULL issue). A null stat contributes 0 to numeric totals/tiles and surfaces as a null
 * line cell (the renderer shows "—") — never NaN, never a misleading 0, never a throw.
 */
import type { Position } from "@app/shared";
import { toIso2 } from "@/src/draft/flag";

// ─── inputs ──────────────────────────────────────────────────────────────────

/** Raw typed columns from one stat_player_match row. Every column is nullable on live data. */
export interface TournamentStatLine {
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  keyPasses: number | null;
  tacklesWon: number | null;
  dribblesCompleted: number | null;
  saves: number | null;
  /** FWD "Shots" sources the PROMOTED shots_on_target column — never raw shots from `extra`. */
  shotsOnTarget: number | null;
}

/** One completed match the player appeared in. The loader passes completed matches only. */
export interface PlayerTournamentMatchInput {
  /** period.label, e.g. "MD1". */
  periodLabel: string;
  /** Canonical tournament rank (periodOrderRank) for ascending sort. */
  periodOrder: number;
  /** Kickoff — tiebreak within a matchday. Null tolerated (sorts first within its period). */
  kickoff: Date | null;
  /** The OTHER fifa_team.name on this match (never the player's own). */
  opponentTeamName: string;
  /** True when the player's team is the home side on this match. */
  isHome: boolean;
  /** Match final scores (full-time). Either may be null before they land. */
  homeScore: number | null;
  awayScore: number | null;
  /** score_player_match.points for this match. */
  points: number;
  stats: TournamentStatLine;
}

export interface BuildPlayerTournamentStatsInput {
  position: Position;
  rows: PlayerTournamentMatchInput[];
}

// ─── outputs ─────────────────────────────────────────────────────────────────

/** Cumulative tournament totals. Every figure is null-safe (null columns summed as 0). */
export interface TournamentTotals {
  matches: number;
  goals: number;
  assists: number;
  points: number;
  saves: number;
  cleanSheets: number;
  conceded: number;
  keyPasses: number;
  /** shots on target. */
  shots: number;
  /** tackles won. */
  tackles: number;
  /** dribbles completed. */
  dribbles: number;
}

/** A headline tile (numeric — never null; nulls are coerced to 0 in totals). */
export interface PlayerTournamentTile {
  key: string;
  label: string;
  value: number;
}

/** One per-match statline cell. `value` is null when the source column was null → renders "—". */
export interface PlayerTournamentStatCell {
  key: string;
  label: string;
  value: number | null;
}

export interface PlayerTournamentGame {
  periodLabel: string;
  opponentTeamName: string;
  /** ISO-3166-1 alpha-2 for the flag, or null when the team name doesn't resolve. */
  opponentIso2: string | null;
  isHome: boolean;
  /** Minutes played; null surfaces as "—". */
  minutes: number | null;
  /** "2–0" oriented to the player's team (goals for – against), or null if scores missing. */
  scoreline: string | null;
  /** Result from the player's team perspective, or null if scores missing. */
  result: "W" | "L" | "D" | null;
  points: number;
  /** Position-aware per-match line cells (PC_LINEKEYS order). */
  lines: PlayerTournamentStatCell[];
}

export interface PlayerTournamentStats {
  totals: TournamentTotals;
  tiles: PlayerTournamentTile[];
  games: PlayerTournamentGame[];
}

// ─── position → surface maps (mirror the design's PC_TILEKEYS / PC_LINEKEYS) ───

/** Which three totals become the middle tiles (Matches + these 3 + Points = the 5-up grid). */
const TILE_SPECS: Record<Position, ReadonlyArray<readonly [keyof TournamentTotals, string]>> = {
  GK: [
    ["saves", "Saves"],
    ["cleanSheets", "Clean sheets"],
    ["conceded", "Conceded"],
  ],
  DEF: [
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["cleanSheets", "Clean sheets"],
  ],
  MID: [
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["keyPasses", "Key passes"],
  ],
  FWD: [
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["shots", "Shots"],
  ],
};

type LineKey =
  | "goals"
  | "assists"
  | "keyPasses"
  | "tackles"
  | "shots"
  | "dribbles"
  | "saves"
  | "conceded"
  | "cleanSheets";

/** Per-match line cells by position (abbreviated labels). */
const LINE_SPECS: Record<Position, ReadonlyArray<readonly [LineKey, string]>> = {
  GK: [
    ["saves", "SV"],
    ["conceded", "GA"],
    ["cleanSheets", "CS"],
  ],
  DEF: [
    ["goals", "G"],
    ["assists", "A"],
    ["tackles", "TKL"],
    ["cleanSheets", "CS"],
  ],
  MID: [
    ["goals", "G"],
    ["assists", "A"],
    ["keyPasses", "KP"],
    ["tackles", "TKL"],
  ],
  FWD: [
    ["goals", "G"],
    ["assists", "A"],
    ["shots", "SH"],
    ["dribbles", "DRB"],
  ],
};

// ─── per-match derivation ──────────────────────────────────────────────────────

interface DerivedMatch {
  /** Goals against (= conceded), oriented to the player's team. Null when scores missing. */
  goalsAgainst: number | null;
  scoreline: string | null;
  result: "W" | "L" | "D" | null;
  /** Clean sheet 0/1 for GK/DEF/MID; 0 for FWD; null when scores are unknown. */
  cleanSheet: number | null;
}

function deriveMatch(position: Position, row: PlayerTournamentMatchInput): DerivedMatch {
  const goalsFor = row.isHome ? row.homeScore : row.awayScore;
  const goalsAgainst = row.isHome ? row.awayScore : row.homeScore;

  const known = goalsFor !== null && goalsAgainst !== null;
  const scoreline = known ? `${goalsFor}–${goalsAgainst}` : null; // en dash
  const result: DerivedMatch["result"] = known
    ? goalsFor! > goalsAgainst!
      ? "W"
      : goalsFor! < goalsAgainst!
        ? "L"
        : "D"
    : null;

  // Clean sheet is a CS-position concept (GK/DEF/MID). Derived from the scoreline + minutes,
  // mirroring the design: conceded 0 AND played ≥ 60'. Unknown scores → null (renders "—").
  let cleanSheet: number | null;
  if (position === "FWD") {
    cleanSheet = 0;
  } else if (goalsAgainst === null) {
    cleanSheet = null;
  } else {
    cleanSheet = goalsAgainst === 0 && (row.stats.minutesPlayed ?? 0) >= 60 ? 1 : 0;
  }

  return { goalsAgainst, scoreline, result, cleanSheet };
}

function lineValue(key: LineKey, row: PlayerTournamentMatchInput, d: DerivedMatch): number | null {
  switch (key) {
    case "goals":
      return row.stats.goals;
    case "assists":
      return row.stats.assists;
    case "keyPasses":
      return row.stats.keyPasses;
    case "tackles":
      return row.stats.tacklesWon;
    case "shots":
      return row.stats.shotsOnTarget;
    case "dribbles":
      return row.stats.dribblesCompleted;
    case "saves":
      return row.stats.saves;
    case "conceded":
      return d.goalsAgainst;
    case "cleanSheets":
      return d.cleanSheet;
  }
}

// ─── the builder ───────────────────────────────────────────────────────────────

export function buildPlayerTournamentStats(
  input: BuildPlayerTournamentStatsInput,
): PlayerTournamentStats {
  const { position, rows } = input;

  // Ascending: by canonical period order, then kickoff (MD1 before MD2). Does not mutate input.
  const sorted = [...rows].sort((a, b) => {
    if (a.periodOrder !== b.periodOrder) return a.periodOrder - b.periodOrder;
    return (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0);
  });

  const totals: TournamentTotals = {
    matches: sorted.length,
    goals: 0,
    assists: 0,
    points: 0,
    saves: 0,
    cleanSheets: 0,
    conceded: 0,
    keyPasses: 0,
    shots: 0,
    tackles: 0,
    dribbles: 0,
  };

  const games: PlayerTournamentGame[] = sorted.map((row) => {
    const d = deriveMatch(position, row);

    // Accumulate totals null-safe (null → 0).
    totals.points += row.points;
    totals.goals += row.stats.goals ?? 0;
    totals.assists += row.stats.assists ?? 0;
    totals.saves += row.stats.saves ?? 0;
    totals.keyPasses += row.stats.keyPasses ?? 0;
    totals.shots += row.stats.shotsOnTarget ?? 0;
    totals.tackles += row.stats.tacklesWon ?? 0;
    totals.dribbles += row.stats.dribblesCompleted ?? 0;
    totals.conceded += d.goalsAgainst ?? 0;
    totals.cleanSheets += d.cleanSheet ?? 0;

    return {
      periodLabel: row.periodLabel,
      opponentTeamName: row.opponentTeamName,
      opponentIso2: toIso2(row.opponentTeamName),
      isHome: row.isHome,
      minutes: row.stats.minutesPlayed,
      scoreline: d.scoreline,
      result: d.result,
      points: row.points,
      lines: LINE_SPECS[position].map(([key, label]) => ({
        key,
        label,
        value: lineValue(key, row, d),
      })),
    };
  });

  const tiles: PlayerTournamentTile[] = [
    { key: "matches", label: "Matches", value: totals.matches },
    ...TILE_SPECS[position].map(([key, label]) => ({
      key: String(key),
      label,
      value: totals[key],
    })),
    { key: "points", label: "Points", value: totals.points },
  ];

  return { totals, tiles, games };
}
