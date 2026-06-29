/**
 * Prisma-backed {@link PeriodStatusStore} — the production adapter for the resident-tick status-advance
 * (P1a — the dual-writer redundancy; DECISIONS.md "dual-writer status-advance"). It performs EXACTLY the
 * reads/writes the `wc-fantasy-period-close` cron's status block performs (periodClose.ts:100-136): an
 * unfiltered lifecycle read of the (single) league's periods + their fixtures, then the guarded
 * `updateMany` apply. The DECISION stays in the unchanged `@app/recompute` `selectPeriodStatusTransitions`.
 */
import type { PrismaClient } from "@app/db";
import type { PeriodStatusTransitions } from "@app/recompute";
import type { LifecyclePeriod, PeriodStatusStore } from "./store";

type Db = PrismaClient;

export function createPrismaPeriodStatusStore(prisma: Db): PeriodStatusStore {
  return {
    async loadLifecyclePeriods(): Promise<LifecyclePeriod[]> {
      // Scope to the single league (mirrors the cron's `league.findFirst` → per-league periods read).
      const league = await prisma.league.findFirst({ select: { id: true } });
      if (!league) return [];

      // ALL periods (NOT `frozenAt: null`-scoped) so the earliest-current pick sees the already-closed
      // waves — the cron's separate lifecycle read at periodClose.ts:100-109.
      return prisma.period.findMany({
        where: { leagueId: league.id },
        select: {
          id: true,
          label: true,
          status: true,
          frozenAt: true,
          matches: { select: { kickoffAt: true, status: true } },
        },
      });
    },

    async applyStatusTransitions({ toClose, toOpen }: PeriodStatusTransitions): Promise<void> {
      // One atomic transaction, the SAME guarded shape as the cron (periodClose.ts:123-136): close only a
      // not-yet-closed row, open only a still-pending row — so an hourly cron run racing this tick is a
      // clean no-op for the second writer rather than a clobber.
      await prisma.$transaction([
        ...toClose.map((periodId) =>
          prisma.period.updateMany({
            where: { id: periodId, status: { not: "closed" } },
            data: { status: "closed" },
          }),
        ),
        ...toOpen.map((periodId) =>
          prisma.period.updateMany({
            where: { id: periodId, status: "pending" },
            data: { status: "open" },
          }),
        ),
      ]);
    },
  };
}
