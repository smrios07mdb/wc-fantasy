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
import {
  listFaIneligiblePlayerIds,
  loadIsPlayoffParticipant,
  loadPlayoffPhaseActive,
} from "@app/faab/prisma";
import { findLockedSlotPlayerIds } from "@app/lineup/prisma";
import { rosterCapForPlayoffPhase, selectCurrentPeriod, type Position } from "@app/shared";
// Read-only reuse of the set-lineup opponent resolver (exported Prompt 53) so the FA picker's
// "next opponent" tag is field-for-field the SAME derivation as lineup's OpponentTag — never re-derived.
import { resolveOpponentByPlayer } from "../../src/lineup/view";
import { buildBatchWindowView } from "@/src/waivers/waiversLogic";
import type {
  WaiversView,
  WvBatch,
  WvBatchWindow,
  WvClaim,
  WvPlayer,
  WvResult,
  WvTeamBudget,
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

  const [
    league,
    managerRows,
    pendingBids,
    rosterRows,
    upcomingMatches,
    seasonScores,
    periodRows,
    watchlistRows,
  ] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { timezone: true },
    }),
    // Rolling waiver order + names (public). Seeded managers sort by position; unseeded (null) last.
    // Also carries faabBudget — the SAME stored column the resolver debits on a won claim
    // (`prismaStore.ts` `data: { faabBudget: { decrement: r.amount } }`), never recomputed from bid
    // history, so the team-budgets rail is read-only and always agrees with the engine.
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true, waiverOrderPosition: true, faabBudget: true },
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
    // The cutoff clock: every still-acquirable fixture, earliest first → per-team next kickoff AND next
    // opponent. The team-name joins feed `resolveOpponentByPlayer`'s "vs/@ + flag + name" label.
    prisma.fifaMatch.findMany({
      where: { status: { in: ["scheduled", "in_progress"] } },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        kickoffAt: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
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
        // matches[0].kickoffAt feeds the batch-window first kickoff + selectCurrentPeriod. batchClearedAt
        // (above) keys the per-matchday Batch results labels (T11 Fix B); no other period read is needed.
        matches: { orderBy: { kickoffAt: "asc" }, take: 1, select: { kickoffAt: true } },
      },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
    }),
    // The viewer's OWN private watchlist (self-scoped, mirrors the pendingBids/rosterRows self-scope
    // above). Just the starred player ids — the UI keys its star toggle + "Watched" filter off this set.
    prisma.watchlist.findMany({
      where: { managerId: viewerManagerId },
      select: { playerId: true },
    }),
  ]);

  // The current period for the waiver window: the OPEN wave, else the soonest PENDING by first
  // fixture kickoff. Null (all closed / none pending) → the "next batch" element is hidden.
  // NOTE: opensAt is never populated by the provisioning CLI → DB-level ORDER BY opensAt falls
  // back to label-alphabetical, which puts "Final" before "Group MD1". selectCurrentWaiverPeriod
  // re-sorts by firstKickoffAt in JS. The phase + time come from @app/faab so the screen shows
  // the identical instant the worker's per-period batch trigger fires.
  const currentPeriodRow = selectCurrentPeriod(periodRows, (p) => p.batchClearedAt === null);

  // T11 Fix B: map each settled batch to the matchday it cleared. A period stamps its `batch_cleared_at`
  // with the batch's `run_at` in the SAME settlement transaction, so equality of those instants is the
  // batch↔period key (faab_batch has no period_id). This is the ONLY period concept on /waivers — the FA
  // pool / claims / player cards stay live/global (the over-applied prior-matchday selector was removed).
  const periodLabelByClearedAt = new Map<string, string>();
  for (const p of periodRows) {
    if (p.batchClearedAt) periodLabelByClearedAt.set(p.batchClearedAt.toISOString(), p.label);
  }

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
  // The same fixture set reshaped into the lineup helper's `PeriodMatch` contract (ISO kickoff + team
  // names). `resolveOpponentByPlayer` uses the SAME earliest-kickoff tie-break as the kickoff map above,
  // so a free agent's cutoff clock and his "next opponent" always reference one and the same fixture.
  const periodMatches = upcomingMatches.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    kickoffAt: m.kickoffAt.toISOString(),
    homeTeamName: m.homeTeam?.name ?? null,
    awayTeamName: m.awayTeam?.name ?? null,
  }));
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
  // Each free agent's NEXT opponent ("vs/@ + flag + name"), resolved per-player via the shared lineup
  // helper (T8). Threaded only onto the free-agent pool — the lone picker that renders it; null when the
  // player's team has no still-acquirable fixture (→ the row shows "TBD").
  const opponentByFreeAgent = resolveOpponentByPlayer(
    freeAgentRows.map((p) => ({ id: p.id, teamId: p.teamId })),
    periodMatches,
  );
  const freeAgents = freeAgentRows.map((p) => ({
    ...toPlayer(p),
    opponent: opponentByFreeAgent[p.id] ?? null,
  }));

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
    // The matchday this batch settled (period whose batch_cleared_at == this run_at); null if none maps.
    matchdayLabel: periodLabelByClearedAt.get(batch.runAt.toISOString()) ?? null,
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

  // Every team's remaining FAAB, budget-desc — display-only, read straight off `manager.faabBudget`.
  const teamBudgets: WvTeamBudget[] = [...managerRows]
    .sort((a, b) => b.faabBudget - a.faabBudget)
    .map((m) => ({
      managerId: m.id,
      name: m.id === viewerManagerId ? "You" : m.displayName,
      budget: m.faabBudget,
      isMe: m.id === viewerManagerId,
    }));

  // The phase squad cap (15 group / 9 playoff) is VIEW-DRIVEN (no hardcoded 15 in the client). D4
  // participation gates the affordances; outside the playoff phase everyone participates. The phase is
  // derived from playoff_entry EXISTENCE (the data-existence contract the dashboard/playoffs loaders honor),
  // NEVER league.status — see DECISIONS → "FAAB/waiver phase derives from playoff_entry existence".
  // selectTournamentPhase is deliberately NOT the signal here (it would regress the R32 pre-kickoff trim
  // window and the post-tournament state).
  const playoffPhaseActive = await loadPlayoffPhaseActive(prisma, leagueId);
  const isParticipant = await loadIsPlayoffParticipant(prisma, {
    playoffPhaseActive,
    leagueId,
    managerId: viewerManagerId,
  });
  // The forfeit bound = the current (R32) period's first kickoff, league-wide — the CONSERVATIVE earliest
  // possible per-player lock. A survivor's own earliest kickoff may be later, but this is the safe display.
  const playoffForfeitDeadlineIso =
    playoffPhaseActive && currentPeriodRow?.matches[0]?.kickoffAt
      ? currentPeriodRow.matches[0].kickoffAt.toISOString()
      : null;

  return {
    managerId: viewerManagerId,
    faabBudget: manager.faabBudget,
    roster,
    lockedPlayerIds: [...lockedSet],
    freeAgents,
    watchedPlayerIds: watchlistRows.map((w) => w.playerId),
    claims,
    batches,
    waiverOrder,
    teamBudgets,
    batchWindow,
    timezone: league?.timezone ?? "UTC",
    isPlayoffPhase: playoffPhaseActive,
    rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive),
    isParticipant,
    playoffForfeitDeadlineIso,
    nowIso: now.toISOString(),
  };
}
