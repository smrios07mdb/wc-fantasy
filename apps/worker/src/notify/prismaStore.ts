/**
 * Prisma-backed {@link NotifyTriggerStore} — the production adapter for the two trigger reads (Prompt
 * 41b). Like @app/notify / @app/draft's Prisma adapters it has no unit test (it needs a live DB); it is
 * covered by `tsc --noEmit` plus the Memory double's trigger tests, which exercise the orchestration
 * against the same port. This is part of the worker IO layer — the only place Supabase is touched.
 *
 * ASSUMPTION (schema §4): ONE private league per tournament, so roster ownership is global — the
 * match-starting owner query is NOT league-scoped (a multi-league deployment would add a league filter).
 */
import type { PrismaClient } from "@app/db";
import type { NotifyTriggerStore } from "./store";
import type { FantasyStarterSlot, UpcomingMatch } from "./selectors";

export function createPrismaNotifyTriggerStore(prisma: PrismaClient): NotifyTriggerStore {
  return {
    async resolveMatchId(matchBdlId: number): Promise<string | null> {
      const row = await prisma.fifaMatch.findUnique({
        where: { balldontlieId: matchBdlId },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async listFantasyStartersForMatch(matchBdlId: number): Promise<FantasyStarterSlot[]> {
      // The match → period link is the canonical scoping (a fantasy starter is a lineup_slot for the
      // match's period). No seeded period → no lineups to compare against → empty.
      const match = await prisma.fifaMatch.findUnique({
        where: { balldontlieId: matchBdlId },
        select: { periodId: true },
      });
      if (!match?.periodId) return [];

      const slots = await prisma.lineupSlot.findMany({
        where: { periodId: match.periodId, isStarter: true },
        select: {
          managerId: true,
          playerId: true,
          lockedAt: true,
          player: { select: { balldontlieId: true, displayName: true } },
        },
      });
      return slots.map((s) => ({
        managerId: s.managerId,
        playerId: s.playerId,
        playerBdlId: s.player.balldontlieId,
        playerName: s.player.displayName,
        lockedAt: s.lockedAt,
      }));
    },

    async listUpcomingMatchesWithOwners(now: Date, leadMs: number): Promise<UpcomingMatch[]> {
      // Bound the scan to the lead window; the pure selector re-applies the precise [now, now+lead] cut.
      const matches = await prisma.fifaMatch.findMany({
        where: { kickoffAt: { gte: now, lte: new Date(now.getTime() + leadMs) } },
        select: {
          id: true,
          kickoffAt: true,
          homeTeamId: true,
          awayTeamId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      });

      const out: UpcomingMatch[] = [];
      for (const m of matches) {
        const teamIds = [m.homeTeamId, m.awayTeamId].filter((t): t is string => t !== null);
        // Owners-only, whole roster: any manager with an ACTIVE rostered player on either team.
        const owners =
          teamIds.length === 0
            ? []
            : await prisma.rosterPlayer.findMany({
                where: { droppedAt: null, player: { teamId: { in: teamIds } } },
                select: { managerId: true },
                distinct: ["managerId"],
              });
        out.push({
          matchId: m.id,
          kickoffMs: m.kickoffAt.getTime(),
          label: `${m.homeTeam?.name ?? "TBD"} vs ${m.awayTeam?.name ?? "TBD"}`,
          ownerManagerIds: owners.map((o) => o.managerId),
        });
      }
      return out;
    },
  };
}
