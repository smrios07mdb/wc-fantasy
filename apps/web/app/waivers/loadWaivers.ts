/**
 * Server-side data loader for the FAAB waivers screen — the thin owner-bypass Prisma edge that assembles
 * everything `WaiversClient` renders (mirrors `loadVsField` / `loadLineup`). It is SELF-scoped for the
 * mutable bits (the viewer's budget, pending claims, roster) and league-scoped for the public bits (the
 * rolling waiver order, settled batch outcomes, the free-agent pool). All reads go through the Prisma
 * OWNER (RLS-bypassing); the screen is already gated by `getSessionManager()` in `page.tsx`.
 *
 * Like the other loaders this IO edge has no unit test (it needs a live DB); `tsc` + the pure
 * `waiversLogic` suite cover the shapes. Reads ONLY — every mutation is a `/api/faab/bid` round-trip.
 */
import { prisma } from "@app/db";
import { acquisitionWindowState, DEFAULT_FAAB_BATCH_LEAD_MIN, effectiveBatchAt } from "@app/faab";
import { listFaIneligiblePlayerIds, loadIsPlayoffParticipant } from "@app/faab/prisma";
import { findLockedSlotPlayerIds } from "@app/lineup/prisma";
import { rosterCapForLeagueStatus, selectCurrentPeriod, type Position } from "@app/shared";
import { buildBatchWindowView } from "@/src/waivers/waiversLogic";
import type {
  WaiversView,
  WvBatch,
  WvBatchWindow,
  WvClaim,
  WvPlayer,
  WvResult,
  WvWaiverSeat,
} from "@/src/waivers/types";

/** "Kylian Mbappé" → "K. Mbappé"; falls back to last/display when parts are missing. */
function shortNameOf(p: {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
}): string {
  if (p.firstName && p.lastName) return `${p.firstName[0]}. ${p.lastName}`;
  return p.lastName ?? p.displayName;
}

/** The Prisma player select shared by every player the screen renders. */
const PLAYER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  position: true,
  country: true,
  teamId: true,
  team: { select: { name: true } },
} as const;

type PlayerRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  position: Position;
  country: string | null;
  teamId: string | null;
  team: { name: string } | null;
};

export async function loadWaivers(viewerManagerId: string): Promise<WaiversView | null> {
  const manager = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true, faabBudget: true },
  });
  if (!manager) return null;
  const leagueId = manager.leagueId;
  const now = new Date();

  const [league, managerRows, pendingBids, rosterRows, upcomingMatches, seasonScores, periodRows] =
    await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { timezone: true, status: true },
      }),
      // Rolling waiver order + names (public). Seeded managers sort by position; unseeded (null) last.
      prisma.manager.findMany({
        where: { leagueId },
        select: { id: true, displayName: true, waiverOrderPosition: true },
        orderBy: [{ waiverOrderPosition: "asc" }, { displayName: "asc" }],
      }),
      // The viewer's OWN pending claims (self-scoped).
      prisma.faabBid.findMany({
        where: { managerId: viewerManagerId, status: "pending" },
        select: {
          id: true,
          amount: true,
          playerAdd: { select: PLAYER_SELECT },
          playerDrop: { select: PLAYER_SELECT },
        },
      }),
      // The viewer's current squad.
      prisma.rosterPlayer.findMany({
        where: { managerId: viewerManagerId, droppedAt: null },
        select: { player: { select: PLAYER_SELECT } },
      }),
      // The cutoff clock: every still-acquirable fixture, earliest first → per-team next kickoff.
      prisma.fifaMatch.findMany({
        where: { status: { in: ["scheduled", "in_progress"] } },
        select: { homeTeamId: true, awayTeamId: true, kickoffAt: true },
        orderBy: { kickoffAt: "asc" },
      }),
      // Season fantasy points per player (sum across matches) — "if available, else —".
      prisma.scorePlayerMatch.groupBy({ by: ["playerId"], _sum: { points: true } }),
      // Periods + each one's first kickoff — drives the "next batch" acquisition-window element. Mirrors
      // the worker cadence read (period + MIN-kickoff fixture) so web shows the EXACT instant it fires.
      prisma.period.findMany({
        where: { leagueId },
        select: {
          id: true,
          label: true,
          status: true,
          waiverBatchAt: true,
          batchClearedAt: true,
          matches: { orderBy: { kickoffAt: "asc" }, take: 1, select: { kickoffAt: true } },
        },
        orderBy: [{ opensAt: "asc" }, { label: "asc" }],
      }),
    ]);

  // The current period for the waiver window: the OPEN wave, else the soonest PENDING by first
  // fixture kickoff. Null (all closed / none pending) → the "next batch" element is hidden.
  // NOTE: opensAt is never populated by the provisioning CLI → DB-level ORDER BY opensAt falls
  // back to label-alphabetical, which puts "Final" before "Group MD1". selectCurrentWaiverPeriod
  // re-sorts by firstKickoffAt in JS. The phase + time come from @app/faab so the screen shows
  // the identical instant the worker's per-period batch trigger fires.
  const currentPeriodRow = selectCurrentPeriod(periodRows, (p) => p.batchClearedAt === null);

  let batchWindow: WvBatchWindow | null = null;
  if (currentPeriodRow) {
    const leadMin = Number(process.env.FAAB_BATCH_LEAD_MIN);
    const leadMs = (Number.isFinite(leadMin) ? leadMin : DEFAULT_FAAB_BATCH_LEAD_MIN) * 60_000;
    const cadence = {
      id: currentPeriodRow.id,
      leagueId,
      batchClearedAt: currentPeriodRow.batchClearedAt,
      waiverBatchAt: currentPeriodRow.waiverBatchAt,
      firstKickoffAt: currentPeriodRow.matches[0]?.kickoffAt ?? null,
    };
    batchWindow = buildBatchWindowView({
      phase: acquisitionWindowState(cadence, now),
      periodLabel: currentPeriodRow.label,
      batchAt: effectiveBatchAt(cadence, leadMs),
      firstKickoffAt: cadence.firstKickoffAt,
      timezone: league?.timezone ?? "UTC",
    });
  }

  // Per-team next kickoff (first wins because the rows are kickoff-ascending).
  const kickoffByTeam = new Map<string, Date>();
  for (const m of upcomingMatches) {
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (teamId && !kickoffByTeam.has(teamId)) kickoffByTeam.set(teamId, m.kickoffAt);
    }
  }
  const seasonByPlayer = new Map<string, number>();
  for (const s of seasonScores) seasonByPlayer.set(s.playerId, s._sum.points ?? 0);

  const toPlayer = (p: PlayerRow): WvPlayer => {
    const ko = p.teamId ? kickoffByTeam.get(p.teamId) : undefined;
    return {
      id: p.id,
      name: p.displayName,
      shortName: shortNameOf(p),
      position: p.position,
      // Country for the flag/chip. `player.country` is never written by ingestion (the column shape is
      // unverified — see loadLineup / loadDraftRoom), so country comes from the fifa_team join, matching
      // how the draft + lineup loaders derive it. Falls back to the column if a team isn't linked.
      nation: p.team?.name ?? p.country,
      teamName: p.team?.name ?? null,
      kickoffAt: ko ? ko.toISOString() : null,
      seasonPoints: seasonByPlayer.get(p.id) ?? null,
    };
  };

  const roster = rosterRows.map((r) => toPlayer(r.player));
  const lockedSet = await findLockedSlotPlayerIds(prisma, {
    managerId: viewerManagerId,
    playerIds: roster.map((p) => p.id),
  });

  // The free-agent pool = LIVE-UNOWNED in EVERY phase (commish decision Jun 18 2026): a player is a free
  // agent the moment he holds no active roster spot. The sealed-bid composer and the free-agency $0 panel
  // now offer the SAME set, resolved via the one predicate the route re-checks at grant time
  // (`listFaIneligiblePlayerIds` → `liveOwnedWhere`) — so a player shown as a free agent is exactly one
  // the $0 grant accepts (a stale list only falls through to the route's `fa-conflict` 409). The earlier
  // phase split (snapshot pool in free-agency, live-unowned elsewhere) is retired with the anti-snipe hold.
  const excludeIds = await listFaIneligiblePlayerIds(prisma, leagueId);
  const freeAgentRows = await prisma.player.findMany({
    where: { id: { notIn: excludeIds.size ? [...excludeIds] : ["__none__"] } },
    select: PLAYER_SELECT,
    orderBy: { displayName: "asc" },
  });
  const freeAgents = freeAgentRows.map(toPlayer);

  const claims: WvClaim[] = pendingBids.map((b) => ({
    bidId: b.id,
    amount: b.amount,
    add: toPlayer(b.playerAdd),
    drop: b.playerDrop ? toPlayer(b.playerDrop) : null,
  }));

  // Recent settled batches (public post-batch per RLS) with all managers' revealed outcomes.
  const batchRows = await prisma.faabBatch.findMany({
    where: { leagueId, status: "complete" },
    orderBy: { runAt: "desc" },
    take: 5,
    select: {
      id: true,
      runAt: true,
      bids: {
        select: {
          id: true,
          managerId: true,
          amount: true,
          status: true,
          manager: { select: { displayName: true } },
          playerAdd: { select: PLAYER_SELECT },
          playerDrop: { select: PLAYER_SELECT },
        },
        orderBy: { amount: "desc" },
      },
    },
  });

  const batches: WvBatch[] = batchRows.map((batch) => ({
    batchId: batch.id,
    runAt: batch.runAt.toISOString(),
    results: batch.bids.map(
      (b): WvResult => ({
        bidId: b.id,
        managerId: b.managerId,
        managerName: b.manager.displayName,
        isMine: b.managerId === viewerManagerId,
        add: toPlayer(b.playerAdd),
        drop: b.playerDrop ? toPlayer(b.playerDrop) : null,
        amount: b.amount,
        outcome: b.status === "won" ? "won" : b.status === "voided_refunded" ? "void" : "lost",
      }),
    ),
  }));

  const waiverOrder: WvWaiverSeat[] = managerRows
    .filter((m) => m.waiverOrderPosition !== null)
    .map((m) => ({
      managerId: m.id,
      name: m.id === viewerManagerId ? "You" : m.displayName,
      position: m.waiverOrderPosition as number,
      isMe: m.id === viewerManagerId,
    }));

  // The phase squad cap (15 group / 9 playoff) is VIEW-DRIVEN (no hardcoded 15 in the client). D4
  // participation gates the affordances; outside the playoff phase everyone participates.
  const leagueStatus = league?.status ?? "draft";
  const isPlayoffPhase = leagueStatus === "playoff";
  const isParticipant = await loadIsPlayoffParticipant(prisma, {
    leagueStatus,
    leagueId,
    managerId: viewerManagerId,
  });
  // The forfeit bound = the current (R32) period's first kickoff, league-wide — the CONSERVATIVE earliest
  // possible per-player lock. A survivor's own earliest kickoff may be later, but this is the safe display.
  const playoffForfeitDeadlineIso =
    isPlayoffPhase && currentPeriodRow?.matches[0]?.kickoffAt
      ? currentPeriodRow.matches[0].kickoffAt.toISOString()
      : null;

  return {
    managerId: viewerManagerId,
    faabBudget: manager.faabBudget,
    roster,
    lockedPlayerIds: [...lockedSet],
    freeAgents,
    claims,
    batches,
    waiverOrder,
    batchWindow,
    timezone: league?.timezone ?? "UTC",
    isPlayoffPhase,
    rosterCap: rosterCapForLeagueStatus(leagueStatus),
    isParticipant,
    playoffForfeitDeadlineIso,
    nowIso: now.toISOString(),
  };
}
