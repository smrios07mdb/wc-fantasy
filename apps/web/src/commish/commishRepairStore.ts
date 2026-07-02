/**
 * Prisma IO adapter for the Thread-3a SAFE repair handlers (`handleRosterRepair.ts`). Server-only — the
 * pure handlers never import it.
 *
 * ── `createCommishRepairStore` ── the repair store port. Passes the REAL `@app/faab` / `@app/lineup`
 *    prisma stores through VERBATIM as the runner engines (`faGrant` / `faabRelease` / `lineup`) — the
 *    same stores the live manager routes use, so every invariant (active-ownership unique, valid-drop,
 *    cap, formation, lock-on-play latch + DB trigger) is enforced by the same code. Adds only the thin
 *    web reads (manager/player/period name resolution, the CLI-parity `getAddMatch` kickoff-guard read,
 *    the conservative B3 restate-scope read) and the POST-MUTATION `recordCommishAudit` writer (B4 —
 *    the reused primitives own their transactions, so the audit row lands in its own).
 *
 * ── `createCommishRestate` ── the A6 post-commit restate. A roster/lineup repair changes which slots a
 *    manager owns in a period — NOT any player's `score_player_match` — so the Thread-2
 *    `createCommishRescore` (which re-scores a (match, player)) is the WRONG entrypoint. This runs only
 *    the rollup tail: `recomputeManagerPeriod(..., { allowFrozen: true })` (the commissioner override
 *    past the freeze gate) + `markManagerPeriodProcessed` per period, then `recomputeStanding` once.
 *    Calls only PUBLIC `@app/recompute` orchestration — the engine is byte-untouched.
 */
import { prisma as defaultPrisma, type PrismaClient } from "@app/db";
import { createPrismaFaGrantStore, createPrismaFaabReleaseStore } from "@app/faab/prisma";
import { createPrismaLineupStore } from "@app/lineup/prisma";
import { recomputeManagerPeriod, recomputeStanding } from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";
import { recordCommishAudit } from "./recordCommishAudit";
import type { CommishRepairStore } from "./handleRosterRepair";

export function createCommishRepairStore(prisma: PrismaClient = defaultPrisma): CommishRepairStore {
  return {
    async getManagerRef(managerId) {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true, displayName: true },
      });
      return m ? { leagueId: m.leagueId, displayName: m.displayName } : null;
    },

    async getPlayerNames(playerIds) {
      if (playerIds.length === 0) return {};
      const rows = await prisma.player.findMany({
        where: { id: { in: [...playerIds] } },
        select: { id: true, displayName: true },
      });
      return Object.fromEntries(rows.map((r) => [r.id, r.displayName]));
    },

    async getPeriodRef(periodId) {
      const p = await prisma.period.findUnique({
        where: { id: periodId },
        select: { id: true, label: true },
      });
      return p ? { id: p.id, label: p.label } : null;
    },

    // The VERBATIM runner engines — the same prisma stores the live routes use.
    faGrant: createPrismaFaGrantStore(prisma),
    faabRelease: createPrismaFaabReleaseStore(prisma),
    lineup: createPrismaLineupStore(prisma),

    // CLI-parity (apps/worker/src/commish/cli.ts makeGetAddMatch): the add target's relevant fixture.
    // Pinned → the add's fixture IN that period; unpinned → next upcoming, else most recent played.
    async getAddMatch(playerId, pinnedPeriodId) {
      const sel = {
        kickoffAt: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      } as const;
      const label = (m: {
        homeTeam: { name: string } | null;
        awayTeam: { name: string } | null;
      }): string => `${m.homeTeam?.name ?? "?"} v ${m.awayTeam?.name ?? "?"}`;
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { teamId: true },
      });
      if (!p?.teamId) return null;
      const where = { OR: [{ homeTeamId: p.teamId }, { awayTeamId: p.teamId }] };
      if (pinnedPeriodId !== null) {
        const pm = await prisma.fifaMatch.findFirst({
          where: { ...where, periodId: pinnedPeriodId },
          orderBy: { kickoffAt: "asc" },
          select: sel,
        });
        return pm ? { label: label(pm), kickoffAt: pm.kickoffAt } : null;
      }
      const now = new Date();
      const next = await prisma.fifaMatch.findFirst({
        where: { ...where, kickoffAt: { gte: now } },
        orderBy: { kickoffAt: "asc" },
        select: sel,
      });
      const m =
        next ??
        (await prisma.fifaMatch.findFirst({ where, orderBy: { kickoffAt: "desc" }, select: sel }));
      return m ? { label: label(m), kickoffAt: m.kickoffAt } : null;
    },

    // POST-MUTATION audit (its own tx). The handler catches a throw → 200 audit_pending + full payload.
    async recordAudit(input) {
      return recordCommishAudit(input, (data) =>
        prisma.commishAudit.create({ data, select: { id: true } }),
      );
    },

    // B3 conservative restate scope: every not-closed period of the league. A pure add with no lineup
    // change makes each restate a cheap no-op re-sum; a drop's slot-release can only change membership
    // in a not-closed period's UNLOCKED slots (a closed period's unlocked slots score 0 by definition).
    async getNotClosedPeriodIds(leagueId) {
      const rows = await prisma.period.findMany({
        where: { leagueId, status: { not: "closed" } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },
  };
}

/**
 * The A6 restate, fired POST-COMMIT by the repair handlers. Idempotent + convergent (the worker sweep
 * recomputes the same values); `allowFrozen: true` is the commissioner override past the freeze gate,
 * and the processed-marker drain stops a frozen period's marker from being re-skipped forever (the same
 * reasoning as `createCommishRescore` — see that function's doc).
 */
export function createCommishRestate(
  prisma: PrismaClient = defaultPrisma,
): (managerId: string, periodIds: readonly string[]) => Promise<void> {
  const store = createPrismaStore(prisma);
  return async (managerId, periodIds) => {
    for (const periodId of periodIds) {
      await recomputeManagerPeriod(store, managerId, periodId, { allowFrozen: true });
      await store.markManagerPeriodProcessed({ managerId, periodId });
    }
    const leagueId = await store.getManagerLeagueId(managerId);
    if (leagueId) await recomputeStanding(store, leagueId);
  };
}
