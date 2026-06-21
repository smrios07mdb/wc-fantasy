/**
 * Server-side data loader for the set-lineup screen — the THIN Prisma edge that assembles the
 * authoritative {@link SetLineupState} the page hydrates. It reads the session manager's active 15-man
 * squad (roster_player, dropped_at IS NULL), the editable windows (the current OPEN period + upcoming
 * PENDING ones — the "set multiple lineups in advance" surface), and the manager's saved `lineup_slot`
 * rows per period (→ the starting XI + the lock-on-play projection). Like `@app/draft`'s loader this IO
 * edge has no unit test (it needs a live DB); `tsc` + the pure-logic suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { sortByPeriodOrder, isLockedNow, selectCurrentPeriod } from "@app/shared";
import { MATCH_DURATION_MS, periodIsDone } from "../../src/period/selectablePeriods";
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

  const [rosterRows, allPeriodRows, allSlotRows] = await Promise.all([
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
    // ALL league periods (T11) — no status filter. The editable windows (current + upcoming, NOT yet done)
    // plus the started/completed PRIOR matchdays the selector exposes read-only. `period.status` is NOT the
    // filter (it stays "pending" in prod until the hourly close cron); started/done is derived from the
    // fixtures' clock (matches[].kickoffAt + isPickLocked / MATCH_DURATION_MS via periodIsDone). frozenAt
    // feeds the forfeit-model movability gate; `kind` selects the roster MODE (knockout_round → playoff).
    prisma.period.findMany({
      where: { leagueId: manager.leagueId },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
      select: {
        id: true,
        label: true,
        status: true,
        closesAt: true,
        frozenAt: true,
        kind: true,
        matches: { orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true, status: true } },
      },
    }),
    // The manager's saved slots across ALL periods (managerId alone — his slots only exist in his league's
    // periods). Used to (a) decide which DONE periods to surface (only matchdays he actually played, never
    // a back-dateable never-set one) and (b) build each shown period's saved XI / locks below.
    prisma.lineupSlot.findMany({
      where: { managerId: sessionManagerId },
      select: { periodId: true, playerId: true, isStarter: true, lockedAt: true, voidedAt: true },
    }),
  ]);

  // Which periods reach the selector: every NOT-yet-done window (current + upcoming, editable) plus any
  // DONE prior the manager actually played (has ≥1 saved slot). A done period he never set is NOT shown —
  // there is nothing to view and it must never become a back-dateable target. Done periods render strictly
  // read-only (every slot locked-on-play; the client gates edits off `readOnly`).
  const playedPeriodIds = new Set(allSlotRows.map((s) => s.periodId));
  const periodRows = allPeriodRows.filter(
    (p) => !periodIsDone(p, now) || playedPeriodIds.has(p.id),
  );

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
  // The saved slots scoped to the SHOWN periods (allSlotRows was read by managerId across all periods).
  const slotRows = allSlotRows.filter((s) => periodIds.includes(s.periodId));
  // T11 Fix A: players who appear in a shown period's `lineup_slot` but are NOT in the current active
  // roster — i.e. SINCE-DROPPED players who were fielded in a prior (completed) matchday. A fielded
  // player's slot is locked-on-play at kickoff, so it survives the later drop (releaseDroppedPlayerSlots
  // deletes only UNLOCKED slots), and `allSlotRows` is read by managerId alone — so his locked historical
  // row is already in `slotRows`. He's missing only his identity (name/position/nation/team), because that
  // came from roster_player (dropped_at IS NULL). We fetch it here so a prior matchday can render him.
  const rosterIdSet = new Set(squadIds);
  const droppedSlotPlayerIds = [...new Set(slotRows.map((s) => s.playerId))].filter(
    (id) => !rosterIdSet.has(id),
  );
  // The display universe for the per-period maps (scores / kickoff / opponent / availability): the live
  // squad PLUS the since-dropped fielded players. For editable periods buildPitch reads only `squad`, so
  // the extra entries are inert there — the current-period path is unchanged.
  const displayPlayerIds = [...squadIds, ...droppedSlotPlayerIds];
  const [matchRows, scoreRows, lineupEntryRows, droppedPlayerRows] = await Promise.all([
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
    // Each display player's earned points per period — the authoritative "has played" (row exists) + the
    // "points at stake" (the score) for the C2 forfeit contract. Joined through the player's match in the
    // period (fifa_match.period_id). A player plays at most one match per period. Keyed on the full display
    // universe (squad + since-dropped fielded players) so a dropped starter's prior-matchday points resolve
    // rather than reading 0.
    periodIds.length && displayPlayerIds.length
      ? prisma.scorePlayerMatch.findMany({
          where: { playerId: { in: displayPlayerIds }, match: { periodId: { in: periodIds } } },
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
    // T11 Fix A: identity for the since-dropped fielded players (name/position/teamId + fifa_team.name for
    // nation), mirroring the roster `player` select above. They have no roster_player row, so this is the
    // only source for their LineupPlayer fields — used to render a prior matchday's historical snapshot.
    droppedSlotPlayerIds.length
      ? prisma.player.findMany({
          where: { id: { in: droppedSlotPlayerIds } },
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            position: true,
            teamId: true,
            team: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Resolve the since-dropped players to LineupPlayer (country via the fifa_team join, exactly as the roster
  // squad above) + their team link (for kickoff/opponent resolution). `playersById` is the full display
  // lookup the per-period snapshot is built from; `displayTeams` widens kickoff/opponent to cover them.
  const droppedPlayers: LineupPlayer[] = droppedPlayerRows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    firstName: r.firstName,
    lastName: r.lastName,
    position: r.position,
    country: r.team?.name ?? null,
  }));
  const droppedTeams = droppedPlayerRows.map((r) => ({ id: r.id, teamId: r.teamId }));
  const displayTeams = [...squadTeams, ...droppedTeams];
  const playersById = new Map<string, LineupPlayer>(
    [...squad, ...droppedPlayers].map((p) => [p.id, p]),
  );

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
    // Built over the full display universe (squad + since-dropped fielded players). Extra entries for
    // dropped players are inert on editable periods (buildPitch reads only `squad` there); a read-only
    // prior renders the snapshot, so its dropped starters need real hasPlayed/pointsAtStake meta.
    for (const player of playersById.values()) {
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
    // T11 Fix A: a read-only PRIOR matchday renders its OWN lineup_slot snapshot (the players actually set
    // that matchday — starters + bench, INCLUDING since-dropped ones), resolved via the full display
    // lookup. Editable periods stay roster-bound (undefined → the client falls back to `squad`), so the
    // current-period path is byte-unchanged. A slot whose player can't resolve (shouldn't happen) is
    // dropped rather than rendered as a blank.
    const readOnly = periodIsDone(p, now);
    const snapshotPlayers = readOnly
      ? [...new Set(slots.map((s) => s.playerId))]
          .map((id) => playersById.get(id))
          .filter((pl): pl is LineupPlayer => pl !== undefined)
      : undefined;
    return {
      periodId: p.id,
      label: p.label,
      // knockout_round drives the playoff reduced-roster mode (7+2, FORMATIONS_PO) in the validator + UI.
      kind: p.kind,
      status: p.status,
      // T11: a fully-completed prior matchday is STRICTLY READ-ONLY — anchored on the fixtures' clock
      // (periodIsDone: last kickoff + MATCH_DURATION_MS), NOT period.status (which lags). The client gates
      // EVERY mutation off this (formation picker, the tap-to-swap onSelect, and Save) — this is what makes
      // the historical view non-editable, since a never-appeared bench player has no locked_at. The server
      // write path is the independent backstop for any PLAYED slot (lock-on-play latch + the forfeit
      // play-state rules); the box-score drill-down stays available.
      readOnly,
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
      // Resolved over the full display universe (squad + since-dropped fielded players) so a snapshot's
      // dropped starter resolves his kickoff/opponent too; extra entries are inert on editable periods.
      kickoffByPlayer: resolveKickoffByPlayer(displayTeams, periodMatches),
      // Per-player opponent = the OTHER side of the same match row. Null for TBD/unplaying teams.
      // Resolved from the same periodMatches array — kickoff and opponent always reference the same row.
      opponentByPlayer: resolveOpponentByPlayer(displayTeams, periodMatches),
      // Per-player availability badge state, resolved against the SAME fixture row (same earliest-kickoff
      // tie-break) as kickoff/opponent above. null = lineup not announced for his match → no badge.
      starterStatusByPlayer: resolveStarterStatusByPlayer(displayTeams, periodMatches),
      // The historical snapshot for a read-only prior matchday (undefined for editable periods).
      snapshotPlayers,
    };
  });

  // Order the selector by canonical tournament progression (MD1…MD3, R32, R16, QF, SF, Final) — the
  // single source in @app/shared. NOT alphabetical (which mis-sorts Final/QF/R16/R32/SF) and NOT by
  // opens_at (null until fixtures sync → silently falls back to the alphabetical bug).
  const periods = sortByPeriodOrder(unorderedPeriods, (p) => p.label);
  // Default to the CURRENT live wave so the screen opens on the editable period (the prior matchdays are now
  // also in `periods`, so `periods[0]` could be an old read-only one). Derived from the fixtures' clock —
  // the live wave (now within its window), else the earliest upcoming editable, else the first shown period.
  // Mirrors loadVsField's current-period selection; never period.status alone. NOTE: this is the live wave,
  // not a literal byte-for-byte match of the old `find(status==="open") ?? periods[0]` — in prod, status is
  // stuck "pending", so the old default was always `periods[0]` (canonical MD1) even mid-tournament; this
  // intentionally opens on the genuinely-live wave instead (the same period the screen meant to show).
  const liveRow = selectCurrentPeriod(allPeriodRows, (p) => {
    const lastKickoffMs = p.matches.at(-1)?.kickoffAt.getTime() ?? 0;
    return now.getTime() < lastKickoffMs + MATCH_DURATION_MS;
  });
  const active =
    (liveRow && periods.find((p) => p.periodId === liveRow.id)) ??
    periods.find((p) => !p.readOnly) ??
    periods[0];
  return {
    sessionManagerId,
    displayName: manager.displayName,
    squad,
    periods,
    activePeriodId: active ? active.periodId : "",
    timezone: manager.league?.timezone ?? "UTC",
  };
}
