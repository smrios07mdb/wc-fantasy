/**
 * Server-side data loader for the live "vs the field" screen — the THIN owner-bypass Prisma edge that
 * assembles the whole-league snapshot via the pure `buildVsField` (@app/vsfield). It is LEAGUE-SCOPED:
 * given the viewing manager it derives the league, then reads EVERY manager's current-period score +
 * starters + the period's fixtures + the season `standing` rows — the all-play-all field. Match status
 * (not the browser) decides "still to come", so the per-opponent lineups + match statuses are computed
 * here and never reach the browser directly (consistent with Theme F: the browser reads only
 * score_manager_period + standing over Realtime).
 *
 * Like the lineup/draft loaders this IO edge has no unit test (it needs a live DB); `tsc` + the pure
 * `buildVsField` suite cover the shapes it produces. It is shared by the SSR page AND `GET /api/vsfield`.
 */
import { prisma } from "@app/db";
import { loadEliminatedManagerIds } from "@app/faab/prisma";
import { buildPlayoffsView } from "@app/recompute";
import { loadCumulativeTournamentTotals } from "@app/recompute/prisma";
import {
  selectCurrentPeriod,
  isLockedNow,
  KNOCKOUT_ROUNDS,
  type KnockoutRound,
  type Position,
} from "@app/shared";
import { buildKnockoutContext, type KnockoutContext } from "@/src/vsfield/knockout";
import {
  resolveDisplayedPeriodId,
  selectableStartedPeriods,
  type PeriodForSelect,
} from "@/src/period/selectablePeriods";
import type { BenchPlayerView, ManagerBench, VsFieldViewWithBenches } from "@/src/vsfield/benches";
import type { FieldEntry, StarterState } from "@app/vsfield";

/** Max wall-clock window to consider a period still live after its last scheduled kickoff. */
const MATCH_DURATION_MS = 120 * 60 * 1000; // covers regulation + extra time
import {
  buildVsField,
  type BuildVsFieldInput,
  type ManagerLineupInput,
  type ManagerPeriodPoints,
  type PeriodMatchInput,
  type PeriodScores,
} from "@app/vsfield";

/**
 * Hide eliminated managers from the LIVE field only (CONTRACT-P3 data-existence contract: playoff
 * participation reads from `playoff_entry`, never `league.status`). A prior/historical period view
 * (`isLivePeriod = false`) keeps everyone, matching the matchday selector's "fully revealed because the
 * matchday is over" convention; the Season tab (`view.season`) is untouched in all cases — it's the
 * all-season record, not a live-field concept. PURE — extracted + exported (same convention as
 * `playerPointsLookup`) so the filter/re-rank is unit-tested without a live DB. `buildVsField` itself
 * stays untouched: this filters its OUTPUT, composed loader-side like `benches`.
 */
export function filterEliminatedFromField(
  field: FieldEntry[],
  eliminatedManagerIds: ReadonlySet<string>,
  isLivePeriod: boolean,
): FieldEntry[] {
  if (!isLivePeriod || eliminatedManagerIds.size === 0) return field;
  return field
    .filter((e) => !eliminatedManagerIds.has(e.managerId))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/**
 * Build a (playerId → points) lookup from the period's `score_player_match` rows, defaulting a player
 * with no scored row to 0. PURE — this is the path-(a) join the loader applies per starter: a
 * yet-to-play starter (or a live one with no row yet) reads 0; a played/live starter reads his real
 * `score_player_match.points`. Extracted + exported so it is unit-tested without a live DB (the IO
 * loader itself stays untested by design — same convention as loadDraftRoom's exported `toPlayer`).
 */
export function playerPointsLookup(
  rows: { playerId: string; points: number }[],
): (playerId: string) => number {
  // INVARIANT: at most one row per playerId in this read — `(matchId, playerId)` is the table's composite
  // PK (`@@id([matchId, playerId])`) and a team plays exactly one match per period, so a player maps to one
  // match. The Map's last-write-wins therefore never actually overwrites; it's a documented no-op, not an
  // aggregation choice (duplicate (matchId, playerId) rows are impossible by the schema).
  const byPlayer = new Map(rows.map((r) => [r.playerId, r.points] as const));
  return (playerId) => byPlayer.get(playerId) ?? 0;
}

/** Canonical bench display order (GK → DEF → MID → FWD); within a position the read order is kept. */
const BENCH_POS_RANK: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** The bench-relevant subset of a current-period `lineup_slot` row (a structural slice of the read). */
export interface BenchSlotRow {
  managerId: string;
  isStarter: boolean;
  playerId: string;
  role: Position;
  player: {
    displayName: string;
    /** `player.teamId` — used to look up the player's match status for T14 bench state derivation. */
    teamId: string | null;
    team: { name: string } | null;
  };
}

/**
 * Group the current period's BENCH slots (`is_starter = false`) per manager, ordered GK→DEF→MID→FWD for a
 * stable display. PURE — extracted + exported (same convention as `playerPointsLookup`) so the
 * partition/sort is unit-tested without a live DB. STARTER rows are skipped here: they flow into
 * `buildVsField` exactly as before, so benches never reach the @app/vsfield engine — they are a
 * display-only sibling of the snapshot.
 *
 * T14: `pointsForPlayer` and `matchStateByTeam` are threaded in from the loader (the SAME period-scoped
 * `score_player_match` read the starters use — no new query). A bench player with no score row gets 0 pts
 * + "yet-to-play". State derives from the player's team's match status: in_progress → "playing",
 * completed → "played", anything else → "yet-to-play".
 */
export function groupBenchesByManager(
  rows: BenchSlotRow[],
  pointsForPlayer: (playerId: string) => number = () => 0,
  matchStateByTeam: Map<string, StarterState> = new Map(),
): ManagerBench[] {
  const byManager = new Map<string, BenchPlayerView[]>();
  for (const s of rows) {
    if (s.isStarter) continue;
    let list = byManager.get(s.managerId);
    if (!list) {
      list = [];
      byManager.set(s.managerId, list);
    }
    const state: StarterState =
      (s.player.teamId ? matchStateByTeam.get(s.player.teamId) : undefined) ?? "yet-to-play";
    list.push({
      playerId: s.playerId,
      name: s.player.displayName,
      nation: s.player.team?.name ?? null,
      role: s.role,
      state,
      points: pointsForPlayer(s.playerId),
    });
  }
  return [...byManager.entries()].map(([managerId, players]) => ({
    managerId,
    players: players.sort((a, b) => BENCH_POS_RANK[a.role] - BENCH_POS_RANK[b.role]),
  }));
}

/**
 * Build the whole-league vs-the-field snapshot for the league `viewerManagerId` belongs to.
 *
 * `requestedPeriodId` (T11) selects which period the field shows. Omitted (or pointing at the live wave) →
 * byte-identical to the pre-T11 behaviour: the live wave is pinned via `selectCurrentPeriod`. A STARTED
 * prior period id is honoured (the whole field, fully revealed because the matchday is over). A
 * future/unstarted id is rejected by `resolveDisplayedPeriodId` and falls back to the live wave — the
 * server-side guarantee that the selector can never reveal a not-yet-locked matchday. There is ONE read
 * path: this loader, parameterised by the displayed period; no parallel ungated read exists.
 */
export async function loadVsField(
  viewerManagerId: string,
  requestedPeriodId?: string | null,
): Promise<VsFieldViewWithBenches | null> {
  const viewer = await prisma.manager.findUnique({
    where: { id: viewerManagerId },
    select: { id: true, leagueId: true },
  });
  if (!viewer) return null;
  const leagueId = viewer.leagueId;
  const now = new Date();

  const [managerRows, periodRows, standingRows, eliminatedManagerIds, playoffEntryRows] =
    await Promise.all([
    // The FULL league roster (no activity filter) — this is the inactive-0 contract: a manager with
    // no current-period score_manager_period row (and no XI) MUST still appear, so buildVsField pads
    // him to 0 points + empty XI and he is a free win for everyone strictly above (Prompt 04 line 42 /
    // Theme C). Closing this loader-side, NOT via the recompute sweeper writing 0 rows.
    prisma.manager.findMany({
      where: { leagueId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.period.findMany({
      where: { leagueId },
      select: {
        id: true,
        label: true,
        kind: true,
        status: true,
        // cutCount feeds the knockout ("The Cut") projection only — the per-round commissioner-set
        // cut (T15-CUT); an additive column on the SAME read, no new query.
        cutCount: true,
        // status is selected alongside kickoffAt so the T11 started-set predicate (isPickLocked on the
        // first fixture) can run on these rows without a second read.
        matches: { orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true, status: true } },
      },
      orderBy: [{ opensAt: "asc" }, { label: "asc" }],
    }),
    prisma.standing.findMany({
      where: { leagueId, scope: "group_stage" },
      select: {
        managerId: true,
        allPlayAllW: true,
        allPlayAllL: true,
        allPlayAllD: true,
        totalPoints: true,
        seed: true,
      },
    }),
    // The set of managers OUT OF CONTENTION for the live field — the data-existence eliminated predicate,
    // shared with /waivers via @app/faab/prisma so the two surfaces cannot drift (CONTRACT-P2/P3: playoff
    // participation is read from playoff_entry, NEVER league.status). It is EMPTY during the group phase
    // (no playoff_entry rows exist yet), so the hide below stays inert until the group→playoff transition;
    // once active it catches BOTH non-advancers (NO playoff_entry row — status is NULL, never the string
    // 'eliminated', the case the old status='eliminated' read silently missed) AND managers guillotined
    // mid-playoffs (status='eliminated'). Survivors (status='alive') are the only ones kept on the field.
    loadEliminatedManagerIds(prisma, leagueId),
    // The seeded knockout field (T15-CUT) — same read shape as loadPlayoffs. EMPTY during the group
    // phase (the transition writes the rows), which is the ko gate below: no entries → NO ko sibling,
    // group-phase output byte-identical. One cheap indexed query; playoff participation stays a
    // data-existence contract (CONTRACT-P2/P3), never league.status.
    prisma.playoffEntry.findMany({
      where: { leagueId },
      select: { managerId: true, seed: true, status: true, eliminatedRound: true },
    }),
  ]);

  // Current period: the open wave (if any), else the earliest period whose last match has not yet
  // finished (now < lastKickoff + MATCH_DURATION_MS). opensAt is never populated by the provisioning
  // CLI (NULL for all periods), so the DB ORDER BY opensAt falls back to label-alphabetical and would
  // put "Final" before "Group MD1" — selectCurrentPeriod re-sorts by matches[0].kickoffAt in JS.
  // The vsfield latch must be time-based (not batchClearedAt), because batchClearedAt is stamped
  // ~6h BEFORE first kickoff; using it as the latch would drop the live wave while MD1 matches are
  // still being played, binding the Realtime subscription and lineup/score reads to MD2 instead.
  // TODO(confirm): overlapping group waves ("which wave is the field") — sequential periods only.
  const livePeriodRow = selectCurrentPeriod(periodRows, (p) => {
    const lastKickoffMs = p.matches.at(-1)?.kickoffAt.getTime() ?? 0;
    return now.getTime() < lastKickoffMs + MATCH_DURATION_MS;
  });

  // T11 prior-matchday selector. The DISPLAYED period is the caller's requested started prior (if any),
  // else the live wave; a future/unstarted request is rejected (resolveDisplayedPeriodId) so the selector
  // can never reveal a not-yet-locked matchday. periodRows already carries every league period (no status
  // filter), so the selectable set + the displayed row are derived without an extra read.
  const periodsForSelect: PeriodForSelect[] = periodRows.map((p) => ({
    id: p.id,
    label: p.label,
    matches: p.matches,
  }));
  const displayedId = resolveDisplayedPeriodId(
    periodsForSelect,
    requestedPeriodId,
    livePeriodRow?.id ?? null,
    now,
  );
  const currentPeriodRow = periodRows.find((p) => p.id === displayedId) ?? null;
  const currentPeriod = currentPeriodRow
    ? { id: currentPeriodRow.id, label: currentPeriodRow.label }
    : null;
  // The displayed period is the live wave only when it IS the computed live wave; a prior is static, so the
  // client suppresses the Realtime subscription for it. The selector force-includes the computed live wave
  // (alwaysIncludeId below) so the default view always has a tab. During the inter-matchday gap the live
  // wave can itself be a not-yet-kicked-off period — it is force-included (tagged isLive:false) because it
  // is already the default reveal, NOT a new exposure; a period that is neither started NOR the live-wave
  // default is never in the set. (The gap-window default reveal is a PRE-EXISTING behaviour, see BACKLOG.)
  const isLivePeriod = currentPeriod !== null && currentPeriod.id === livePeriodRow?.id;
  const selectablePeriods = selectableStartedPeriods(
    periodsForSelect,
    now,
    livePeriodRow?.id ?? null,
  );

  // group_md periods feed the season "by period" chips (display enrichment over the standing headline).
  const groupMdPeriodIds = periodRows.filter((p) => p.kind === "group_md").map((p) => p.id);
  const scorePeriodIds = currentPeriod
    ? Array.from(new Set([currentPeriod.id, ...groupMdPeriodIds]))
    : groupMdPeriodIds;

  // ── T15-CUT: the knockout ("The Cut") projection inputs — the SAME reads loadPlayoffs makes,
  // composed additively here so /vsfield can carry the guillotine framing. Gated on the seeded field
  // existing (playoff_entry rows — the data-existence phase contract): during the group phase both
  // extra reads are skipped entirely and `ko` stays undefined (rider E).
  const knockoutPhaseActive = playoffEntryRows.length > 0;
  const koRoundIdx = (label: string): number => {
    const i = KNOCKOUT_ROUNDS.indexOf(label as KnockoutRound);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const orderedKnockoutPeriods = periodRows
    .filter((p) => p.kind === "knockout_round")
    .sort((a, b) => koRoundIdx(a.label) - koRoundIdx(b.label));
  const knockoutPeriodIds = orderedKnockoutPeriods.map((p) => p.id);
  const participantIds = playoffEntryRows.map((e) => e.managerId);

  const [scoreRows, lineupRows, matchRows, playerScoreRows, knockoutScoreRows, cumulativeTotals] =
    await Promise.all([
    scorePeriodIds.length
      ? prisma.scoreManagerPeriod.findMany({
          where: { periodId: { in: scorePeriodIds } },
          select: { managerId: true, periodId: true, points: true },
        })
      : Promise.resolve([]),
    currentPeriod
      ? // Read the FULL current-period lineup (starters AND bench) in ONE query: the starters feed
        // buildVsField exactly as before (filtered below), the `is_starter = false` rows are composed into
        // the display-only `benches` sibling. `isStarter` is selected so the two are partitioned in JS.
        prisma.lineupSlot.findMany({
          where: { periodId: currentPeriod.id },
          select: {
            managerId: true,
            playerId: true,
            role: true,
            lockedAt: true,
            isStarter: true,
            // displayName + the fifa_team name (NEVER player.country — P34) make the drill-in XI
            // identifiable. Per-player points are joined from the whole-field score_player_match read
            // below (path a) — SERVER-SIDE only; the box-score modal still serves the full breakdown.
            player: {
              select: { teamId: true, displayName: true, team: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    currentPeriod
      ? prisma.fifaMatch.findMany({
          where: { periodId: currentPeriod.id },
          select: {
            id: true,
            homeTeamId: true,
            awayTeamId: true,
            status: true,
            kickoffAt: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    // Whole-field per-player points for the current period (Prompt 41, path a): the SAME owner-bypass
    // source loadPlayerBox reads (score_player_match, joined to the period via match.periodId), but for
    // every starter at once (~N×11 rows — trivial payload). SERVER-SIDE only — this introduces NO
    // browser-direct read, NO RLS policy, NO publication entry, and NO migration; the points reach the
    // client solely inside this server-computed snapshot. The browser's direct read scope is unchanged
    // (still only score_manager_period + standing), so the live nudge→refetch carries the chip for free.
    currentPeriod
      ? prisma.scorePlayerMatch.findMany({
          where: { match: { periodId: currentPeriod.id } },
          select: { playerId: true, points: true },
        })
      : Promise.resolve([]),
    // T15-CUT: each knockout round's per-manager score (fallen pts-at-cut + the authoritative round
    // ranking) — skipped entirely pre-transition. Same shape as loadPlayoffs' knockoutScores read.
    knockoutPhaseActive && knockoutPeriodIds.length
      ? prisma.scoreManagerPeriod.findMany({
          where: { periodId: { in: knockoutPeriodIds }, managerId: { in: participantIds } },
          select: { periodId: true, managerId: true, points: true },
        })
      : Promise.resolve([]),
    // T15-CUT: the cumulative tournament totals — the SAME canonical helper the /playoffs loader and
    // the commish apply path share, so the displayed blade and the eventual cut cannot drift.
    knockoutPhaseActive
      ? loadCumulativeTournamentTotals(prisma, leagueId, participantIds)
      : Promise.resolve(new Map<string, number>()),
  ]);
  // Default a starter with no scored row (yet-to-play, or live-but-not-yet-appeared) to 0 points.
  const pointsForPlayer = playerPointsLookup(playerScoreRows);

  const currentPeriodScores: ManagerPeriodPoints[] = currentPeriod
    ? scoreRows
        .filter((r) => r.periodId === currentPeriod.id)
        .map((r) => ({ managerId: r.managerId, points: r.points }))
    : [];

  // Group the current period's starters per manager. The read now also returns bench rows (for the
  // `benches` sibling below), so the buildVsField input is restricted to `is_starter = true` here — the
  // engine input is byte-identical to before (bench rows never enter buildVsField).
  const lineupsByManager = new Map<string, ManagerLineupInput>();
  for (const s of lineupRows) {
    if (!s.isStarter) continue;
    let entry = lineupsByManager.get(s.managerId);
    if (!entry) {
      entry = { managerId: s.managerId, starters: [] };
      lineupsByManager.set(s.managerId, entry);
    }
    entry.starters.push({
      playerId: s.playerId,
      name: s.player.displayName,
      nation: s.player.team?.name ?? null,
      role: s.role,
      teamId: s.player.teamId,
      // Lock-on-play READ predicate: locked only once the stamped instant has arrived (not presence
      // alone) — a future-dated stamp still reads movable (DECISIONS Theme B). Shares loadLineup's `now`.
      locked: isLockedNow(s.lockedAt, now),
      // Path-(a) per-player points: real score_player_match.points for a played/live starter who has a
      // scored row; 0 otherwise (yet-to-play, or live-but-not-yet-appeared). Browser never reads this.
      points: pointsForPlayer(s.playerId),
    });
  }

  const matchStatuses: PeriodMatchInput[] = matchRows.map((m) => ({
    matchId: m.id,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: m.homeTeam?.name ?? null,
    awayTeamName: m.awayTeam?.name ?? null,
    status: m.status,
    kickoffAt: m.kickoffAt,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));

  // Per group_md period scores for the season chips.
  const perPeriodScores: PeriodScores[] = groupMdPeriodIds.map((pid) => ({
    periodId: pid,
    scores: scoreRows
      .filter((r) => r.periodId === pid)
      .map((r) => ({ managerId: r.managerId, points: r.points })),
  }));

  const input: BuildVsFieldInput = {
    leagueId,
    viewerManagerId,
    managers: managerRows.map((m) => ({ managerId: m.id, displayName: m.displayName })),
    currentPeriod,
    currentPeriodScores,
    lineupsForPeriod: [...lineupsByManager.values()],
    matchStatuses,
    standings: standingRows.map((s) => ({
      managerId: s.managerId,
      allPlayAllW: s.allPlayAllW,
      allPlayAllL: s.allPlayAllL,
      allPlayAllD: s.allPlayAllD,
      totalPoints: s.totalPoints,
      seed: s.seed,
    })),
    perPeriodScores,
    now,
  };

  // T14: bench state map — derived from the SAME matchRows already in scope (no new read). Both team sides
  // of each match map to the same StarterState so a player's teamId resolves directly.
  const matchStateByTeam = new Map<string, StarterState>();
  for (const m of matchRows) {
    const state: StarterState =
      m.status === "in_progress" ? "playing" : m.status === "completed" ? "played" : "yet-to-play";
    if (m.homeTeamId) matchStateByTeam.set(m.homeTeamId, state);
    if (m.awayTeamId) matchStateByTeam.set(m.awayTeamId, state);
  }

  // benches: the display-only sibling composed from the bench rows in the SAME lineup read. buildVsField
  // (the @app/vsfield engine) is untouched — its input/output never see the bench.
  const benches: ManagerBench[] = groupBenchesByManager(
    lineupRows,
    pointsForPlayer,
    matchStateByTeam,
  );

  const view = buildVsField(input);
  const field = filterEliminatedFromField(view.field, eliminatedManagerIds, isLivePeriod);

  // ── T15-CUT: the knockout ("The Cut") sibling — a PURE projection of buildPlayoffsView (the
  // authoritative ladder: provisional zone via the SAME resolveRoundCut the commish apply path calls)
  // over the PRE-filter field identities (fallen names come from the unfiltered engine output; the
  // §27 filter above stays byte-identical for the alive ladder). Composed ONLY when:
  //   (a) the displayed period IS the live knockout wave (live / pend arms), or
  //   (b) the tournament is complete and the caller is on the DEFAULT view (champion arm — there may
  //       be no live period at all post-Final; an explicitly selected prior stays a plain T11 view).
  // Group phase: no playoff_entry rows → `ko` is undefined and no extra read ran (rider E).
  let ko: KnockoutContext | undefined;
  if (knockoutPhaseActive && orderedKnockoutPeriods.length > 0) {
    const labelByPeriodId = new Map(orderedKnockoutPeriods.map((p) => [p.id, p.label] as const));
    const roundScores: Record<string, Record<string, number>> = {};
    for (const s of knockoutScoreRows) {
      const label = labelByPeriodId.get(s.periodId);
      if (!label) continue;
      (roundScores[label] ??= {})[s.managerId] = s.points;
    }
    const core = buildPlayoffsView({
      viewerManagerId,
      rounds: orderedKnockoutPeriods.map((p) => ({ label: p.label, cutCount: p.cutCount })),
      entries: playoffEntryRows.map((e) => ({
        managerId: e.managerId,
        seed: e.seed,
        status: e.status,
        eliminatedRound: e.eliminatedRound,
      })),
      roundScores,
      cumulativeTotals,
      groupPeriods: perPeriodScores,
    });
    const koCtx = buildKnockoutContext({
      core,
      viewerManagerId,
      field: view.field.map((e) => ({
        managerId: e.managerId,
        displayName: e.displayName,
        isMe: e.isMe,
        stillToCome: e.counts.yetToPlay + e.counts.noMatch,
      })),
      allMatchesCompleted: matchRows.length > 0 && matchRows.every((m) => m.status === "completed"),
    });
    const displayedIsLiveKnockout = isLivePeriod && currentPeriodRow?.kind === "knockout_round";
    const onDefaultView = displayedId === (livePeriodRow?.id ?? null);
    if (koCtx && (displayedIsLiveKnockout || (koCtx.complete && onDefaultView))) ko = koCtx;
  }

  return { ...view, field, benches, selectablePeriods, isLivePeriod, ko };
}
