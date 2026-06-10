/**
 * Server-side data loader for the set-lineup screen — the THIN Prisma edge that assembles the
 * authoritative {@link SetLineupState} the page hydrates. It reads the session manager's active 15-man
 * squad (roster_player, dropped_at IS NULL), the editable windows (the current OPEN period + upcoming
 * PENDING ones — the "set multiple lineups in advance" surface), and the manager's saved `lineup_slot`
 * rows per period (→ the starting XI + the lock-on-play projection). Like `@app/draft`'s loader this IO
 * edge has no unit test (it needs a live DB); `tsc` + the pure-logic suites cover the shapes it produces.
 */
import { prisma } from "@app/db";
import { defaultStarterIds } from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup, SetLineupState } from "../../src/lineup/types";

/** Load the set-lineup snapshot for `sessionManagerId`, or null if the manager has no squad / windows. */
export async function loadLineup(sessionManagerId: string): Promise<SetLineupState | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: sessionManagerId },
    select: { id: true, leagueId: true, displayName: true },
  });
  if (!manager) return null;

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
      select: { id: true, label: true, status: true, closesAt: true },
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

  const periodIds = periodRows.map((p) => p.id);
  const slotRows = periodIds.length
    ? await prisma.lineupSlot.findMany({
        where: { managerId: sessionManagerId, periodId: { in: periodIds } },
        select: { periodId: true, playerId: true, isStarter: true, lockedAt: true },
      })
    : [];

  const periods: PeriodLineup[] = periodRows.map((p) => {
    const slots = slotRows.filter((s) => s.periodId === p.id);
    const savedStarters = slots.filter((s) => s.isStarter).map((s) => s.playerId);
    return {
      periodId: p.id,
      label: p.label,
      status: p.status,
      closesAt: p.closesAt ? p.closesAt.toISOString() : null,
      // A period the manager hasn't set yet starts from a legal default 4-4-2 he can adjust.
      starterIds: savedStarters.length > 0 ? savedStarters : defaultStarterIds(squad),
      locks: slots
        .filter((s) => s.lockedAt !== null)
        .map((s) => ({ playerId: s.playerId, isStarter: s.isStarter })),
      // TODO(prompt-NN): wire per-player kickoff from fifa_match(period_id, kickoff_at) via player.teamId
      // so the token shows "kicks off HH:MM"; the lock indicator (movable/locked) already comes from
      // lineup_slot.locked_at above. Left empty (graceful) until the live "vs the field" surface lands.
      kickoffByPlayer: {},
    };
  });

  const active = periods.find((p) => p.status === "open") ?? periods[0];
  return {
    sessionManagerId,
    displayName: manager.displayName,
    squad,
    periods,
    activePeriodId: active ? active.periodId : "",
  };
}
