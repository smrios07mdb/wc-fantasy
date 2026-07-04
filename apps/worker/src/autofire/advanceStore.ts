/**
 * The worker {@link PlayoffAdvanceStore} for the UNATTENDED auto-fire (feat/autofire-round-cut FIX 2). It is
 * the SAME store `runRoundAdvance` consumes, but its WRITE re-owns the transaction so the cut, the RELEASE,
 * and a durable `auto_advance` `commish_audit` row all commit ATOMICALLY — replacing the earlier stdout-only
 * audit. This MIRRORS the web adapter (`apps/web/src/commish/commishAdvanceStore.forAdvance`) statement-for-
 * statement (pinned by the gated-PG suite): the relocated `createPrismaPlayoffAdvanceStore`'s `applyRoundCut`
 * opens its OWN `$transaction` and Prisma transactions don't nest, so a durable audit row can only join the
 * cut by re-owning the tx here. READS delegate to that same relocated adapter VERBATIM (zero duplication).
 *
 * It re-implements NO cut/release/resolution LOGIC — the claim statements mirror the adapter's exactly, the
 * release reuses the shared `@app/faab` `releaseEliminatedRosters` primitive verbatim, and the audit row is
 * the shared `@app/commish-core/advanceAudit` builder. The idempotency gate (0-row `alive → eliminated`
 * claim) fronts the release AND the audit: a re-run cuts nothing, releases nothing, and writes NO audit row.
 */
import type { PrismaClient } from "@app/db";
import {
  createPrismaPlayoffAdvanceStore,
  type PlayoffAdvanceStore,
} from "@app/commish-core/advanceStore";
import { recordAdvanceAuditTx } from "@app/commish-core/advanceAudit";
import { releaseEliminatedRosters } from "@app/faab/prisma";

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

    async applyRoundCut(cut) {
      return prisma.$transaction(async (tx) => {
        // Idempotent entry gate — mirrors the relocated adapter's claim exactly. 0 rows ⇒ a prior run
        // already cut this round ⇒ no-op: NO release, NO audit row (matches the web store's semantics).
        const claim = await tx.playoffEntry.updateMany({
          where: { leagueId: cut.leagueId, status: "alive", managerId: { in: cut.eliminated } },
          data: { status: "eliminated", eliminatedRound: cut.roundLabel, eliminatedAt: cut.at },
        });
        if (claim.count === 0) return { outcome: "already-cut" as const };

        if (cut.champion) {
          await tx.playoffEntry.updateMany({
            where: { leagueId: cut.leagueId, status: "alive", managerId: cut.champion },
            data: { status: "champion" },
          });
        }

        // Release the just-cut managers' rosters to the wire, ENLISTED in this tx (shared primitive verbatim).
        const released = await releaseEliminatedRosters(tx, {
          leagueId: cut.leagueId,
          managerIds: cut.eliminated,
          roundPeriodId: cut.roundPeriodId,
          at: cut.at,
        });

        // The durable governance row — NULL actor (system), `auto_advance`, same target_ref shape as the web
        // `round_advance` row. In the SAME tx: cut + release + audit are one atomic unit.
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

        return { outcome: "applied" as const, released };
      });
    },
  };
}
