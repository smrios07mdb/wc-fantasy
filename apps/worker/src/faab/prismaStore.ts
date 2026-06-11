/**
 * Prisma-backed {@link FaabCadenceStore} — the production adapter for the per-period FAAB trigger
 * (DECISIONS.md → Theme D "per-matchday acquisition window"). It reads the live-league periods the
 * dispatcher schedules against and stamps the `batch_cleared_at` latch; the clearing itself stays in
 * `@app/faab` (`runFaabBatch` against the Prisma `FaabBatchStore`). Mirrors the period-close cron's
 * "load only the un-actioned periods + their fixtures" read.
 */
import type { PrismaClient } from "@app/db";
import type { FaabCadenceStore } from "./store";
import type { PeriodCadenceView } from "./selectors";

type Db = PrismaClient;

export function createPrismaFaabCadenceStore(prisma: Db): FaabCadenceStore {
  return {
    async loadPeriodsForCadence(): Promise<PeriodCadenceView[]> {
      // Only un-cleared periods of LIVE leagues (group/playoff) — FAAB runs only while a league is live.
      // The `batchClearedAt: null` DB filter makes a re-tick a clean no-op for already-cleared periods;
      // the pure selector is additionally defensive. The period's first kickoff = its earliest fixture.
      const rows = await prisma.period.findMany({
        where: {
          batchClearedAt: null,
          league: { status: { in: ["group", "playoff"] } },
        },
        select: {
          id: true,
          leagueId: true,
          batchClearedAt: true,
          waiverBatchAt: true,
          matches: {
            orderBy: { kickoffAt: "asc" },
            take: 1,
            select: { kickoffAt: true },
          },
        },
      });
      return rows.map((p) => ({
        id: p.id,
        leagueId: p.leagueId,
        batchClearedAt: p.batchClearedAt,
        waiverBatchAt: p.waiverBatchAt,
        firstKickoffAt: p.matches[0]?.kickoffAt ?? null,
      }));
    },

    async stampBatchCleared(periodId: string, at: Date): Promise<void> {
      // Guarded on the latch still being null → idempotent even if two ticks race.
      await prisma.period.updateMany({
        where: { id: periodId, batchClearedAt: null },
        data: { batchClearedAt: at },
      });
    },
  };
}
