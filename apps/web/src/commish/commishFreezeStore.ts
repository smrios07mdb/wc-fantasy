/**
 * Prisma IO adapter for the Thread-4 freeze/unfreeze writes. Server-only (imports `@app/db`); the pure
 * handlers (`handleFreeze.ts`) never import it.
 *
 * The write methods run the conditional `frozen_at` update AND the `commish_audit` insert (through the
 * shared `recordCommishAudit` seam, with the transaction client as the injected insert) inside ONE
 * `$transaction` — the effect and its ledger row commit atomically, exactly one audit row per write.
 *
 * RACE GUARD: the update is `updateMany` with the EXPECTED PRIOR STATE in its WHERE (`frozenAt: null`
 * for freeze / `frozenAt: { not: null }` for unfreeze), mirroring the periodClose cron's status
 * transitions. A count of 0 means a concurrent writer (the hourly cron, or a double-submit) got there
 * first — the method returns null WITHOUT inserting the audit row, so a lost race never logs an action
 * that did not happen. The handler maps null to the typed 409.
 */
import { prisma as defaultPrisma, type PrismaClient } from "@app/db";
import { recordCommishAudit } from "./recordCommishAudit";
import type { CommishFreezeStore } from "./handleFreeze";

export function createCommishFreezeStore(prisma: PrismaClient = defaultPrisma): CommishFreezeStore {
  return {
    async getManagerLeagueId(managerId) {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      return m?.leagueId ?? null;
    },

    async getPeriod(periodId) {
      const p = await prisma.period.findUnique({
        where: { id: periodId },
        select: {
          leagueId: true,
          label: true,
          status: true,
          frozenAt: true,
          matches: { select: { status: true } },
        },
      });
      if (!p) return null;
      return {
        leagueId: p.leagueId,
        label: p.label,
        status: p.status,
        frozenAt: p.frozenAt,
        fixtureStatuses: p.matches.map((m) => m.status),
      };
    },

    async freeze({ periodId, now, audit }) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.period.updateMany({
          where: { id: periodId, frozenAt: null },
          data: { frozenAt: now },
        });
        if (updated.count === 0) return null; // lost race — no write, and the audit insert never runs
        const row = await recordCommishAudit(audit, (data) =>
          tx.commishAudit.create({ data, select: { id: true } }),
        );
        return { auditId: row.id };
      });
    },

    async unfreeze({ periodId, audit }) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.period.updateMany({
          where: { id: periodId, frozenAt: { not: null } },
          data: { frozenAt: null },
        });
        if (updated.count === 0) return null;
        const row = await recordCommishAudit(audit, (data) =>
          tx.commishAudit.create({ data, select: { id: true } }),
        );
        return { auditId: row.id };
      });
    },

    async countPendingDirty(periodId) {
      return prisma.recomputeDirty.count({
        where: { scope: "manager_period", periodId, processedAt: null },
      });
    },
  };
}
