/**
 * The worker {@link PlayoffAdvanceStore} for the UNATTENDED auto-fire (feat/autofire-round-cut FIX 2). It is
 * the SAME store `runRoundAdvance` consumes; its WRITE calls the relocated adapter's SINGLE `applyRoundCut`
 * writer (`createPrismaPlayoffAdvanceStore`) and hands it a tx-bound AUDIT HOOK, so the cut, the RELEASE, and a
 * durable `auto_advance` `commish_audit` row all commit ATOMICALLY inside that writer's transaction (a failing
 * insert rolls the cut back). READS delegate to that same relocated adapter VERBATIM (zero duplication).
 *
 * It re-implements NO cut / release / resolution / audit LOGIC — the single writer owns the claim + champion +
 * release, and the hook is the shared `@app/commish-core/advanceAudit` builder (NULL actor ⇒ `auto_advance`).
 * The writer's idempotency gate (0-row `alive → eliminated` claim) fronts the release AND the hook: a re-run
 * cuts nothing, releases nothing, and writes NO audit row.
 */
import type { PrismaClient } from "@app/db";
import {
  createPrismaPlayoffAdvanceStore,
  type PlayoffAdvanceStore,
} from "@app/commish-core/advanceStore";
import { recordAdvanceAuditTx } from "@app/commish-core/advanceAudit";

/** The audit context captured for ONE auto-fire run. The system row is always null-actor + `auto_advance`,
 *  and auto-fire never cuts a tie, so `tieAdjudicated` is always false — only `reason`/`nameOf` vary. */
export interface AutoFireAuditContext {
  reason: string;
  nameOf: Readonly<Record<string, string>>;
}

export function createPrismaAutoFireAdvanceStore(
  prisma: PrismaClient,
  audit: AutoFireAuditContext,
): PlayoffAdvanceStore {
  const reads = createPrismaPlayoffAdvanceStore(prisma); // VERBATIM read assembly (mirrors the web store)
  return {
    loadRoundContext: (leagueId, roundLabel) => reads.loadRoundContext(leagueId, roundLabel),
    loadActiveRosters: (leagueId, managerIds) => reads.loadActiveRosters(leagueId, managerIds),

    // Delegate the cut + release + audit to the SINGLE canonical writer (`reads` IS it), passing a tx-bound
    // audit hook that writes the durable NULL-actor `auto_advance` row via the shared `recordAdvanceAuditTx`
    // builder inside the writer's transaction. The writer's idempotency gate fronts the hook, so a re-tick of
    // an already-cut round writes no row; a failing insert rolls the cut + release back (one atomic unit).
    applyRoundCut: (cut) =>
      reads.applyRoundCut(cut, {
        recordAudit: async (tx, released) => {
          await recordAdvanceAuditTx(tx, {
            leagueId: cut.leagueId,
            actorUserId: null,
            actionType: "auto_advance",
            roundLabel: cut.roundLabel,
            eliminated: cut.eliminated,
            champion: cut.champion,
            released,
            reason: audit.reason,
            tieAdjudicated: false, // auto-fire NEVER cuts a tie (a tie routes to the commissioner alert)
            nameOf: audit.nameOf,
          });
        },
      }),
  };
}
