/**
 * Prisma-backed {@link PoolPickStore} — the production IO adapter for the pool write/read path, and the
 * ONLY pool file that touches the database (the @app/pool engine + the handlers carry no DB dependency).
 * Like @app/draft / @app/faab's adapters it has no unit test (it needs a live DB); it is covered by
 * `tsc --noEmit` plus the Memory double's tests, which exercise the same handlers against the port.
 *
 * Two load-bearing details land here:
 *   * {@link getMatchFacts} resolves the CORRECTED phase discriminator — `fifa_match.periodId →
 *     period.kind` — so the pure engine sees `periodKind`, never the raw `fifa_match.round`.
 *   * {@link readVisiblePicks} enforces anti-copying in the QUERY (own picks always; others' only once
 *     their match has kicked off), the gate that cannot live in RLS because RLS has no clock.
 */
import type { PrismaClient } from "@app/db";
import type {
  PoolMatchFacts,
  PoolPickStore,
  PersistedPoolPick,
  ReadPicksInput,
  UpsertPickInput,
} from "./store";

type Db = PrismaClient;

export function createPrismaPoolPickStore(prisma: Db): PoolPickStore {
  return {
    async getManagerLeagueId(managerId): Promise<string | null> {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      return m?.leagueId ?? null;
    },

    async getMatchFacts(matchId): Promise<PoolMatchFacts | null> {
      const m = await prisma.fifaMatch.findUnique({
        where: { id: matchId },
        select: { status: true, kickoffAt: true, period: { select: { kind: true } } },
      });
      if (!m) return null;
      // The corrected discriminator: phase comes from the linked period.kind, NOT fifa_match.round.
      return { status: m.status, periodKind: m.period?.kind ?? null, kickoffAt: m.kickoffAt };
    },

    async upsertPick(input: UpsertPickInput): Promise<PersistedPoolPick> {
      const row = await prisma.poolPick.upsert({
        where: { managerId_matchId: { managerId: input.managerId, matchId: input.matchId } },
        create: {
          leagueId: input.leagueId,
          managerId: input.managerId,
          matchId: input.matchId,
          prediction: input.prediction,
          submittedAt: input.now,
        },
        // Edit = change the prediction; submittedAt stays as the first submission, updatedAt auto-bumps.
        update: { prediction: input.prediction },
        select: { id: true, managerId: true, matchId: true, prediction: true },
      });
      return {
        pickId: row.id,
        managerId: row.managerId,
        matchId: row.matchId,
        prediction: row.prediction,
      };
    },

    async readVisiblePicks(input: ReadPicksInput): Promise<PersistedPoolPick[]> {
      // League-scoped; anti-copying: own picks ALWAYS + others' ONLY for matches that have kicked off.
      const rows = await prisma.poolPick.findMany({
        where: {
          leagueId: input.leagueId,
          OR: [{ managerId: input.managerId }, { match: { kickoffAt: { lte: input.now } } }],
        },
        select: { id: true, managerId: true, matchId: true, prediction: true },
      });
      return rows.map((r) => ({
        pickId: r.id,
        managerId: r.managerId,
        matchId: r.matchId,
        prediction: r.prediction,
      }));
    },
  };
}
