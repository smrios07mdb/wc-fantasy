/**
 * Server-side data loader for the /players full-tournament browser (PLAYERS-1). A thin owner-bypass
 * Prisma edge that assembles the READ-ONLY snapshot `PlayersClient` renders (mirrors `loadWaivers` /
 * `loadGameDetail`). Every read goes through Prisma OWNER (RLS-bypassing); the screen is already gated
 * by `getSessionManager()` in `page.tsx`.
 *
 * READ-ONLY by contract: this loader NEVER mutates — reads only, no raw SQL, no
 * migration/schema/RLS/Realtime. Acquisition is single-sourced on /waivers; /players only browses and
 * hands a free agent off via a `?bid=` deep-link. Like the other IO edges it has no unit test (it needs
 * a live DB); `tsc` + the pure `playersLogic` suite + a source-contract test cover the shapes.
 *
 * Data discipline (strict — the PLAYERS-1 data model, nothing more):
 *   • nation  ← `player.team.name` (the fifa_team join). `player.country` is NEVER selected/read — it
 *     is never populated by ingestion (see loadWaivers / loadLineup / loadDraftRoom).
 *   • nationAlive ← `!player.team.eliminated` (the commissioner-set flag; null team ⇒ alive).
 *   • seasonPoints ← the `score_player_match` league aggregate via `groupBy` — the SAME aggregation
 *     shape loadWaivers uses (single source of truth; not re-derived).
 *   • ownership ← active `roster_player` (`dropped_at IS NULL`, league-scoped) — the byte-identical
 *     `liveOwnedWhere(leagueId)` predicate, inlined (that helper is not exported from `@app/faab`, and
 *     packages/faab is an untouched STOP seam). Manager display names attached SERVER-SIDE (the
 *     loadGameDetail / loadPlayoffs precedent — the browser never reads manager rows).
 *   • FA-window phase ← `acquisitionWindowState` over the current period (the SAME source loadWaivers
 *     uses; never re-derived) — gates the bid trailer.
 */
import { prisma } from "@app/db";
import { acquisitionWindowState } from "@app/faab";
import { selectCurrentPeriod, type Position } from "@app/shared";
import type { PlayersView, PlPlayer } from "@/src/players/types";

/** First initial + surname, else surname, else display name (mirrors loadWaivers' `shortNameOf`). */
function shortNameOf(p: {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
}): string {
  if (p.firstName && p.lastName) return `${p.firstName[0]}. ${p.lastName}`;
  return p.lastName ?? p.displayName;
}

/** The Prisma player select — DELIBERATELY WITHOUT `country` (nation comes from the team join only;
 *  stricter than loadWaivers, which keeps a `country` fallback). Pinned by the contract test. */
const PLAYER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  position: true,
  teamId: true,
  team: { select: { name: true, eliminated: true } },
} as const;

type PlayerRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  position: Position;
  teamId: string | null;
  team: { name: string; eliminated: boolean } | null;
};

export async function loadPlayers(viewerManagerId: string): Promise<PlayersView | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true },
  });
  if (!manager) return null;
  const leagueId = manager.leagueId;
  const now = new Date();

  const [
    league,
    playerRows,
    ownershipRows,
    managerRows,
    seasonScores,
    upcomingMatches,
    periodRows,
  ] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { timezone: true } }),
    // Every tournament player. nation + nationAlive ride the team join; NO `country` read.
    prisma.player.findMany({ select: PLAYER_SELECT, orderBy: { displayName: "asc" } }),
    // Active ownership rows (league-scoped, `dropped_at IS NULL`) — the byte-identical
    // `liveOwnedWhere(leagueId)` predicate. FA = no row here. playerId → managerId only.
    prisma.rosterPlayer.findMany({
      where: { leagueId, droppedAt: null },
      select: { playerId: true, managerId: true },
    }),
    // Manager display names (public, league-scoped) — attached SERVER-SIDE so the browser never
    // reads manager rows itself (the loadGameDetail / loadPlayoffs.managerNames scoped read-model).
    prisma.manager.findMany({ where: { leagueId }, select: { id: true, displayName: true } }),
    // Season fantasy points per player — the SAME `groupBy` aggregation shape loadWaivers uses
    // (single source of truth; `score_player_match` is tournament-global, so this IS the league sum).
    prisma.scorePlayerMatch.groupBy({ by: ["playerId"], _sum: { points: true } }),
    // The cutoff clock: every still-acquirable fixture, earliest first → per-team next kickoff.
    prisma.fifaMatch.findMany({
      where: { status: { in: ["scheduled", "in_progress"] } },
      select: { homeTeamId: true, awayTeamId: true, kickoffAt: true },
      orderBy: { kickoffAt: "asc" },
    }),
    // Periods + each one's first kickoff — drives the acquisition-window phase (same read loadWaivers
    // + the worker cadence use, so the browser shows the EXACT phase the engine is in).
    prisma.period.findMany({
      where: { leagueId },
      select: {
        id: true,
        label: true,
        status: true,
        batchClearedAt: true,
        matches: { orderBy: { kickoffAt: "asc" }, take: 1, select: { kickoffAt: true } },
      },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
    }),
  ]);

  // Per-team next kickoff (earliest still-acquirable fixture) — the acquisition-cutoff clock.
  const kickoffByTeam = new Map<string, Date>();
  for (const m of upcomingMatches) {
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (teamId && !kickoffByTeam.has(teamId)) kickoffByTeam.set(teamId, m.kickoffAt);
    }
  }

  const seasonByPlayer = new Map<string, number>();
  for (const s of seasonScores) seasonByPlayer.set(s.playerId, s._sum.points ?? 0);

  const nameById = new Map(managerRows.map((m) => [m.id, m.displayName]));
  const ownerByPlayer = new Map<string, { managerId: string; name: string }>();
  for (const r of ownershipRows) {
    ownerByPlayer.set(r.playerId, {
      managerId: r.managerId,
      name: nameById.get(r.managerId) ?? "Unknown",
    });
  }

  const players: PlPlayer[] = playerRows.map((p: PlayerRow) => {
    const ko = p.teamId ? kickoffByTeam.get(p.teamId) : undefined;
    return {
      id: p.id,
      name: p.displayName,
      shortName: shortNameOf(p),
      position: p.position,
      nation: p.team?.name ?? null,
      teamName: p.team?.name ?? null,
      kickoffAt: ko ? ko.toISOString() : null,
      seasonPoints: seasonByPlayer.get(p.id) ?? null,
      // A player with no linked team is treated as ALIVE (mirrors `isAddTeamEliminated`'s null rule).
      nationAlive: !(p.team?.eliminated ?? false),
      owner: ownerByPlayer.get(p.id) ?? null,
    };
  });

  // Acquisition-window phase for the current period — the SAME derivation loadWaivers uses.
  const currentPeriodRow = selectCurrentPeriod(periodRows, (p) => p.batchClearedAt === null);
  const windowPhase = currentPeriodRow
    ? acquisitionWindowState(
        {
          batchClearedAt: currentPeriodRow.batchClearedAt,
          firstKickoffAt: currentPeriodRow.matches[0]?.kickoffAt ?? null,
        },
        now,
      )
    : null;

  return {
    viewerManagerId,
    players,
    windowPhase,
    windowLabel: currentPeriodRow?.label ?? null,
    timezone: league?.timezone ?? "UTC",
    nowIso: now.toISOString(),
  };
}
