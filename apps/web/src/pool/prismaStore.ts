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
import { resolvePoolPeriod } from "./resolvePoolPeriod";

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
        select: {
          status: true,
          kickoffAt: true,
          period: { select: { kind: true, label: true } },
          isThirdPlace: true,
          // The two sides' names feed the SEC-P4 undecided-match guard (a TBD knockout slot carries a
          // `Team {id}` placeholder name, or a null FK). Mirrors loadPool's MATCH_SELECT; name is the only
          // resolved-team signal (fifa_team.country/.abbreviation are NULL for all teams — DECISIONS → Pool).
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      });
      if (!m) return null;
      // The corrected discriminator: phase comes from the linked period.kind, NOT fifa_match.round. T-3RD:
      // route through resolvePoolPeriod so the 3rd-place play-off resolves to knockout_round — making
      // validatePickSubmission REJECT a DRAW on it (a 2-way fixture), exactly like every other knockout pick.
      const { periodKind } = resolvePoolPeriod(m);
      return {
        status: m.status,
        periodKind,
        kickoffAt: m.kickoffAt,
        homeTeamName: m.homeTeam?.name ?? null,
        awayTeamName: m.awayTeam?.name ?? null,
      };
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
