/**
 * Prisma IO adapter for the two Thread-2 commissioner writes + the sync re-score trigger. Server-only (it
 * imports `@app/db` + `@app/recompute/prisma`) — the pure handlers (`handleStatCorrection.ts`) never import it.
 *
 * ── `createCommishStatStore` ── the write port. Each `apply*` runs the manual-row write AND the
 *    `commish_audit` insert (through the shared `recordCommishAudit` seam, with the transaction client as the
 *    injected insert) inside ONE `$transaction`, so the effect and its audit row commit atomically — exactly
 *    one audit row per write. `dirty: true` on the written raw row is what the recompute sweep's Phase-1 claim
 *    (`claimDirtyPlayerMatches`, which unions stat + rating + manual) picks up, so even absent the sync trigger
 *    the worker re-scores within ≤60s.
 *
 * ── `createCommishRescore` ── the sync trigger. It re-scores the (match, player) through the EXISTING pipeline
 *    (`recomputePlayerMatch`), then restates the affected manager-periods and their league standings with the
 *    commissioner FROZEN-OVERRIDE (`allowFrozen: true`). This is the DECISIONS commissioner-override path: the
 *    worker sweep runs WITHOUT `allowFrozen`, so a correction on a frozen period would update
 *    `score_player_match` but leave the rollup (and thus the leaderboard) stale — the override closes that gap.
 *    It calls only PUBLIC `@app/recompute` orchestration functions; no pipeline internals are touched, and no
 *    file in packages/scoring or packages/recompute changes (the ENGINE-byte-untouched constraint).
 */
import { prisma as defaultPrisma, Prisma, type PrismaClient } from "@app/db";
import {
  recomputePlayerMatch,
  recomputeManagerPeriod,
  recomputeStanding,
  parseStatOverrides,
} from "@app/recompute";
import { createPrismaStore } from "@app/recompute/prisma";
import { recordCommishAudit } from "./recordCommishAudit";
import { mergeStatOverridesIntoExtra } from "./statOverrideExtra";
import type { CommishStatStore } from "./handleStatCorrection";

export function createCommishStatStore(prisma: PrismaClient = defaultPrisma): CommishStatStore {
  return {
    async getManagerLeagueId(managerId) {
      const m = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      return m?.leagueId ?? null;
    },

    async getMatchPlayer(matchId, playerId) {
      const [player, match] = await Promise.all([
        prisma.player.findUnique({ where: { id: playerId }, select: { teamId: true } }),
        prisma.fifaMatch.findUnique({
          where: { id: matchId },
          select: {
            homeTeamId: true,
            awayTeamId: true,
            periodId: true,
            period: { select: { frozenAt: true } },
          },
        }),
      ]);
      if (!player || !match) return null;
      return {
        playerTeamId: player.teamId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        periodId: match.periodId,
        periodFrozen: match.period?.frozenAt != null,
      };
    },

    async applyPenalty({ write, audit }) {
      // Absolute + idempotent upsert (same create/update payload) keyed by (match, player); dirty=true enqueues
      // the recompute. The audit insert shares the transaction so effect + ledger row are all-or-nothing.
      return prisma.$transaction(async (tx) => {
        await tx.manualStatPlayerMatch.upsert({
          where: { matchId_playerId: { matchId: write.matchId, playerId: write.playerId } },
          create: {
            matchId: write.matchId,
            playerId: write.playerId,
            penaltyWon: write.penaltyWon,
            penaltyCommitted: write.penaltyCommitted,
            reason: write.reason,
            enteredByUserId: write.enteredByUserId,
            dirty: true,
          },
          update: {
            penaltyWon: write.penaltyWon,
            penaltyCommitted: write.penaltyCommitted,
            reason: write.reason,
            enteredByUserId: write.enteredByUserId,
            dirty: true,
          },
        });
        const row = await recordCommishAudit(audit, (data) =>
          tx.commishAudit.create({ data, select: { id: true } }),
        );
        return { auditId: row.id };
      });
    },

    async applyRating({ write, audit }) {
      return prisma.$transaction(async (tx) => {
        if (write.kind === "clear") {
          // "Clear override" = DELETE the manual row so the resolver falls back to balldontlie. deleteMany is a
          // no-op when absent (idempotent). Unlike every other write, a DELETE leaves no `dirty=true` row behind
          // — so if the post-commit sync re-score throws, the worker sweep's Phase-1 claim would find nothing to
          // reclaim and the leaderboard would keep the stale manual-based score. Re-dirty whatever raw rows
          // survive for this (match, player) (the balldontlie rating and/or the feed stat row) to restore the
          // same worker-retry backstop the other writes rely on. Both updateManys are no-ops when absent.
          await tx.ratingPlayerMatch.deleteMany({
            where: { matchId: write.matchId, playerId: write.playerId, source: "manual" },
          });
          await tx.ratingPlayerMatch.updateMany({
            where: { matchId: write.matchId, playerId: write.playerId },
            data: { dirty: true },
          });
          await tx.statPlayerMatch.updateMany({
            where: { matchId: write.matchId, playerId: write.playerId },
            data: { dirty: true },
          });
        } else {
          await tx.ratingPlayerMatch.upsert({
            where: {
              matchId_playerId_source: {
                matchId: write.matchId,
                playerId: write.playerId,
                source: "manual",
              },
            },
            create: {
              matchId: write.matchId,
              playerId: write.playerId,
              source: "manual",
              rating: write.rating,
              dirty: true,
            },
            update: { rating: write.rating, dirty: true },
          });
        }
        const row = await recordCommishAudit(audit, (data) =>
          tx.commishAudit.create({ data, select: { id: true } }),
        );
        return { auditId: row.id };
      });
    },

    async getStatOverrides(matchId, playerId) {
      // The CURRENT overlay for the field-change delta only. parseStatOverrides is the SAME bounded parse the
      // recompute adapter uses, so "prior" here matches exactly what scoring reads.
      const row = await prisma.manualStatPlayerMatch.findUnique({
        where: { matchId_playerId: { matchId, playerId } },
        select: { extra: true },
      });
      return parseStatOverrides(row?.extra) ?? {};
    },

    async applyStatCorrection({ write, audit }) {
      // 2b general stat-line overlay. Read-modify-write of `extra`: merge the absolute overlay into
      // `extra.statOverrides` while PRESERVING every other key (notably `rolePlayed`). An empty overlay drops
      // the sub-key (clear-all); an empty resulting object → SQL NULL via Prisma.DbNull. `dirty:true` enqueues
      // the recompute; the penalty columns are NEVER in the update payload, so Thread 2's entries are untouched
      // (and default to 0 on create). Audit shares the tx → effect + ledger row are all-or-nothing.
      return prisma.$transaction(async (tx) => {
        const existing = await tx.manualStatPlayerMatch.findUnique({
          where: { matchId_playerId: { matchId: write.matchId, playerId: write.playerId } },
          select: { extra: true },
        });
        const nextExtra = mergeStatOverridesIntoExtra(existing?.extra, write.overrides);
        const extraValue: Prisma.InputJsonValue | typeof Prisma.DbNull =
          nextExtra === null ? Prisma.DbNull : (nextExtra as Prisma.InputJsonValue);
        await tx.manualStatPlayerMatch.upsert({
          where: { matchId_playerId: { matchId: write.matchId, playerId: write.playerId } },
          create: {
            matchId: write.matchId,
            playerId: write.playerId,
            // penaltyWon / penaltyCommitted intentionally omitted → the schema @default(0) applies on create.
            extra: extraValue,
            reason: write.reason,
            enteredByUserId: write.enteredByUserId,
            dirty: true,
          },
          update: {
            // penalty columns intentionally NOT set here → a stat correction never disturbs a prior penalty entry.
            extra: extraValue,
            reason: write.reason,
            enteredByUserId: write.enteredByUserId,
            dirty: true,
          },
        });
        const row = await recordCommishAudit(audit, (data) =>
          tx.commishAudit.create({ data, select: { id: true } }),
        );
        return { auditId: row.id };
      });
    },
  };
}

/**
 * The sync re-score trigger fired after a committed write. Re-scores the (match, player), then restates the
 * affected manager-periods + league standings with `allowFrozen: true` (commissioner override past the freeze
 * gate). Idempotent and additive: a concurrent worker sweep recomputes the same values and converges. Failures
 * are non-fatal to the write (the write + audit already committed; the `dirty=true` flag lets the worker retry).
 *
 * Returns `{ scored }`: whether `recomputePlayerMatch` actually scored the player. It is FALSE when the adapter's
 * participant gate (`playerAppearedInMatch`) rejects the player — i.e. the (match, player) has NO feed footprint
 * yet (no stat row, no event, no shot), only the just-written manual row (the gate never counts `manual` as
 * participation). The correction is durably stored + dirty, so it folds in the moment the feed records the
 * player (which re-dirties the row → next sweep). The handler surfaces this so a commissioner isn't told a
 * correction "landed" when it is really pending feed participation.
 *
 * The frozen-override path here recomputes each affected manager-period directly (mirroring the worker sweep's
 * Phase 2, but WITH `allowFrozen`), so it must ALSO mark that (manager, period) marker processed — otherwise the
 * marker `recomputePlayerMatch` enqueued would sit unprocessed forever on a frozen period (the worker sweep, run
 * without `allowFrozen`, re-skips it every tick, inflating `skippedFrozen`).
 */
export function createCommishRescore(
  prisma: PrismaClient = defaultPrisma,
): (matchId: string, playerId: string) => Promise<{ scored: boolean }> {
  const store = createPrismaStore(prisma);
  return async (matchId, playerId) => {
    const result = await recomputePlayerMatch(store, matchId, playerId);

    const affected = await store.getAffectedManagerPeriods(matchId, playerId);
    for (const ref of affected) {
      await recomputeManagerPeriod(store, ref.managerId, ref.periodId, { allowFrozen: true });
      // We processed this (manager, period) with the override; drain the marker recomputePlayerMatch enqueued so
      // a frozen period doesn't leave a never-draining marker for the worker to re-skip forever.
      await store.markManagerPeriodProcessed(ref);
    }

    const leagueIds = new Set<string>();
    for (const ref of affected) {
      const leagueId = await store.getManagerLeagueId(ref.managerId);
      if (leagueId) leagueIds.add(leagueId);
    }
    for (const leagueId of leagueIds) {
      await recomputeStanding(store, leagueId);
    }

    return { scored: result != null };
  };
}
