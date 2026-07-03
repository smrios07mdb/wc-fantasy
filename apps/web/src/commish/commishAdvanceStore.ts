/**
 * Prisma IO adapter for the Thread-5 round-cut surface (`handleAdvance.ts`). Server-only (imports
 * `@app/db`); the pure handler never imports it.
 *
 * READS delegate to the relocated commish-core adapter (`createPrismaPlayoffAdvanceStore`) VERBATIM —
 * one round-context assembly (cut marks, ordering signal, alive field, the canonical cumulative-totals
 * helper), zero duplication.
 *
 * The WRITE re-owns the transaction so the single `round_advance` audit row commits ATOMICALLY with the
 * cut (the Thread-4 freeze-store precedent — the relocated adapter's `applyRoundCut` opens its own
 * `$transaction`, and Prisma interactive transactions don't nest, so the audit row could never join it).
 * The two `updateMany` claims MIRROR the relocated adapter's statements exactly (same WHERE, same
 * conditional-claim no-op semantics — pinned against each other by the gated-PG suite):
 *   • `alive → eliminated` claim WHERE status='alive' — 0 rows ⇒ a prior run already cut this round ⇒
 *     "already-cut", the whole transaction is a no-op and NO audit row is written;
 *   • the lone survivor's `alive → champion` flip (final round; the orchestrator passes null otherwise);
 *   • ONE `commish_audit` insert through the shared `recordCommishAudit` seam (tx-bound insert).
 */
import { prisma as defaultPrisma, type PrismaClient } from "@app/db";
import { createPrismaPlayoffAdvanceStore } from "@app/commish-core/advanceStore";
import { recordCommishAudit } from "./recordCommishAudit";
import type { CommishAdvanceStore } from "./handleAdvance";

export function createCommishAdvanceStore(
  prisma: PrismaClient = defaultPrisma,
): CommishAdvanceStore {
  return {
    async getManagerLeagueId(managerId) {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      return m?.leagueId ?? null;
    },

    async getLeagueManagerNames(leagueId) {
      const rows = await prisma.manager.findMany({
        where: { leagueId },
        select: { id: true, displayName: true },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.displayName]));
    },

    forAdvance(buildAudit) {
      const reads = createPrismaPlayoffAdvanceStore(prisma); // the VERBATIM read assembly
      let auditId: string | null = null;
      return {
        auditId: () => auditId,
        store: {
          loadRoundContext: (leagueId, roundLabel) => reads.loadRoundContext(leagueId, roundLabel),

          async applyRoundCut(cut) {
            return prisma.$transaction(async (tx) => {
              const claim = await tx.playoffEntry.updateMany({
                where: {
                  leagueId: cut.leagueId,
                  status: "alive",
                  managerId: { in: cut.eliminated },
                },
                data: {
                  status: "eliminated",
                  eliminatedRound: cut.roundLabel,
                  eliminatedAt: cut.at,
                },
              });
              if (claim.count === 0) return "already-cut" as const; // no write → NO audit row
              if (cut.champion) {
                await tx.playoffEntry.updateMany({
                  where: { leagueId: cut.leagueId, status: "alive", managerId: cut.champion },
                  data: { status: "champion" },
                });
              }
              const row = await recordCommishAudit(buildAudit(cut), (data) =>
                tx.commishAudit.create({ data, select: { id: true } }),
              );
              auditId = row.id;
              return "applied" as const;
            });
          },
        },
      };
    },
  };
}
