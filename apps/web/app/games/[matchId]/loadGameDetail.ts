/**
 * Server-side data loader for the single-match Game Detail screen (T5/T6) — the THIN owner-bypass Prisma
 * edge that gathers the already-scored rows and hands them to the PURE `buildGameDetail`, mirroring
 * `loadVsField` / `loadPlayoffs` / `loadPlayerBox`. READS ONLY: it never re-runs the engine, never marks
 * dirty, never writes. Every per-player score it reads was already computed by recompute (one
 * `score_player_match` row per participant — NO roster join), so a full-match box score with fantasy
 * points for all 22+ players is fully backed by stored data; the loader adds only the ownership overlay.
 *
 * SERVER-ONLY: the Prisma owner-bypass means the browser never gains direct read of `score_player_match`
 * or `stat_player_match` (same posture as /api/vsfield + /api/player-box) — NO new RLS, NO migration, NO
 * Realtime publication change. Nation comes from the `fifa_team.name` join (the P34 pattern) — NEVER the
 * `player.country` scalar. Team names come from the home/away `fifa_team` join; an unnamed team falls back
 * to the shared UNNAMED_OPPONENT (never a raw UUID). `fifa_match.period_id` may be null (period row not
 * seeded) — the box score still renders, just with NO owner overlay (the overlay needs the period's
 * lineup_slot). Like the other loaders this IO edge has no unit test (it needs a live DB); `tsc` + the
 * pure `buildGameDetail` suite cover the shapes and a source-contract smoke pins the reuse/read-only seams.
 */
import "server-only";
import { prisma } from "@app/db";
import type { MatchStatus, PeriodKind, Position, RatingSource } from "@app/shared";
import { buildGameDetail } from "@/src/games/buildGameDetail";
import type { GameDetailView, OwnerTag } from "@/src/games/types";

export async function loadGameDetail(
  viewerManagerId: string,
  matchId: string,
): Promise<GameDetailView | null> {
  // Viewer's league (ownership scope) + identity (isMe on the owner tags).
  const viewer = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { leagueId: true },
  });
  if (!viewer) return null;
  const leagueId = viewer.leagueId;

  const match = await prisma.fifaMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      kickoffAt: true,
      round: true,
      periodId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      // Team names via the fifa_team join (never a raw UUID).
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      // Canonical phase/label — period.kind/label (the discriminator), NEVER fifa_match.round.
      period: { select: { kind: true, label: true } },
    },
  });
  if (!match) return null;

  // All match-keyed participant/squad reads in parallel (each already-scored / already-ingested).
  // ratingPlayerMatch (T16) + statTeamMatch (T17) are the additive reads: source-tagged 0–10 ratings
  // and home-vs-away team aggregates, both already populated by ingestion. Read-only + Prisma owner-bypass
  // like the rest — NO migration/RLS/Realtime. statTeamMatch is display-only (never read by scoring).
  const [lineupEntries, statRows, scoreRows, eventRows, ratingRows, teamStatRows] =
    await Promise.all([
      prisma.matchLineupEntry.findMany({
        where: { matchId },
        select: { playerId: true, isStarter: true },
      }),
      prisma.statPlayerMatch.findMany({
        where: { matchId },
        select: { playerId: true, minutesPlayed: true, goals: true, assists: true, saves: true },
      }),
      prisma.scorePlayerMatch.findMany({
        where: { matchId },
        select: { playerId: true, points: true },
      }),
      prisma.eventMatch.findMany({
        where: { matchId },
        select: {
          playerId: true,
          // T16b additive selects (display-only): the assist scorer (added to the id union below) and the
          // period (1H/2H/ET/PEN) the pure builder uses to synthesize the HT/FT markers + the sort rank.
          // Both columns pre-exist — NO migration. event_match is otherwise read independently by the engine.
          assistPlayerId: true,
          playerInId: true,
          playerOutId: true,
          incidentType: true,
          incidentClass: true,
          timeMinute: true,
          addedTime: true,
          period: true,
          rescinded: true,
        },
      }),
      prisma.ratingPlayerMatch.findMany({
        where: { matchId },
        select: { playerId: true, rating: true, source: true },
      }),
      // T17: per-team match aggregates (one row per side). Typed columns + the retained `extra` jsonb;
      // the pure builder maps each teamId to home/away and resolves the Statistics rows.
      prisma.statTeamMatch.findMany({
        where: { matchId },
        select: { teamId: true, possession: true, offsides: true, shotsBlocked: true, extra: true },
      }),
    ]);

  // Union of every referenced player id (squad sheet ∪ stats ∪ scores ∪ event participants).
  const idSet = new Set<string>();
  for (const e of lineupEntries) idSet.add(e.playerId);
  for (const s of statRows) idSet.add(s.playerId);
  for (const s of scoreRows) idSet.add(s.playerId);
  for (const r of ratingRows) idSet.add(r.playerId);
  for (const e of eventRows) {
    if (e.playerId) idSet.add(e.playerId);
    if (e.assistPlayerId) idSet.add(e.assistPlayerId); // T16b: resolve assist scorers' names too
    if (e.playerInId) idSet.add(e.playerInId);
    if (e.playerOutId) idSet.add(e.playerOutId);
  }
  const playerIds = [...idSet];

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      position: true,
      teamId: true,
      // Nation for the flag comes from the team join (the P34 pattern) — player.country is never written.
      team: { select: { name: true } },
    },
  });
  const resolvedIds = new Set(players.map((p) => p.id));
  // Participants referenced by the feed but absent from the imported pool → can't be shown (surfaced honestly).
  const unresolvedFromPool = playerIds.filter((id) => !resolvedIds.has(id)).length;

  // Ownership overlay — ONLY when the match links to a fantasy period (no period ⇒ no owner tags).
  const ownerByPlayer: Record<string, OwnerTag> = {};
  if (match.periodId) {
    const periodId = match.periodId;
    const [slots, roster] = await Promise.all([
      // Who FIELDED each player this period (started/benched) — the canonical lineup_slot read,
      // keyed by THIS match's period (mirrors recompute's getAffectedManagerPeriods shape).
      prisma.lineupSlot.findMany({
        where: { periodId, playerId: { in: playerIds } },
        select: { managerId: true, playerId: true, isStarter: true },
      }),
      // Who actively rosters each player (league-scoped, active ownership) — for owned-but-not-fielded.
      prisma.rosterPlayer.findMany({
        where: { leagueId, playerId: { in: playerIds }, droppedAt: null },
        select: { managerId: true, playerId: true },
      }),
    ]);

    const mgrIds = new Set<string>();
    for (const s of slots) mgrIds.add(s.managerId);
    for (const r of roster) mgrIds.add(r.managerId);
    const managers = await prisma.manager.findMany({
      where: { id: { in: [...mgrIds] } },
      select: { id: true, displayName: true },
    });
    const nameById = new Map(managers.map((m) => [m.id, m.displayName]));

    const slotByPlayer = new Map(slots.map((s) => [s.playerId, s]));
    const rosterByPlayer = new Map(roster.map((r) => [r.playerId, r]));
    for (const pid of playerIds) {
      // Prefer the lineup_slot fact (who actually fielded him this period) over plain roster ownership.
      const slot = slotByPlayer.get(pid);
      if (slot) {
        ownerByPlayer[pid] = {
          managerId: slot.managerId,
          managerName: nameById.get(slot.managerId) ?? "Unknown",
          isMe: slot.managerId === viewerManagerId,
          state: slot.isStarter ? "started" : "benched",
        };
        continue;
      }
      const r = rosterByPlayer.get(pid);
      if (r) {
        ownerByPlayer[pid] = {
          managerId: r.managerId,
          managerName: nameById.get(r.managerId) ?? "Unknown",
          isMe: r.managerId === viewerManagerId,
          state: "owned",
        };
      }
    }
  }

  // T18: the match's WC group table. Resolve the two in-match teams' group(s) from group_standing, then
  // fetch a superset of standing rows for those group(s) — the pure builder verifies the two teams share
  // ONE group, filters/sorts/flags, and decides tab visibility (A1). Read-only + Prisma owner-bypass like
  // the rest — group_standing is DISPLAY-ONLY (never read by scoring), so NO migration/RLS concern here.
  // Self-contained group identity: derived from group_standing.team_id, NEVER fifa_match.group_id (NULL).
  let standingRows: Array<{
    teamId: string;
    bdlGroupId: number;
    groupName: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
    team: { name: string | null } | null;
  }> = [];
  if (match.homeTeamId && match.awayTeamId) {
    const pairGroups = await prisma.groupStanding.findMany({
      where: { teamId: { in: [match.homeTeamId, match.awayTeamId] } },
      select: { bdlGroupId: true },
    });
    const groupIds = [...new Set(pairGroups.map((r) => r.bdlGroupId))];
    if (groupIds.length > 0) {
      standingRows = await prisma.groupStanding.findMany({
        where: { bdlGroupId: { in: groupIds } },
        select: {
          teamId: true,
          bdlGroupId: true,
          groupName: true,
          position: true,
          played: true,
          won: true,
          drawn: true,
          lost: true,
          goalsFor: true,
          goalsAgainst: true,
          goalDifference: true,
          points: true,
          team: { select: { name: true } },
        },
      });
    }
  }

  const view = buildGameDetail({
    match: {
      matchId: match.id,
      status: match.status as MatchStatus,
      kickoffIso: match.kickoffAt.toISOString(),
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      periodId: match.periodId,
      periodKind: (match.period?.kind ?? null) as PeriodKind | null,
      periodLabel: match.period?.label ?? null,
      round: match.round,
    },
    players: players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position as Position,
      teamId: p.teamId,
      nation: p.team?.name ?? null,
    })),
    stats: statRows.map((s) => ({
      playerId: s.playerId,
      minutesPlayed: s.minutesPlayed,
      goals: s.goals,
      assists: s.assists,
      saves: s.saves,
    })),
    scores: scoreRows.map((s) => ({ playerId: s.playerId, points: s.points })),
    ratings: ratingRows.map((r) => ({
      playerId: r.playerId,
      source: r.source as RatingSource,
      rating: r.rating,
    })),
    teamStats: teamStatRows.map((t) => ({
      teamId: t.teamId,
      possession: t.possession,
      offsides: t.offsides,
      shotsBlocked: t.shotsBlocked,
      // `extra` is the retained un-promoted feed jsonb; the builder reads keys defensively.
      extra: t.extra as unknown as Readonly<Record<string, unknown>> | null,
    })),
    standings: standingRows.map((s) => ({
      teamId: s.teamId,
      teamName: s.team?.name ?? null, // resolved name (P34); builder falls back to UNNAMED
      bdlGroupId: s.bdlGroupId,
      groupName: s.groupName,
      position: s.position,
      played: s.played,
      won: s.won,
      drawn: s.drawn,
      lost: s.lost,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalDifference,
      points: s.points,
    })),
    lineupEntries: lineupEntries.map((e) => ({ playerId: e.playerId, isStarter: e.isStarter })),
    events: eventRows.map((e) => ({
      incidentType: e.incidentType,
      incidentClass: e.incidentClass,
      timeMinute: e.timeMinute,
      addedTime: e.addedTime,
      playerId: e.playerId,
      assistPlayerId: e.assistPlayerId,
      playerInId: e.playerInId,
      playerOutId: e.playerOutId,
      rescinded: e.rescinded,
      period: e.period,
    })),
    ownerByPlayer,
    unresolvedFromPool,
  });

  // Safety net (read-only): the kickoff-XI reconciliation cascade flagged a side whose computed XI ≠ 11.
  // Surface it in the server log (match_id / team_id / count / kept / removed) — observable, never
  // swallowed; the builder still renders the kept set (no padding, no silent drop).
  for (const anomaly of view.lineupAnomalies) {
    console.warn("[game-detail] kickoff XI reconciliation anomaly", {
      matchId: view.header.matchId,
      side: anomaly.side,
      teamId: anomaly.teamId,
      count: anomaly.count,
      kept: anomaly.keptPlayerIds,
      removed: anomaly.removedPlayerIds,
    });
  }

  // Safety net (read-only, T16b): the events-timeline running score (replayed via the shared engine goal /
  // own-goal / VAR predicates) did not equal the stored authoritative final score on a terminal match, OR a
  // goal's scorer could not be placed on a side. Surface it — observable, never a silent timeline desync.
  if (view.eventScoreAnomaly) {
    console.warn("[game-detail] events running-score reconciliation anomaly", {
      matchId: view.header.matchId,
      ...view.eventScoreAnomaly,
    });
  }

  return view;
}
