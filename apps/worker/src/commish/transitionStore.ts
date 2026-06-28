/**
 * Prisma adapter for the group→playoff transition ({@link ./transition}). The ONLY IO edge: it loads the
 * transition inputs and APPLIES the derived plan in ONE `$transaction`. The pure orchestrator decides
 * WHAT to do; this decides nothing.
 *
 * Idempotency / atomicity: the transaction's FIRST statement is the conditional `league.status='group'`
 * → `'playoff'` claim (the entry gate — `updateMany` returning 0 rows means a concurrent run already
 * transitioned, so this one aborts with NOTHING applied). The rest are upserts (cut_counts, playoff_entry)
 * + idempotent updates (roster release, the two-phase waiver renumber), so a hand re-run of
 * a partially-applied transition converges. Server-side as the table owner — RLS does not bite.
 */
import type { PrismaClient, LeagueStatus } from "@app/db";
import type { PlayoffTransitionStore, TransitionContext } from "./transition";

type Db = PrismaClient;

export function createPrismaPlayoffTransitionStore(prisma: Db): PlayoffTransitionStore {
  return {
    async loadTransitionContext(leagueId): Promise<TransitionContext | null> {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true, status: true },
      });
      if (!league) return null;

      const [standingRows, managerRows, rosterRows, unfrozenGroupRows, r32] = await Promise.all([
        // The FINAL group standings carry the seeds the playoff field is taken from (scope=group_stage).
        prisma.standing.findMany({
          where: { leagueId, scope: "group_stage", seed: { not: null } },
          select: { managerId: true, seed: true },
          orderBy: { seed: "asc" },
        }),
        prisma.manager.findMany({
          where: { leagueId },
          select: { id: true, displayName: true, waiverOrderPosition: true },
        }),
        prisma.rosterPlayer.findMany({
          where: { leagueId, droppedAt: null },
          select: { managerId: true },
        }),
        // Group periods whose results are NOT yet final (frozen_at IS NULL) — the finality precondition.
        prisma.period.findMany({
          where: { leagueId, kind: "group_md", frozenAt: null },
          select: { label: true },
        }),
        // The R32 knockout period + its first fixture kickoff → the trim deadline (first playoff batch).
        prisma.period.findFirst({
          where: { leagueId, kind: "knockout_round", label: "R32" },
          select: {
            id: true,
            batchClearedAt: true,
            waiverBatchAt: true,
            matches: { select: { kickoffAt: true }, orderBy: { kickoffAt: "asc" }, take: 1 },
          },
        }),
      ]);

      const activeRosterSizeByManager: Record<string, number> = {};
      for (const r of rosterRows) {
        activeRosterSizeByManager[r.managerId] = (activeRosterSizeByManager[r.managerId] ?? 0) + 1;
      }

      return {
        leagueId,
        leagueStatus: league.status as LeagueStatus,
        // seed is non-null by the `seed: { not: null }` filter; assert it for the typed shape.
        standings: standingRows.map((s) => ({ managerId: s.managerId, seed: s.seed! })),
        managers: managerRows.map((m) => ({
          managerId: m.id,
          displayName: m.displayName,
          waiverOrderPosition: m.waiverOrderPosition,
        })),
        activeRosterSizeByManager,
        unfinalizedGroupPeriods: unfrozenGroupRows.map((p) => p.label),
        r32Cadence: r32
          ? {
              id: r32.id,
              leagueId,
              batchClearedAt: r32.batchClearedAt,
              waiverBatchAt: r32.waiverBatchAt,
              firstKickoffAt: r32.matches[0]?.kickoffAt ?? null,
            }
          : null,
      };
    },

    async applyTransition(plan, { runAt }): Promise<"applied" | "already-transitioned"> {
      return prisma.$transaction(async (tx) => {
        // (0) ENTRY GATE: conditional group→playoff claim. 0 rows ⇒ a concurrent run already transitioned
        //     → abort this whole transaction (nothing else has run yet).
        const claim = await tx.league.updateMany({
          where: { id: plan.leagueId, status: "group" },
          data: { status: "playoff" },
        });
        if (claim.count === 0) return "already-transitioned" as const;

        // (1) Write the derived cut_count onto each of the 5 knockout periods. They are seeded at
        //     provisioning; upsert by (league, label) so a missing one is created defensively.
        for (const entry of plan.cutSchedule) {
          await tx.period.upsert({
            where: { leagueId_label: { leagueId: plan.leagueId, label: entry.round } },
            update: { kind: "knockout_round", cutCount: entry.cutCount },
            create: {
              leagueId: plan.leagueId,
              kind: "knockout_round",
              label: entry.round,
              cutCount: entry.cutCount,
            },
          });
        }

        // (2) Survival state: one `alive` playoff_entry per field manager, seed carried verbatim. Upsert
        //     by (league, manager) so a re-run resets it to the alive baseline (eliminated_* cleared).
        for (const f of plan.field) {
          await tx.playoffEntry.upsert({
            where: { leagueId_managerId: { leagueId: plan.leagueId, managerId: f.managerId } },
            update: { seed: f.seed, status: "alive", eliminatedRound: null, eliminatedAt: null },
            create: {
              leagueId: plan.leagueId,
              managerId: f.managerId,
              seed: f.seed,
              status: "alive",
            },
          });
        }

        // (3) Release every non-advancer's active roster into the FAAB pool (deactivate ownership).
        const releasedIds = plan.released.map((r) => r.managerId);
        if (releasedIds.length > 0) {
          await tx.rosterPlayer.updateMany({
            where: { leagueId: plan.leagueId, managerId: { in: releasedIds }, droppedAt: null },
            data: { droppedAt: runAt },
          });
        }

        // (4) Carry the rolling waiver order forward. TWO-PHASE against the non-deferrable
        //     unique([league, waiver_order_position]): NULL every manager (the disjoint temp range — and
        //     the END state for non-advancers, who are not re-seeded), then write the survivors' final
        //     contiguous 1..K. Multiple NULLs are allowed by the index.
        await tx.manager.updateMany({
          where: { leagueId: plan.leagueId },
          data: { waiverOrderPosition: null },
        });
        for (const slot of plan.waiverOrder) {
          await tx.manager.update({
            where: { id: slot.managerId },
            data: { waiverOrderPosition: slot.position },
          });
        }

        return "applied" as const;
      });
    },
  };
}
