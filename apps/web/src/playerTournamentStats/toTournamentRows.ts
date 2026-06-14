/**
 * PURE adapter: maps the DB-shaped rows the loader reads (stat_player_match joined to fifa_match +
 * period, plus a points-by-match map) into the builder's `PlayerTournamentMatchInput[]`. Extracted
 * from the loader so the opponent-derivation invariant is unit-testable without Prisma.
 *
 * The opponent is the OTHER team on the same fifa_match (never `player.country`, which ingestion
 * never populates — the P34 nation-from-team pattern): if the player's team is home, the opponent
 * is the away team, and vice-versa. Opponent name + flag both flow from that one team's name.
 */
import { periodOrderRank } from "@app/shared";
import type { PlayerTournamentMatchInput } from "./buildPlayerTournamentStats";

/** The fifa_match columns the loader selects for each appearance. */
export interface AdapterMatch {
  id: string;
  kickoffAt: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  period: { label: string } | null;
}

/** One stat_player_match row joined to its match. */
export interface AdapterStatRow {
  matchId: string;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  keyPasses: number | null;
  tacklesWon: number | null;
  dribblesCompleted: number | null;
  saves: number | null;
  shotsOnTarget: number | null;
  match: AdapterMatch;
}

export interface ToTournamentRowsInput {
  /** The viewing player's team id — decides home/away orientation. */
  playerTeamId: string | null;
  statRows: ReadonlyArray<AdapterStatRow>;
  /** matchId → score_player_match.points. Absent → 0 (score row not landed). */
  pointsByMatch: ReadonlyMap<string, number>;
}

export function toTournamentRows(input: ToTournamentRowsInput): PlayerTournamentMatchInput[] {
  const { playerTeamId, statRows, pointsByMatch } = input;

  return statRows.map((sr) => {
    const m = sr.match;
    const isHome = playerTeamId !== null && m.homeTeamId === playerTeamId;
    // Opponent = the OTHER team on this very match row (never the player's own team / country).
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    const label = m.period?.label ?? "—";

    return {
      periodLabel: label,
      periodOrder: periodOrderRank(label),
      kickoff: m.kickoffAt,
      opponentTeamName: opponent?.name ?? "",
      isHome,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      points: pointsByMatch.get(sr.matchId) ?? 0,
      stats: {
        minutesPlayed: sr.minutesPlayed,
        goals: sr.goals,
        assists: sr.assists,
        keyPasses: sr.keyPasses,
        tacklesWon: sr.tacklesWon,
        dribblesCompleted: sr.dribblesCompleted,
        saves: sr.saves,
        shotsOnTarget: sr.shotsOnTarget,
      },
    };
  });
}
