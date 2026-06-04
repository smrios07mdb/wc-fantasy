/**
 * Prisma-backed {@link RecomputeStore} — the production IO adapter. This is the ONLY file in the
 * package that touches the database; the pure resolver/adapter/orchestration carry no DB dependency.
 * It is deliberately thin: gather rows, hand them to the pure pieces, upsert results, move dirty
 * markers. `computed_at` is stamped by the DB default on insert and by `new Date()` on update — the
 * clock lives here at the IO boundary, never in the pure scoring/mapping path.
 */
import { Prisma, type PrismaClient } from "@app/db";
import { POSITIONS, type Position, type RatingSource } from "@app/shared";
import type { ScoreBreakdown } from "@app/scoring";
import { pickRating } from "./resolver";
import type {
  EventRow,
  ManualRow,
  MatchTeamContext,
  ScoreInputBundle,
  ShotRow,
  StatRow,
} from "./adapter";
import type { ManagerPeriodRef, PlayerMatchRef, RecomputeStore, SlotScore } from "./store";

/** Minimal client surface this store needs (the singleton from `@app/db` satisfies it). */
type Db = PrismaClient;

function roleFrom(extra: Prisma.JsonValue | null | undefined, fallback: Position): Position {
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const r = (extra as Record<string, unknown>)["rolePlayed"];
    if (typeof r === "string" && (POSITIONS as readonly string[]).includes(r)) return r as Position;
  }
  return fallback;
}

const asJson = (b: ScoreBreakdown): Prisma.InputJsonValue => b as unknown as Prisma.InputJsonValue;

export function createPrismaStore(prisma: Db): RecomputeStore {
  return {
    async getPlayerMatchInput(matchId, playerId): Promise<ScoreInputBundle | null> {
      const [player, match, stat, manual, ratings, events, shots] = await Promise.all([
        prisma.player.findUnique({
          where: { id: playerId },
          select: { position: true, teamId: true },
        }),
        prisma.fifaMatch.findUnique({
          where: { id: matchId },
          select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
        }),
        prisma.statPlayerMatch.findUnique({ where: { matchId_playerId: { matchId, playerId } } }),
        prisma.manualStatPlayerMatch.findUnique({
          where: { matchId_playerId: { matchId, playerId } },
        }),
        prisma.ratingPlayerMatch.findMany({
          where: { matchId, playerId },
          select: { source: true, rating: true },
        }),
        prisma.eventMatch.findMany({ where: { matchId } }),
        prisma.shotMatch.findMany({ where: { matchId } }),
      ]);
      if (!player || !match) return null;

      // Team lookup for every scorer / penalty-taker referenced by events or shots.
      const refIds = new Set<string>();
      for (const e of events) if (e.playerId) refIds.add(e.playerId);
      for (const s of shots) if (s.playerId) refIds.add(s.playerId);
      const refPlayers = refIds.size
        ? await prisma.player.findMany({
            where: { id: { in: [...refIds] } },
            select: { id: true, teamId: true },
          })
        : [];
      const teamByPlayerId: Record<string, string | null> = {};
      for (const rp of refPlayers) teamByPlayerId[rp.id] = rp.teamId;

      const { rating, source } = pickRating(
        ratings.map((r) => ({ source: r.source as RatingSource, rating: r.rating })),
      );

      const statRow: StatRow | null = stat
        ? {
            minutesPlayed: stat.minutesPlayed,
            goals: stat.goals,
            assists: stat.assists,
            keyPasses: stat.keyPasses,
            dribblesAttempted: stat.dribblesAttempted,
            dribblesCompleted: stat.dribblesCompleted,
            duelsWon: stat.duelsWon,
            duelsLost: stat.duelsLost,
            passesTotal: stat.passesTotal,
            passesAccurate: stat.passesAccurate,
            longBallsTotal: stat.longBallsTotal,
            longBallsAccurate: stat.longBallsAccurate,
            wasFouled: stat.wasFouled,
            clearances: stat.clearances,
            blockedShots: stat.blockedShots,
            interceptions: stat.interceptions,
            tacklesWon: stat.tacklesWon,
            saves: stat.saves,
            savesInsideBox: stat.savesInsideBox,
            punches: stat.punches,
            highClaims: stat.highClaims,
            possessionLost: stat.possessionLost,
          }
        : null;

      const manualRow: ManualRow | null = manual
        ? { penaltyWon: manual.penaltyWon, penaltyCommitted: manual.penaltyCommitted }
        : null;

      const eventRows: EventRow[] = events.map((e) => ({
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

      const shotRows: ShotRow[] = shots.map((s) => ({
        playerId: s.playerId,
        shotType: s.shotType,
        situation: s.situation,
        isPenalty: s.isPenalty,
        minute: s.minute,
      }));

      const team: MatchTeamContext = {
        playerTeamId: player.teamId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        teamByPlayerId,
      };

      return {
        playerId,
        role: roleFrom(manual?.extra, player.position as Position),
        rating,
        ratingSource: source,
        stat: statRow,
        manual: manualRow,
        events: eventRows,
        shots: shotRows,
        team,
      };
    },

    async writeScorePlayerMatch(matchId, playerId, result): Promise<void> {
      await prisma.scorePlayerMatch.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, points: result.total, breakdownJson: asJson(result) },
        update: { points: result.total, breakdownJson: asJson(result), computedAt: new Date() },
      });
    },

    async clearRawDirty(matchId, playerId): Promise<void> {
      const where = { matchId, playerId, dirty: true };
      await Promise.all([
        prisma.statPlayerMatch.updateMany({ where, data: { dirty: false } }),
        prisma.ratingPlayerMatch.updateMany({ where, data: { dirty: false } }),
        prisma.manualStatPlayerMatch.updateMany({ where, data: { dirty: false } }),
      ]);
    },

    async getAffectedManagerPeriods(matchId, playerId): Promise<ManagerPeriodRef[]> {
      const match = await prisma.fifaMatch.findUnique({
        where: { id: matchId },
        select: { kickoffAt: true },
      });
      if (!match) return [];
      const slots = await prisma.lineupSlot.findMany({
        where: {
          playerId,
          period: { opensAt: { lte: match.kickoffAt }, closesAt: { gte: match.kickoffAt } },
        },
        select: { managerId: true, periodId: true },
      });
      const seen = new Set<string>();
      const refs: ManagerPeriodRef[] = [];
      for (const s of slots) {
        const k = `${s.managerId} ${s.periodId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        refs.push({ managerId: s.managerId, periodId: s.periodId });
      }
      return refs;
    },

    async enqueueManagerPeriodDirty(ref: ManagerPeriodRef): Promise<void> {
      const existing = await prisma.recomputeDirty.findFirst({
        where: {
          scope: "manager_period",
          managerId: ref.managerId,
          periodId: ref.periodId,
          processedAt: null,
        },
        select: { id: true },
      });
      if (!existing) {
        await prisma.recomputeDirty.create({
          data: { scope: "manager_period", managerId: ref.managerId, periodId: ref.periodId },
        });
      }
    },

    async getManagerPeriodSlots(managerId, periodId): Promise<SlotScore[]> {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { opensAt: true, closesAt: true },
      });
      const slots = await prisma.lineupSlot.findMany({
        where: { managerId, periodId },
        select: { playerId: true, isStarter: true },
      });
      const out: SlotScore[] = [];
      for (const slot of slots) {
        let score: ScoreBreakdown | null = null;
        if (period?.opensAt && period.closesAt) {
          // A player plays at most ONE match per period window (a group-MD wave / knockout round), so
          // this normally resolves a single row. `orderBy` keeps it DETERMINISTIC regardless — without
          // it, a window that ever held 2+ scored matches for one player would let findFirst return a
          // DB-arbitrary row, silently breaking "recompute is a pure function of stored inputs" (§4).
          // TODO(prompt-NN): the match→period link is window-inferred (no period_id on fifa_match); a
          // future schema could pin it exactly. The MemoryStore models the exact (player,period)→match link.
          const row = await prisma.scorePlayerMatch.findFirst({
            where: {
              playerId: slot.playerId,
              match: { kickoffAt: { gte: period.opensAt, lte: period.closesAt } },
            },
            orderBy: { match: { kickoffAt: "asc" } },
            select: { breakdownJson: true },
          });
          if (row) score = row.breakdownJson as unknown as ScoreBreakdown;
        }
        out.push({ isStarter: slot.isStarter, score });
      }
      return out;
    },

    async writeScoreManagerPeriod(managerId, periodId, total): Promise<void> {
      await prisma.scoreManagerPeriod.upsert({
        where: { managerId_periodId: { managerId, periodId } },
        create: { managerId, periodId, points: total },
        update: { points: total, computedAt: new Date() },
      });
    },

    async isPeriodFrozen(periodId): Promise<boolean> {
      const p = await prisma.period.findUnique({
        where: { id: periodId },
        select: { frozenAt: true },
      });
      return p?.frozenAt != null;
    },

    async getManagerLeagueId(managerId): Promise<string | null> {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      return m?.leagueId ?? null;
    },

    async enqueueStandingDirty(leagueId, managerId): Promise<void> {
      const existing = await prisma.recomputeDirty.findFirst({
        where: { scope: "standing", leagueId, managerId, processedAt: null },
        select: { id: true },
      });
      if (!existing) {
        await prisma.recomputeDirty.create({ data: { scope: "standing", leagueId, managerId } });
      }
    },

    async listDirtyPlayerMatches(): Promise<PlayerMatchRef[]> {
      const sel = { where: { dirty: true }, select: { matchId: true, playerId: true } } as const;
      const [s, r, m] = await Promise.all([
        prisma.statPlayerMatch.findMany(sel),
        prisma.ratingPlayerMatch.findMany(sel),
        prisma.manualStatPlayerMatch.findMany(sel),
      ]);
      const seen = new Set<string>();
      const out: PlayerMatchRef[] = [];
      for (const row of [...s, ...r, ...m]) {
        const k = `${row.matchId} ${row.playerId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ matchId: row.matchId, playerId: row.playerId });
      }
      return out;
    },

    async listDirtyManagerPeriods(): Promise<ManagerPeriodRef[]> {
      const rows = await prisma.recomputeDirty.findMany({
        where: { scope: "manager_period", processedAt: null },
        select: { managerId: true, periodId: true },
      });
      const out: ManagerPeriodRef[] = [];
      for (const r of rows) {
        if (r.managerId && r.periodId) out.push({ managerId: r.managerId, periodId: r.periodId });
      }
      return out;
    },

    async markManagerPeriodProcessed(ref: ManagerPeriodRef): Promise<void> {
      await prisma.recomputeDirty.updateMany({
        where: {
          scope: "manager_period",
          managerId: ref.managerId,
          periodId: ref.periodId,
          processedAt: null,
        },
        data: { processedAt: new Date() },
      });
    },
  };
}
