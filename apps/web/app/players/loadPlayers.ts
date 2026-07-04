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
// DISPLAY-ONLY reuse of the shared card classifier (@app/recompute, exported per T-CARD1) so the /players
// Yellow-card column counts a booking with the SAME predicate the game-detail Events timeline + the
// scoring engine use — one source of truth. Importing an EXISTING pure export is NOT an engine touch:
// `packages/recompute` is byte-unchanged and this loader only READS `event_match` (no write, no score run).
import { classifyCard } from "@app/recompute";
import { selectCurrentPeriod, type Position } from "@app/shared";
// PLAYERS-DATA-scope: the pure participant-scoping seam (unit-pinned in playersLogic.test). Importing
// EXISTING pure helpers is not a logic touch — the loader just derives the WC-participant set from the
// fifa_match schedule and filters the pool to it (see the read below + DECISIONS).
import { participantTeamIds, scopeToParticipants } from "@/src/players/playersLogic";
import type { PlayersView, PlPlayer, PlStatline } from "@/src/players/types";

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
    statlineRows,
    cardRows,
    scheduleTeamRows,
    upcomingMatches,
    periodRows,
  ] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { timezone: true } }),
    // Every ingested player. nation + nationAlive ride the team join; NO `country` read. The pool is
    // SCOPED to WC participants below (PLAYERS-DATA-scope) — a player whose team never appears in the
    // fifa_match schedule is a non-WC nation the roster feed also carried, and is dropped entirely.
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
    // The tournament STATLINE per player (display-only, from the PROMOTED `stat_player_match` columns —
    // the SAME table + shape the season-points groupBy uses, no engine touch). Filtered to appearances
    // (`minutes_played > 0`) so PLD = matches played and the sums are over played matches. SH sources
    // the promoted `shots_on_target` — CONFIRMED to MATCH the shared card, whose "Shots"/"SH" also sources
    // `shots_on_target` (`buildPlayerTournamentStats`); there is no total-shots column in this table, and
    // the card doesn't read `shot_match`, so "matching the card" means `shots_on_target`. CS has no per-row
    // source here (engine-derived) → renders "—". YC comes from `event_match` (read below), not here.
    prisma.statPlayerMatch.groupBy({
      by: ["playerId"],
      where: { minutesPlayed: { gt: 0 } },
      _count: true,
      _sum: {
        minutesPlayed: true,
        goals: true,
        assists: true,
        shotsOnTarget: true,
        keyPasses: true,
        tacklesWon: true,
      },
    }),
    // YELLOW CARDS (display-only): the tournament-global card events per player, read READ-ONLY from
    // `event_match` — the SAME source + shared `classifyCard` the game-detail Events timeline uses
    // (T16b/T-CARD1). Narrowed to card incidents; rescinded rows + non-yellow classes are filtered in JS
    // (mirroring `buildGameDetail`'s per-player fold). Cards are tournament-global (like `seasonPoints`),
    // so no league scope. NO write, NO migration, NO engine run — `packages/recompute` stays byte-identical.
    prisma.eventMatch.findMany({
      where: { incidentType: { equals: "card", mode: "insensitive" }, playerId: { not: null } },
      select: { playerId: true, incidentType: true, incidentClass: true, rescinded: true },
    }),
    // PLAYERS-DATA-scope: the WC-PARTICIPANT team set = every team that appears as home OR away in the
    // fifa_match schedule. Read over the FULL schedule (NO status filter): an eliminated team has only
    // completed matches, but its players are still WC participants and must stay in the pool (greyed
    // "out"), so filtering by status would wrongly drop them. This is a SEPARATE read from the
    // status-filtered kickoff-cutoff read below — that one answers "what's still acquirable", this one
    // answers "who is in the tournament". Two team-id columns only; the ONLY reliable signal (group_id
    // is NULL for every team; `eliminated` marks knockouts, not tournament membership — see DECISIONS).
    prisma.fifaMatch.findMany({ select: { homeTeamId: true, awayTeamId: true } }),
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

  // Yellow cards per player (display-only). Mirrors `buildGameDetail`'s per-player fold EXACTLY: skip
  // rescinded rows, then count events the shared `classifyCard` calls a "yellow" (a second yellow is a
  // separate `card/yellow` row, so both are counted — consistent with the game-detail Events surface).
  const ycByPlayer = new Map<string, number>();
  for (const e of cardRows) {
    if (e.rescinded || !e.playerId) continue;
    if (classifyCard(e) === "yellow")
      ycByPlayer.set(e.playerId, (ycByPlayer.get(e.playerId) ?? 0) + 1);
  }

  // Tournament statline per player: 7 REAL columns from the appearances groupBy (0 when absent) + real
  // YC from `event_match` above; CS stays null (engine-derived, no per-row source) → the UI renders "—".
  type StatlineCore = Omit<PlStatline, "yellowCards" | "cleanSheets">;
  const statByPlayer = new Map<string, StatlineCore>();
  for (const s of statlineRows) {
    statByPlayer.set(s.playerId, {
      pld: s._count,
      min: s._sum.minutesPlayed ?? 0,
      goals: s._sum.goals ?? 0,
      assists: s._sum.assists ?? 0,
      shots: s._sum.shotsOnTarget ?? 0,
      keyPasses: s._sum.keyPasses ?? 0,
      tackles: s._sum.tacklesWon ?? 0,
    });
  }
  const EMPTY_CORE: StatlineCore = {
    pld: 0,
    min: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    keyPasses: 0,
    tackles: 0,
  };
  const statlineFor = (playerId: string): PlStatline => ({
    ...(statByPlayer.get(playerId) ?? EMPTY_CORE),
    yellowCards: ycByPlayer.get(playerId) ?? 0,
    cleanSheets: null,
  });

  const nameById = new Map(managerRows.map((m) => [m.id, m.displayName]));
  const ownerByPlayer = new Map<string, { managerId: string; name: string }>();
  for (const r of ownershipRows) {
    ownerByPlayer.set(r.playerId, {
      managerId: r.managerId,
      name: nameById.get(r.managerId) ?? "Unknown",
    });
  }

  // PLAYERS-DATA-scope: scope the pool to WC participants BEFORE building rows. The participant set is
  // derived from the fifa_match schedule (home ∪ away FKs); a player whose team never appears there is
  // a non-WC nation the roster feed also carried and is EXCLUDED. On today's data every player already
  // sits on a scheduled team, so this removes 0 rows — a defensive invariant, not a live cut. With the
  // pool now participant-only, `nationAlive = !eliminated` (below) can only ever mark PARTICIPANTS.
  const participants = participantTeamIds(scheduleTeamRows);
  const scopedPlayerRows = scopeToParticipants(playerRows, participants);

  const players: PlPlayer[] = scopedPlayerRows.map((p: PlayerRow) => {
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
      stats: statlineFor(p.id),
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
