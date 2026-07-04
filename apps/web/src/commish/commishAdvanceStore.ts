/**
 * Prisma IO adapter for the Thread-5 round-cut surface (`handleAdvance.ts`). Server-only (imports
 * `@app/db`); the pure handler never imports it.
 *
 * READS delegate to the relocated commish-core adapter (`createPrismaPlayoffAdvanceStore`) VERBATIM —
 * one round-context assembly (cut marks, ordering signal, alive field, the canonical cumulative-totals
 * helper), zero duplication.
 *
 * The WRITE no longer re-implements the cut. It calls the relocated adapter's SINGLE `applyRoundCut` writer
 * (`createPrismaPlayoffAdvanceStore`) and hands it a tx-bound AUDIT HOOK, so the `alive → eliminated` claim,
 * the champion flip, the whole-roster RELEASE, and the ONE `round_advance` `commish_audit` row all commit
 * ATOMICALLY inside that writer's transaction (the Thread-4 freeze-store precedent — a failing audit insert
 * rolls the cut AND the release back). The hook builds its row from the injected `buildAudit` and inserts it
 * through the shared `recordCommishAudit` seam, surfacing the inserted id via `auditId()`. The idempotency
 * gate (the writer's 0-row `alive → eliminated` claim) fronts the release AND the hook, so an "already-cut"
 * no-op releases nothing and writes no audit row. No claim / champion / release statement is duplicated here.
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
          loadActiveRosters: (leagueId, managerIds) =>
            reads.loadActiveRosters(leagueId, managerIds),

          // Delegate the cut + release + audit to the SINGLE canonical writer (`reads` IS it), passing a
          // tx-bound audit hook that inserts the ONE `round_advance` row — built by the injected `buildAudit`
          // and written through the shared `recordCommishAudit` seam — inside the writer's transaction, then
          // captures its id for `auditId()`. The writer owns the idempotency gate, so an "already-cut" no-op
          // never reaches the hook (no release, no row). A failing insert rolls the whole transaction back.
          applyRoundCut: (cut) =>
            reads.applyRoundCut(cut, {
              recordAudit: async (tx, released) => {
                const row = await recordCommishAudit(buildAudit(cut, released), (data) =>
                  tx.commishAudit.create({ data, select: { id: true } }),
                );
                auditId = row.id;
              },
            }),
        },
      };
    },
  };
}
