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
import type { ManagerPeriodPoints } from "./standing";
import type {
  ManagerPeriodRef,
  PeriodMeta,
  PlayerMatchRef,
  RecomputeStore,
  SlotScore,
  StandingUpsert,
} from "./store";

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
            shotsOnTarget: stat.shotsOnTarget,
            ballRecoveries: stat.ballRecoveries,
            bigChancesCreated: stat.bigChancesCreated,
            crossesAccurate: stat.crossesAccurate,
            touches: stat.touches,
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

    async deleteScorePlayerMatch(matchId, playerId): Promise<void> {
      // deleteMany (not delete) → a no-op when absent, so eviction stays idempotent across re-runs.
      await prisma.scorePlayerMatch.deleteMany({ where: { matchId, playerId } });
    },

    async markPlayerMatchDirty(matchId, playerId): Promise<void> {
      // Re-dirty for retry after a failed recompute (the inverse of the old per-unit clear): set dirty=true
      // on whichever raw rows exist for this (match, player). The Phase-1 claim only flipped the flag, so
      // the rows are still present — no stub is created. updateMany is a no-op on a missing table, and
      // over-dirtying merely schedules a redundant (idempotent) recompute, so this can never lose a write.
      const where = { matchId, playerId };
      await Promise.all([
        prisma.statPlayerMatch.updateMany({ where, data: { dirty: true } }),
        prisma.ratingPlayerMatch.updateMany({ where, data: { dirty: true } }),
        prisma.manualStatPlayerMatch.updateMany({ where, data: { dirty: true } }),
      ]);
    },

    async getAffectedManagerPeriods(matchId, playerId): Promise<ManagerPeriodRef[]> {
      // Match→period is the structural `fifa_match.period_id` (Prompt 05a), no longer kickoff-window
      // inference. A (match, player) affects exactly the manager-periods whose lineup_slot is in this
      // match's period and lists this player.
      const match = await prisma.fifaMatch.findUnique({
        where: { id: matchId },
        select: { periodId: true },
      });
      if (!match?.periodId) return [];
      const slots = await prisma.lineupSlot.findMany({
        where: { playerId, periodId: match.periodId },
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
      const slots = await prisma.lineupSlot.findMany({
        where: { managerId, periodId },
        select: { playerId: true, isStarter: true },
      });
      const out: SlotScore[] = [];
      for (const slot of slots) {
        // A player plays at most ONE match per period, resolved by the structural `fifa_match.period_id`
        // (Prompt 05a retired the kickoff-window inference). `orderBy` keeps it DETERMINISTIC if a period
        // ever held 2+ scored matches for one player, so "recompute is a pure function of stored inputs"
        // (§4) holds regardless. The MemoryStore models the exact (player,period)→match link.
        const row = await prisma.scorePlayerMatch.findFirst({
          where: { playerId: slot.playerId, match: { periodId } },
          orderBy: { match: { kickoffAt: "asc" } },
          select: { breakdownJson: true },
        });
        const score: ScoreBreakdown | null = row
          ? (row.breakdownJson as unknown as ScoreBreakdown)
          : null;
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

    async listDirtyStandingLeagues(): Promise<string[]> {
      const rows = await prisma.recomputeDirty.findMany({
        where: { scope: "standing", processedAt: null },
        select: { leagueId: true },
      });
      const set = new Set<string>();
      for (const r of rows) if (r.leagueId) set.add(r.leagueId);
      return [...set];
    },

    async getLeaguePeriods(leagueId): Promise<PeriodMeta[]> {
      const rows = await prisma.period.findMany({
        where: { leagueId },
        select: { id: true, kind: true, cutCount: true },
        orderBy: { label: "asc" }, // deterministic; order is immaterial to the aggregate
      });
      return rows.map((r) => ({ id: r.id, kind: r.kind, cutCount: r.cutCount }));
    },

    async getManagerPeriodScores(periodId): Promise<ManagerPeriodPoints[]> {
      const rows = await prisma.scoreManagerPeriod.findMany({
        where: { periodId },
        select: { managerId: true, points: true },
        orderBy: { managerId: "asc" }, // deterministic
      });
      return rows.map((r) => ({ managerId: r.managerId, points: r.points }));
    },

    async upsertStanding(row: StandingUpsert): Promise<void> {
      await prisma.standing.upsert({
        where: {
          leagueId_managerId_scope: {
            leagueId: row.leagueId,
            managerId: row.managerId,
            scope: "group_stage",
          },
        },
        create: {
          leagueId: row.leagueId,
          managerId: row.managerId,
          scope: "group_stage",
          allPlayAllW: row.allPlayAllW,
          allPlayAllL: row.allPlayAllL,
          totalPoints: row.totalPoints,
          seed: row.seed,
        },
        update: {
          allPlayAllW: row.allPlayAllW,
          allPlayAllL: row.allPlayAllL,
          totalPoints: row.totalPoints,
          seed: row.seed,
          computedAt: new Date(),
        },
      });
    },

    async clearStandingDirty(leagueId): Promise<void> {
      await prisma.recomputeDirty.updateMany({
        where: { scope: "standing", leagueId, processedAt: null },
        data: { processedAt: new Date() },
      });
    },

    async claimDirtyPlayerMatches(): Promise<PlayerMatchRef[]> {
      // Atomic claim-then-clear: one `UPDATE … SET dirty=false WHERE dirty=true RETURNING match_id,
      // player_id` per raw table (Prisma 6.19.3 `updateManyAndReturn`, PostgreSQL). Flipping the flag in
      // the SAME statement that captures the keys is what makes the claim atomic — a concurrent raw write
      // either commits before the claim (seen, returned, then folded in by the recompute read) or after it
      // (re-sets dirty=true and is reprocessed next sweep); it can never be cleared without being
      // incorporated. `rating_player_match` is keyed by (match, player, source), so a (match, player) can
      // come back on several rows — the union + dedup collapses them to one recompute key.
      const [s, r, m] = await Promise.all([
        prisma.statPlayerMatch.updateManyAndReturn({
          where: { dirty: true },
          data: { dirty: false },
          select: { matchId: true, playerId: true },
        }),
        prisma.ratingPlayerMatch.updateManyAndReturn({
          where: { dirty: true },
          data: { dirty: false },
          select: { matchId: true, playerId: true },
        }),
        prisma.manualStatPlayerMatch.updateManyAndReturn({
          where: { dirty: true },
          data: { dirty: false },
          select: { matchId: true, playerId: true },
        }),
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
