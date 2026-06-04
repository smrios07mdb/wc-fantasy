/**
 * Prisma-backed {@link IngestStore} — the ONLY file in @app/ingest that touches the DB. Thin: resolve
 * BDL ids → internal UUIDs, upsert on natural keys, set `dirty` / enqueue `recompute_dirty`, set
 * `lineup_slot.locked_at` across the match's `period_id`. The clock enters only here (Prisma
 * `updatedAt`); the pure modules are clock-free. No new unit tests — covered by typecheck + the Memory
 * store's behavioural tests (idempotency, dirty, locking).
 */
import type { PrismaClient, MatchStatus, PeriodKind, Position } from "@app/db";
import type { IngestStore, SchedulableMatch } from "./store";
import type { StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

type Db = PrismaClient;

/**
 * The CONFLICT (existing-row) branch of the stat dirty-mark upsert: flip ONLY the `dirty` flag, NEVER a
 * stat column. A late event (e.g. an 80th-minute booking after live stats have already landed) must
 * re-dirty the player WITHOUT nulling out real minutes/goals/etc. The all-null stub belongs solely to
 * the create/insert branch (event-only players who have no stat row yet). Exported so the invariant is
 * unit-testable without a live DB.
 */
export const STAT_DIRTY_UPDATE = { dirty: true } as const;

export function createPrismaIngestStore(prisma: Db): IngestStore {
  const matchIdFor = async (bdlId: number): Promise<string | null> =>
    (await prisma.fifaMatch.findUnique({ where: { balldontlieId: bdlId }, select: { id: true } }))
      ?.id ?? null;

  const playerIdFor = async (bdlId: number): Promise<string | null> =>
    (await prisma.player.findUnique({ where: { balldontlieId: bdlId }, select: { id: true } }))
      ?.id ?? null;

  const teamIdFor = async (bdlId: number): Promise<string | null> =>
    (await prisma.fifaTeam.findUnique({ where: { balldontlieId: bdlId }, select: { id: true } }))
      ?.id ?? null;

  const upsertTeam = async (bdlId: number, name: string | null): Promise<string> => {
    const row = await prisma.fifaTeam.upsert({
      where: { balldontlieId: bdlId },
      create: { balldontlieId: bdlId, name: name ?? `Team ${bdlId}` },
      update: name ? { name } : {},
      select: { id: true },
    });
    return row.id;
  };

  // events/shots/team_stats have NO row-level dirty column, so an event-only change (e.g. a card with
  // no stat-row delta) must re-dirty the player through the channel the sweep actually reads: `sweep`
  // Phase 1 (`listDirtyPlayerMatches`) scans the raw `dirty` BOOLEAN on stat/rating/manual. (There is
  // no player-match MARKER channel — the dead `recompute_dirty` scope was retired.) So flip
  // `stat_player_match.dirty`: the all-null stub is written ONLY on INSERT (a player with no stat line
  // yet — the adapter tolerates it and it self-corrects when real stats arrive); on CONFLICT we touch
  // ONLY the flag (STAT_DIRTY_UPDATE), so a late card never nulls out stats that already landed.
  const markStatDirty = async (matchId: string, playerId: string): Promise<void> => {
    await prisma.statPlayerMatch.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      create: { matchId, playerId, dirty: true },
      update: STAT_DIRTY_UPDATE,
    });
  };

  return {
    upsertTeamByBdlId(bdlId, name): Promise<string> {
      return upsertTeam(bdlId, name);
    },

    async upsertPlayerByBdlId(bdlId, fields): Promise<string> {
      const teamId = fields.teamBdlId != null ? await teamIdFor(fields.teamBdlId) : null;
      const position = (fields.position ?? "MID") as Position; // TODO(confirm): feed position vocabulary
      const row = await prisma.player.upsert({
        where: { balldontlieId: bdlId },
        create: {
          balldontlieId: bdlId,
          displayName: fields.displayName ?? `Player ${bdlId}`,
          position,
          teamId,
        },
        update: {
          ...(fields.displayName ? { displayName: fields.displayName } : {}),
          ...(teamId ? { teamId } : {}),
        },
        select: { id: true },
      });
      return row.id;
    },

    async upsertMatch(row, periodId, opts): Promise<{ matchId: string }> {
      const homeTeamId =
        row.homeTeamBdlId != null ? await upsertTeam(row.homeTeamBdlId, null) : null;
      const awayTeamId =
        row.awayTeamBdlId != null ? await upsertTeam(row.awayTeamBdlId, null) : null;
      const data = {
        kickoffAt: new Date(row.kickoffAtIso),
        status: row.status as MatchStatus,
        round: row.round,
        homeTeamId,
        awayTeamId,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        homeScoreEt: row.homeScoreEt,
        awayScoreEt: row.awayScoreEt,
        homeScorePens: row.homeScorePens,
        awayScorePens: row.awayScorePens,
        homeFormation: row.homeFormation,
        awayFormation: row.awayFormation,
        referee: row.referee,
        periodId,
        kickoffLockFallback: opts.kickoffLockFallback ?? false,
      };
      const m = await prisma.fifaMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
        select: { id: true },
      });
      return { matchId: m.id };
    },

    async resolvePeriodId(label): Promise<string | null> {
      if (!label) return null;
      // Single-league by design (ARCHITECTURE.md §4): exactly one matching period for the fixture.
      const p = await prisma.period.findFirst({
        where: { kind: label.kind as PeriodKind, label: label.label },
        select: { id: true },
      });
      return p?.id ?? null;
    },

    async upsertStatLine(row: StatLineRow): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      const playerId = await playerIdFor(row.playerBdlId);
      if (!matchId || !playerId) return; // ref rows must exist first (lineups / schedule-sync upsert them)
      const data = {
        minutesPlayed: row.minutesPlayed,
        goals: row.goals,
        assists: row.assists,
        keyPasses: row.keyPasses,
        dribblesAttempted: row.dribblesAttempted,
        dribblesCompleted: row.dribblesCompleted,
        duelsWon: row.duelsWon,
        duelsLost: row.duelsLost,
        passesTotal: row.passesTotal,
        passesAccurate: row.passesAccurate,
        longBallsTotal: row.longBallsTotal,
        longBallsAccurate: row.longBallsAccurate,
        wasFouled: row.wasFouled,
        clearances: row.clearances,
        interceptions: row.interceptions,
        tacklesWon: row.tacklesWon,
        blockedShots: row.blockedShots,
        saves: row.saves,
        savesInsideBox: row.savesInsideBox,
        punches: row.punches,
        highClaims: row.highClaims,
        possessionLost: row.possessionLost,
        dirty: true,
      };
      await prisma.statPlayerMatch.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, ...data },
        update: data,
      });
    },

    async upsertRatingBalldontlie(matchBdlId, playerBdlId, rating): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      const playerId = await playerIdFor(playerBdlId);
      if (!matchId || !playerId) return;
      await prisma.ratingPlayerMatch.upsert({
        where: { matchId_playerId_source: { matchId, playerId, source: "balldontlie" } },
        create: { matchId, playerId, source: "balldontlie", rating, dirty: true },
        update: { rating, dirty: true },
      });
    },

    async upsertEvent(row: EventRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      if (!matchId) return;
      const resolve = async (b: number | null): Promise<string | null> =>
        b != null ? await playerIdFor(b) : null;
      const data = {
        matchId,
        incidentType: row.incidentType,
        incidentClass: row.incidentClass,
        timeMinute: row.timeMinute,
        addedTime: row.addedTime,
        period: row.period,
        playerId: await resolve(row.playerBdlId),
        assistPlayerId: await resolve(row.assistPlayerBdlId),
        playerInId: await resolve(row.playerInBdlId),
        playerOutId: await resolve(row.playerOutBdlId),
        rescinded: row.rescinded,
      };
      await prisma.eventMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
      });
    },

    async upsertShot(row: ShotRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      if (!matchId) return;
      const playerId = row.playerBdlId != null ? await playerIdFor(row.playerBdlId) : null;
      const data = {
        matchId,
        playerId,
        shotType: row.shotType,
        situation: row.situation,
        isPenalty: row.isPenalty,
        minute: row.minute,
      };
      await prisma.shotMatch.upsert({
        where: { balldontlieId: row.bdlId },
        create: { balldontlieId: row.bdlId, ...data },
        update: data,
      });
    },

    async upsertTeamStat(row: TeamStatRowIn): Promise<void> {
      const matchId = await matchIdFor(row.matchBdlId);
      const teamId = await teamIdFor(row.teamBdlId);
      if (!matchId || !teamId) return;
      const data = {
        offsides: row.offsides,
        shotsBlocked: row.shotsBlocked,
        possession: row.possession,
      };
      await prisma.statTeamMatch.upsert({
        where: { matchId_teamId: { matchId, teamId } },
        create: { matchId, teamId, ...data },
        update: data,
      });
    },

    async markPlayersDirty(matchBdlId, playerBdlIds): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return;
      for (const bdl of playerBdlIds) {
        const playerId = await playerIdFor(bdl);
        if (playerId) await markStatDirty(matchId, playerId);
      }
    },

    async setLockedAt(matchBdlId, playerBdlId, lockedAt): Promise<void> {
      const match = await prisma.fifaMatch.findUnique({
        where: { balldontlieId: matchBdlId },
        select: { periodId: true },
      });
      const playerId = await playerIdFor(playerBdlId);
      if (!match?.periodId || !playerId) return; // no period seeded → leave unlocked (TODO(confirm))
      // Monotonic latch: only set when currently NULL (the DB trigger also rejects re-locks).
      await prisma.lineupSlot.updateMany({
        where: { periodId: match.periodId, playerId, lockedAt: null },
        data: { lockedAt },
      });
    },

    async listSchedulableMatches(): Promise<SchedulableMatch[]> {
      const rows = await prisma.fifaMatch.findMany({
        where: { status: { in: ["scheduled", "in_progress", "completed"] } },
        select: {
          balldontlieId: true,
          status: true,
          kickoffAt: true,
          kickoffLockFallback: true,
          ratings: { where: { source: "balldontlie" }, select: { matchId: true }, take: 1 },
          _count: { select: { events: true } },
        },
      });
      return rows.map((r) => ({
        bdlId: r.balldontlieId,
        status: r.status,
        kickoffMs: r.kickoffAt.getTime(),
        hasRating: r.ratings.length > 0,
        // Proxy: any event recorded (or a non-scheduled status) means we already pulled this fixture.
        // pre-match is idempotent, so an occasional re-pull is harmless. TODO(confirm): a dedicated flag.
        lineupPulled: r._count.events > 0 || r.status !== "scheduled",
        kickoffLockFallback: r.kickoffLockFallback,
      }));
    },
  };
}
