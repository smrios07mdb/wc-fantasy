/**
 * Server-side data loader for the set-lineup screen — the THIN Prisma edge that assembles the
 * authoritative {@link SetLineupState} the page hydrates. It reads the session manager's active 15-man
 * squad (roster_player, dropped_at IS NULL), the editable windows (the current OPEN period + upcoming
 * PENDING ones — the "set multiple lineups in advance" surface), and the manager's saved `lineup_slot`
 * rows per period (→ the starting XI + the lock-on-play projection). Like `@app/draft`'s loader this IO
 * edge has no unit test (it needs a live DB); `tsc` + the pure-logic suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { sortByPeriodOrder, isLockedNow } from "@app/shared";
import {
  defaultStarterIds,
  formationSetForKind,
  resolveKickoffByPlayer,
  resolveOpponentByPlayer,
  resolveStarterStatusByPlayer,
} from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup, SetLineupState, SlotMeta } from "../../src/lineup/types";

/** Load the set-lineup snapshot for `sessionManagerId`, or null if the manager has no squad / windows. */
export async function loadLineup(sessionManagerId: string): Promise<SetLineupState | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: sessionManagerId },
    select: { id: true, leagueId: true, displayName: true, league: { select: { timezone: true } } },
  });
  if (!manager) return null;

  // Lock-on-play READ instant: a slot reads as locked only once its stamped `locked_at` has ARRIVED
  // (isLockedNow), never on presence alone — a future-dated stamp is still movable (DECISIONS Theme B).
  const now = new Date();

  const [rosterRows, periodRows] = await Promise.all([
    prisma.rosterPlayer.findMany({
      where: { managerId: sessionManagerId, droppedAt: null },
      select: {
        player: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            position: true,
            // teamId drives the per-player kickoff resolution (team → this period's fixture).
            teamId: true,
            // player.country DB column is never written by ingestion; country comes from the
            // fifa_team join, matching how loadDraftRoom.toPlayer derives it.
            team: { select: { name: true } },
          },
        },
      },
    }),
    // The editable windows: the current OPEN period + upcoming PENDING ones, soonest first.
    prisma.period.findMany({
      where: { leagueId: manager.leagueId, status: { in: ["open", "pending"] } },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
      // frozenAt feeds the forfeit-model movability gate (frozen period → nothing movable). `kind`
      // selects the roster MODE downstream: knockout_round → playoff reduced roster (7+2, FORMATIONS_PO).
      select: { id: true, label: true, status: true, closesAt: true, frozenAt: true, kind: true },
    }),
  ]);

  const squad: LineupPlayer[] = rosterRows.map((r) => ({
    id: r.player.id,
    displayName: r.player.displayName,
    firstName: r.player.firstName,
    lastName: r.player.lastName,
    position: r.player.position,
    country: r.player.team?.name ?? null,
  }));
  // The team link each squad player resolves his fixture through (kept out of the LineupPlayer the client
  // renders — it's only needed here to map player → this period's kickoff + opponent).
  const squadTeams = rosterRows.map((r) => ({ id: r.player.id, teamId: r.player.teamId }));

  const periodIds = periodRows.map((p) => p.id);
  const squadIds = squad.map((p) => p.id);
  const [slotRows, matchRows, scoreRows, lineupEntryRows] = await Promise.all([
    periodIds.length
      ? prisma.lineupSlot.findMany({
          where: { managerId: sessionManagerId, periodId: { in: periodIds } },
          // voidedAt is the forfeit latch (the C2 read contract); lockedAt still drives `locks` (unchanged).
          select: {
            periodId: true,
            playerId: true,
            isStarter: true,
            lockedAt: true,
            voidedAt: true,
          },
        })
      : Promise.resolve([]),
    // Each period's fixtures — drives both the per-player kickoff (= lock/sub deadline) and the
    // per-player opponent label. homeTeam/awayTeam names are the flag-resolver inputs (same source
    // as player.country on the roster side — fifa_team.name). One read, two outputs.
    periodIds.length
      ? prisma.fifaMatch.findMany({
          where: { periodId: { in: periodIds } },
          select: {
            id: true,
            periodId: true,
            homeTeamId: true,
            awayTeamId: true,
            kickoffAt: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    // Each squad player's earned points per period — the authoritative "has played" (row exists) + the
    // "points at stake" (the score) for the C2 forfeit contract. Joined through the player's match in the
    // period (fifa_match.period_id). A player plays at most one match per period.
    periodIds.length && squadIds.length
      ? prisma.scorePlayerMatch.findMany({
          where: { playerId: { in: squadIds }, match: { periodId: { in: periodIds } } },
          select: { playerId: true, points: true, match: { select: { periodId: true } } },
        })
      : Promise.resolve([]),
    // The pre-kickoff availability snapshot for this period's fixtures (the worker's T-75 peek). ALL
    // entries (both teams, XI + bench) — so "match has entries" is judged on the whole sheet, not just
    // the squad's players. Drives each player's Starting / Not starting badge; no rows → no badge.
    periodIds.length
      ? prisma.matchLineupEntry.findMany({
          where: { match: { periodId: { in: periodIds } } },
          select: { matchId: true, playerId: true, isStarter: true },
        })
      : Promise.resolve([]),
  ]);

  // matchId → { playerId → is_starter }: the per-fixture snapshot the resolver keys on. A populated map
  // for a match ⇔ its lineup has been announced (the peek writes nothing on an empty sheet).
  const entriesByMatch = new Map<string, Record<string, boolean>>();
  for (const e of lineupEntryRows) {
    const m = entriesByMatch.get(e.matchId) ?? {};
    m[e.playerId] = e.isStarter;
    entriesByMatch.set(e.matchId, m);
  }

  const unorderedPeriods: PeriodLineup[] = periodRows.map((p) => {
    const slots = slotRows.filter((s) => s.periodId === p.id);
    const savedStarters = slots.filter((s) => s.isStarter).map((s) => s.playerId);

    // The C1 forfeit read contract per squad player (C2 consumes; C1 renders none of it). hasPlayed /
    // pointsAtStake come ONLY from score_player_match; voided from the slot; movable = period not frozen
    // AND not voided (has-played no longer blocks movement). The live client ignores this and still drives
    // drag off `locks` below — so no destructive bench affordance appears pre-C2.
    const pointsByPlayer = new Map(
      scoreRows
        .filter((r) => r.match.periodId === p.id)
        .map((r) => [r.playerId, r.points] as const),
    );
    const voidedByPlayer = new Map(slots.map((s) => [s.playerId, s.voidedAt !== null] as const));
    const periodFrozen = p.frozenAt !== null;
    const slotMeta: Record<string, SlotMeta> = {};
    for (const player of squad) {
      const voided = voidedByPlayer.get(player.id) ?? false;
      slotMeta[player.id] = {
        hasPlayed: pointsByPlayer.has(player.id),
        pointsAtStake: pointsByPlayer.get(player.id) ?? 0,
        voided,
        movable: !periodFrozen && !voided,
      };
    }

    const periodMatches = matchRows
      .filter((m) => m.periodId === p.id)
      .map((m) => ({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        kickoffAt: m.kickoffAt.toISOString(),
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
        // This fixture's official-lineup snapshot (or undefined when not yet peeked) — drives the badge.
        starterByPlayer: entriesByMatch.get(m.id),
      }));
    return {
      periodId: p.id,
      label: p.label,
      // knockout_round drives the playoff reduced-roster mode (7+2, FORMATIONS_PO) in the validator + UI.
      kind: p.kind,
      status: p.status,
      closesAt: p.closesAt ? p.closesAt.toISOString() : null,
      // A period the manager hasn't set yet starts from the first FILLABLE formation in its mode's offer
      // set (group: canonical 4-3-3 when his squad can field it, else a shape it can — e.g. a 3-DEF squad
      // opens on 3-4-3; playoff: canonical 2-3-1 over FORMATIONS_PO). A saved lineup is loaded as-is.
      starterIds:
        savedStarters.length > 0
          ? savedStarters
          : defaultStarterIds(squad, formationSetForKind(p.kind)),
      locks: slots
        .filter((s) => isLockedNow(s.lockedAt, now))
        .map((s) => ({ playerId: s.playerId, isStarter: s.isStarter })),
      slotMeta,
      // Per-player kickoff = his team's fixture kickoff in THIS period (ISO), or null when his team
      // isn't playing yet (knockout TBD). The client formats it in the league tz as the lock/sub deadline.
      kickoffByPlayer: resolveKickoffByPlayer(squadTeams, periodMatches),
      // Per-player opponent = the OTHER side of the same match row. Null for TBD/unplaying teams.
      // Resolved from the same periodMatches array — kickoff and opponent always reference the same row.
      opponentByPlayer: resolveOpponentByPlayer(squadTeams, periodMatches),
      // Per-player availability badge state, resolved against the SAME fixture row (same earliest-kickoff
      // tie-break) as kickoff/opponent above. null = lineup not announced for his match → no badge.
      starterStatusByPlayer: resolveStarterStatusByPlayer(squadTeams, periodMatches),
    };
  });

  // Order the selector by canonical tournament progression (MD1…MD3, R32, R16, QF, SF, Final) — the
  // single source in @app/shared. NOT alphabetical (which mis-sorts Final/QF/R16/R32/SF) and NOT by
  // opens_at (null until fixtures sync → silently falls back to the alphabetical bug).
  const periods = sortByPeriodOrder(unorderedPeriods, (p) => p.label);
  const active = periods.find((p) => p.status === "open") ?? periods[0];
  return {
    sessionManagerId,
    displayName: manager.displayName,
    squad,
    periods,
    activePeriodId: active ? active.periodId : "",
    timezone: manager.league?.timezone ?? "UTC",
  };
}
