/**
 * Prisma-backed {@link IngestStore} — the ONLY file in @app/ingest that touches the DB. Thin: resolve
 * BDL ids → internal UUIDs, upsert on natural keys, set `dirty` / enqueue `recompute_dirty`, set
 * `lineup_slot.locked_at` across the match's `period_id`. The clock enters only here (Prisma
 * `updatedAt`); the pure modules are clock-free. No new unit tests — covered by typecheck + the Memory
 * store's behavioural tests (idempotency, dirty, locking).
 */
import type { PrismaClient, MatchStatus, PeriodKind, Position } from "@app/db";
import { markStatPlayerDirty, Prisma } from "@app/db";
import type { IngestStore, SchedulableMatch, LineupEntryIn } from "./store";
import type { StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn, GroupStandingRowIn } from "./map";
import { isLockWriteAuthorized } from "./lock";

type Db = PrismaClient;

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
        shotsOnTarget: row.shotsOnTarget,
        ballRecoveries: row.ballRecoveries,
        bigChancesCreated: row.bigChancesCreated,
        crossesAccurate: row.crossesAccurate,
        touches: row.touches,
        // Un-promoted feed fields (mapStatLine catch-all). null → SQL NULL (DbNull); refreshed on
        // re-poll like every other stat column. The dirty-stub CONFLICT path (markStatPlayerDirty,
        // dirty-ONLY) never reaches here, so it can never clobber a previously-written `extra`.
        extra: row.extra === null ? Prisma.DbNull : (row.extra as unknown as Prisma.InputJsonValue),
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
        // Un-promoted feed fields (mapTeamStat catch-all). null → SQL NULL (DbNull); refreshed on
        // re-poll like the typed columns. Mirrors the player-stat `extra` write. Display-only.
        extra: row.extra === null ? Prisma.DbNull : (row.extra as unknown as Prisma.InputJsonValue),
      };
      await prisma.statTeamMatch.upsert({
        where: { matchId_teamId: { matchId, teamId } },
        create: { matchId, teamId, ...data },
        update: data,
      });
    },

    async upsertGroupStanding(row: GroupStandingRowIn): Promise<boolean> {
      // FOREIGN-GUARD: a standings row for a team not yet imported into `fifa_team` is skipped (rosters
      // populate `fifa_team`). Mirrors `upsertTeamStat`'s `if (!teamId) return`. No dirty-mark, no
      // recompute — `group_standing` is display-only. Idempotent: keyed by `team_id` (one row per team).
      const teamId = await teamIdFor(row.teamBdlId);
      if (!teamId) return false;
      const data = {
        bdlGroupId: row.bdlGroupId,
        groupName: row.groupName,
        season: row.season,
        position: row.position,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
      };
      await prisma.groupStanding.upsert({
        where: { teamId },
        create: { teamId, ...data },
        update: data,
      });
      return true;
    },

    async markPlayersDirty(matchBdlId, playerBdlIds): Promise<void> {
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return;
      for (const bdl of playerBdlIds) {
        const playerId = await playerIdFor(bdl);
        // Re-dirty via the SHARED @app/db invariant (no @app/ingest-local copy) — see markStatPlayerDirty:
        // events/shots/team have no dirty column; `sweep` Phase 1 reads the raw stat `dirty` BOOLEAN.
        if (playerId) await markStatPlayerDirty(prisma, matchId, playerId);
      }
    },

    async upsertLineupEntries(matchBdlId, entries): Promise<void> {
      // Plain table write — no lock, no dirty, no lineupPulled. The match must exist (schedule-sync
      // upserts fifa_match first); a player the sheet lists that we don't have rostered is skipped
      // (unresolved ref, same convention as the raw layer's `if (!matchId || !playerId) return`).
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return;
      for (const e of entries as readonly LineupEntryIn[]) {
        const playerId = await playerIdFor(e.playerBdlId);
        if (!playerId) continue;
        await prisma.matchLineupEntry.upsert({
          where: { matchId_playerId: { matchId, playerId } },
          create: { matchId, playerId, isStarter: e.isStarter },
          update: { isStarter: e.isStarter },
        });
      }
    },

    async lockSlot(matchBdlId, playerBdlId, lockedAt, now, path): Promise<boolean> {
      // Resolve the SOURCE match (the fixture the lock derives from) and the candidate player. A foreign
      // event references a match not in `fifa_match`, or a player not rostered → unknown ref → no stamp.
      const match = await prisma.fifaMatch.findUnique({
        where: { balldontlieId: matchBdlId },
        select: { id: true, periodId: true, status: true, homeTeamId: true, awayTeamId: true },
      });
      const player = await prisma.player.findUnique({
        where: { balldontlieId: playerBdlId },
        select: { id: true, teamId: true },
      });
      if (!match || !player) return false;

      // THE categorical gate (DECISIONS lock-on-play): team-in-source-match + in-play-or-later + now-gate +
      // period. Blocks the 2026-06-12 wrong-match / non-participant leak class regardless of upstream bugs.
      const periodId = match.periodId;
      const authz = isLockWriteAuthorized({
        periodId,
        matchStatus: match.status,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        playerTeamId: player.teamId,
        lockedAtMs: lockedAt.getTime(),
        nowMs: now.getTime(),
      });
      if (!authz.ok || periodId == null) {
        // A would-be stamp the gate refused = the leak signature. Logged loudly (not silently dropped) so
        // the NEXT incident is diagnosable from Render logs in minutes — fan-out is unique per league, so
        // one refusal line per offending (player, match) pair.
        console.warn(
          `[lock.slot.refused] ${JSON.stringify({
            reason: authz.ok ? "no-period" : authz.reason,
            path,
            sourceMatchBdlId: matchBdlId,
            playerBdlId,
            instant: lockedAt.toISOString(),
          })}`,
        );
        return false;
      }

      // Authorised. Period-scoped + monotonic (only `locked_at IS NULL`); the DB trigger is the backstop.
      const slot = await prisma.lineupSlot.findFirst({
        where: { periodId, playerId: player.id, lockedAt: null },
        select: { id: true },
      });
      if (!slot) return false; // already locked, or this player holds no unlocked slot in the period
      const result = await prisma.lineupSlot.updateMany({
        where: { periodId, playerId: player.id, lockedAt: null },
        data: { lockedAt },
      });
      if (result.count === 0) return false;
      console.info(
        `[lock.slot.stamped] ${JSON.stringify({
          slotId: slot.id,
          playerId: player.id,
          sourceMatchId: match.id,
          sourceMatchBdlId: matchBdlId,
          path,
          instant: lockedAt.toISOString(),
        })}`,
      );
      return true;
    },

    async listAppearedPlayerBdlIds(matchBdlId): Promise<number[]> {
      const matchId = await matchIdFor(matchBdlId);
      if (!matchId) return [];
      // The authoritative appeared set: `score_player_match` holds ONLY participants — the recompute
      // participant gate already excluded non-appearers + cross-team contamination. Map internal
      // player ids back to BDL ids so the orchestration can drive the (BDL-keyed) lock write.
      const rows = await prisma.scorePlayerMatch.findMany({
        where: { matchId },
        select: { player: { select: { balldontlieId: true } } },
      });
      return rows.map((r) => r.player.balldontlieId);
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
          // EXISTS a pre-kickoff availability snapshot → the T-75 peek has landed (stops re-firing).
          lineupEntries: { select: { id: true }, take: 1 },
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
        lineupPeeked: r.lineupEntries.length > 0,
        kickoffLockFallback: r.kickoffLockFallback,
      }));
    },
  };
}
