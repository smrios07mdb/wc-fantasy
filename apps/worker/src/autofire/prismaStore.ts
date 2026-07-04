/**
 * Prisma-backed {@link AutoFireStore} — the production adapter for the playoff round auto-fire
 * (feat/autofire-round-cut). Pure IO: it READS the knockout-round facts (status + the freeze-proxy last-FT +
 * the already-cut mark), the team names, and the flagged commissioners. It writes NOTHING — every mutation
 * is the untouched `runRoundAdvance` orchestrator's (the cut/release/audit) or `@app/notify`'s (the alert
 * ledger + push). It has no unit test (it needs a live DB); the gated-PG suite ({@link ./dispatch.integration.test})
 * pins its reads, and `tsc --noEmit` covers the shapes.
 */
import type { PrismaClient } from "@app/db";
import type { EventRow, ScoreInputBundle, ShotRow, StatRow } from "@app/recompute";
import type { AutoFireRoundRow, AutoFireStore } from "./store";
import type { FixtureCompleteness, RoundCompletenessInput } from "./completeness";

/** The `stat_player_match` columns that map 1:1 onto {@link StatRow} (drives `statHasData` in the reused
 *  participant gate). Kept explicit + mirroring the recompute adapter's `getPlayerMatchInput` mapping so
 *  the two never drift silently. */
const STAT_ROW_SELECT = {
  minutesPlayed: true,
  goals: true,
  assists: true,
  keyPasses: true,
  dribblesAttempted: true,
  dribblesCompleted: true,
  duelsWon: true,
  duelsLost: true,
  passesTotal: true,
  passesAccurate: true,
  longBallsTotal: true,
  longBallsAccurate: true,
  wasFouled: true,
  clearances: true,
  blockedShots: true,
  interceptions: true,
  tacklesWon: true,
  saves: true,
  savesInsideBox: true,
  punches: true,
  highClaims: true,
  possessionLost: true,
  shotsOnTarget: true,
  ballRecoveries: true,
  bigChancesCreated: true,
  crossesAccurate: true,
  touches: true,
} as const;

function toStatRow(s: Record<keyof StatRow, number | null>): StatRow {
  return {
    minutesPlayed: s.minutesPlayed,
    goals: s.goals,
    assists: s.assists,
    keyPasses: s.keyPasses,
    dribblesAttempted: s.dribblesAttempted,
    dribblesCompleted: s.dribblesCompleted,
    duelsWon: s.duelsWon,
    duelsLost: s.duelsLost,
    passesTotal: s.passesTotal,
    passesAccurate: s.passesAccurate,
    longBallsTotal: s.longBallsTotal,
    longBallsAccurate: s.longBallsAccurate,
    wasFouled: s.wasFouled,
    clearances: s.clearances,
    blockedShots: s.blockedShots,
    interceptions: s.interceptions,
    tacklesWon: s.tacklesWon,
    saves: s.saves,
    savesInsideBox: s.savesInsideBox,
    punches: s.punches,
    highClaims: s.highClaims,
    possessionLost: s.possessionLost,
    shotsOnTarget: s.shotsOnTarget,
    ballRecoveries: s.ballRecoveries,
    bigChancesCreated: s.bigChancesCreated,
    crossesAccurate: s.crossesAccurate,
    touches: s.touches,
  };
}

export function createPrismaAutoFireStore(prisma: PrismaClient): AutoFireStore {
  return {
    async loadLeagueId(): Promise<string | null> {
      const league = await prisma.league.findFirst({ select: { id: true } });
      return league?.id ?? null;
    },

    async loadKnockoutRounds(leagueId: string): Promise<AutoFireRoundRow[]> {
      const periods = await prisma.period.findMany({
        where: { leagueId, kind: "knockout_round" },
        select: {
          id: true,
          label: true,
          status: true,
          matches: { select: { kickoffAt: true } },
        },
      });

      // Which knockout rounds are already cut (≥1 entry stamped `eliminated_round`) — the SAME migration-free
      // idempotency signal `createPrismaPlayoffAdvanceStore.loadRoundContext` reads (advanceStore.ts).
      const cutMarks = await prisma.playoffEntry.findMany({
        where: { leagueId, eliminatedRound: { not: null } },
        select: { eliminatedRound: true },
        distinct: ["eliminatedRound"],
      });
      const cut = new Set(cutMarks.map((m) => m.eliminatedRound!));

      return periods.map((p) => ({
        periodId: p.id,
        label: p.label,
        status: p.status,
        // The freeze-proxy last-FT: max(kickoffAt) among the round's fixtures (freeze.ts P45 — no completed-at
        // column exists). null when the round carries no fixtures (no anchor for the settle window).
        lastFtMs: p.matches.length
          ? Math.max(...p.matches.map((m) => m.kickoffAt.getTime()))
          : null,
        alreadyCut: cut.has(p.label),
      }));
    },

    async loadTeamNames(leagueId: string): Promise<Record<string, string>> {
      const rows = await prisma.manager.findMany({
        where: { leagueId },
        select: { id: true, displayName: true },
      });
      const out: Record<string, string> = {};
      for (const m of rows) out[m.id] = m.displayName;
      return out;
    },

    async loadCommissionerManagerIds(leagueId: string): Promise<string[]> {
      const rows = await prisma.manager.findMany({
        where: { leagueId, isCommissioner: true },
        select: { id: true },
      });
      return rows.map((m) => m.id);
    },

    async loadRoundCompleteness(roundPeriodId: string): Promise<RoundCompletenessInput> {
      // BULK reads for the whole round (one query per table, NOT per player) — this runs each tick while a
      // round is closed-but-incomplete, so per-player round-trips would be a resident-worker foot-gun.
      const matches = await prisma.fifaMatch.findMany({
        where: { periodId: roundPeriodId },
        select: { id: true, status: true, homeTeamId: true, awayTeamId: true },
      });
      if (matches.length === 0) return { fixtures: [], pendingManagerPeriodDirty: 0 };
      const matchIds = matches.map((m) => m.id);

      const [stats, events, shots, ratings, pendingManagerPeriodDirty] = await Promise.all([
        prisma.statPlayerMatch.findMany({
          where: { matchId: { in: matchIds } },
          select: { matchId: true, playerId: true, dirty: true, ...STAT_ROW_SELECT },
        }),
        prisma.eventMatch.findMany({
          where: { matchId: { in: matchIds } },
          select: {
            matchId: true,
            incidentType: true,
            incidentClass: true,
            timeMinute: true,
            addedTime: true,
            playerId: true,
            assistPlayerId: true,
            playerInId: true,
            playerOutId: true,
            rescinded: true,
          },
        }),
        prisma.shotMatch.findMany({
          where: { matchId: { in: matchIds } },
          select: {
            matchId: true,
            playerId: true,
            shotType: true,
            situation: true,
            isPenalty: true,
            minute: true,
          },
        }),
        prisma.ratingPlayerMatch.findMany({
          where: { matchId: { in: matchIds } },
          select: { matchId: true, playerId: true, rating: true, dirty: true },
        }),
        // The round's `score_manager_period` aggregation drained? (scope=standing is group-stage only and
        // never feeds a knockout round score, so it is deliberately NOT part of this gate.)
        prisma.recomputeDirty.count({
          where: { scope: "manager_period", periodId: roundPeriodId, processedAt: null },
        }),
      ]);

      // Team lookup for every candidate player (participant gate reads playerTeamId vs home/away).
      const candidateIds = new Set<string>();
      for (const s of stats) candidateIds.add(s.playerId);
      for (const e of events)
        for (const id of [e.playerId, e.assistPlayerId, e.playerInId, e.playerOutId])
          if (id) candidateIds.add(id);
      for (const sh of shots) if (sh.playerId) candidateIds.add(sh.playerId);
      const players = candidateIds.size
        ? await prisma.player.findMany({
            where: { id: { in: [...candidateIds] } },
            select: { id: true, teamId: true },
          })
        : [];
      const teamByPlayer = new Map(players.map((p) => [p.id, p.teamId]));

      const fixtures: FixtureCompleteness[] = matches.map((m) => {
        const mStats = stats.filter((s) => s.matchId === m.id);
        const mEvents: EventRow[] = events
          .filter((e) => e.matchId === m.id)
          .map((e) => ({
            incidentType: e.incidentType,
            incidentClass: e.incidentClass,
            timeMinute: e.timeMinute,
            addedTime: e.addedTime,
            playerId: e.playerId,
            assistPlayerId: e.assistPlayerId,
            playerInId: e.playerInId,
            playerOutId: e.playerOutId,
            rescinded: e.rescinded,
          }));
        const mShots: ShotRow[] = shots
          .filter((sh) => sh.matchId === m.id)
          .map((sh) => ({
            playerId: sh.playerId,
            shotType: sh.shotType,
            situation: sh.situation,
            isPenalty: sh.isPenalty,
            minute: sh.minute,
          }));
        const mRatings = ratings.filter((r) => r.matchId === m.id);
        const statByPlayer = new Map(mStats.map((s) => [s.playerId, s]));

        // Candidate players for THIS fixture (union of its stat/event/shot participants).
        const ids = new Set<string>();
        for (const s of mStats) ids.add(s.playerId);
        for (const e of mEvents)
          for (const id of [e.playerId, e.assistPlayerId, e.playerInId, e.playerOutId])
            if (id) ids.add(id);
        for (const sh of mShots) if (sh.playerId) ids.add(sh.playerId);

        const bundles: ScoreInputBundle[] = [...ids].map((playerId) => {
          const st = statByPlayer.get(playerId);
          return {
            playerId,
            role: "MID", // unused by playerAppearedInMatch; a placeholder to satisfy the bundle shape
            rating: null,
            ratingSource: null,
            stat: st ? toStatRow(st) : null,
            manual: null,
            events: mEvents, // whole-match events — namedInAnyEvent scans them for this playerId
            shots: mShots, // whole-match shots — tookAnyShot scans them for this playerId
            team: {
              playerTeamId: teamByPlayer.get(playerId) ?? null,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              homeScore: null,
              awayScore: null,
              teamByPlayerId: {},
            },
          };
        });

        return {
          matchId: m.id,
          status: m.status,
          bundles,
          ratedPlayerIds: new Set(mRatings.filter((r) => r.rating != null).map((r) => r.playerId)),
          hasDirtyInput: mStats.some((s) => s.dirty) || mRatings.some((r) => r.dirty),
        };
      });

      return { fixtures, pendingManagerPeriodDirty };
    },
  };
}
