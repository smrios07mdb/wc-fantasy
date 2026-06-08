/**
 * Prisma-backed {@link FaabBatchStore} + {@link FaabBidStore} — the production IO adapters, and the
 * ONLY file in @app/faab that touches the database (the resolver / validator / controller carry no DB
 * dependency). Reachable only via `@app/faab/prisma`, keeping the package's `.` surface IO-free
 * (proven by `purity.test.ts`).
 *
 * The load-bearing method is {@link FaabBatchStore.commitBatch}: it writes the WHOLE resolved outcome
 * in ONE `$transaction` — the no-double-spend / valid-drop / waiver-order-contiguity guard:
 *  - each bid is settled with a guarded `updateMany WHERE status = 'pending'`, so a re-run (or a bid a
 *    manager cancelled between load and commit) is a clean skip, never a double-apply (idempotency);
 *  - a won claim drops the named player (roster_player.dropped_at), creates the add row, debits the
 *    winner's budget, and clears the dropped player's UNLOCKED lineup_slot rows (the stale-orphan fix
 *    flagged in @app/lineup/prismaStore — a dropped starter must not keep scoring);
 *  - the move-to-bottom reorder is applied as the TWO-PHASE reassignment the schema mandates (negate,
 *    then write the final 1..N) so the non-deferrable `manager_waiver_order_uq` never transiently trips.
 *
 * Like @app/draft / @app/lineup's adapters this has no unit test (it needs a live DB); it is covered by
 * `tsc --noEmit` plus the Memory doubles' tests, which exercise the same controller against the ports.
 */
import type { PrismaClient } from "@app/db";
import { releaseDroppedPlayerSlots, findLockedSlotPlayerIds } from "@app/lineup/prisma";
import type { Position } from "@app/shared";
import type { BidInput, ManagerState } from "./resolve";
import type {
  BatchContext,
  CommitBatchInput,
  FaabBatchStore,
  FaabBidStore,
  ManagerBidContext,
  PersistedBid,
  PlayerFacts,
} from "./store";

type Db = PrismaClient;

const ZERO_COUNTS = (): Record<Position, number> => ({ GK: 0, DEF: 0, MID: 0, FWD: 0 });

/** The add target's acquisition deadline is "his match kicked off". The relevant fixture is his team's
 *  next still-acquirable match — MIN(kickoff) among the team's NOT-completed fixtures (scheduled or
 *  in-progress); a completed/postponed match is excluded. The pure resolver compares this to `now`.
 *
 *  This reads the SAME schedule seam the lock-on-play machinery uses: `fifa_match.kickoff_at`, resolved
 *  per player via `player.team_id`. That is exactly the field `@app/ingest`'s lock derivation
 *  (`lockInstantsFromLineup` / `lockInstantFromSub`) consumes to stamp `lineup_slot.locked_at`, and the
 *  one the lineup loader names for the per-player kickoff token. No second clock — the FAAB acquisition
 *  cutoff and the lineup lock share one source of truth (DECISIONS §D data note). */
async function relevantKickoff(prisma: Db, teamId: string | null): Promise<Date | null> {
  if (teamId === null) return null;
  const m = await prisma.fifaMatch.findFirst({
    where: {
      status: { in: ["scheduled", "in_progress"] },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });
  return m?.kickoffAt ?? null;
}

export function createPrismaFaabBatchStore(prisma: Db): FaabBatchStore {
  return {
    async loadBatchContext(leagueId): Promise<BatchContext | null> {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { id: true },
      });
      if (!league) return null;

      const [managerRows, rosterRows, bidRows] = await Promise.all([
        prisma.manager.findMany({
          where: { leagueId },
          select: { id: true, faabBudget: true, waiverOrderPosition: true },
        }),
        prisma.rosterPlayer.findMany({
          where: { leagueId, droppedAt: null },
          select: { managerId: true, playerId: true, player: { select: { position: true } } },
        }),
        prisma.faabBid.findMany({
          where: { leagueId, status: "pending" },
          select: {
            id: true,
            managerId: true,
            playerAddId: true,
            playerDropId: true,
            amount: true,
            playerAdd: { select: { position: true, teamId: true } },
            playerDrop: { select: { position: true } },
          },
        }),
      ]);

      // Per-manager roster counts + owned sets, and the league-wide owned set.
      const counts = new Map<string, Record<Position, number>>();
      const owned = new Map<string, Set<string>>();
      const ownedByLeague = new Set<string>();
      for (const m of managerRows) {
        counts.set(m.id, ZERO_COUNTS());
        owned.set(m.id, new Set());
      }
      for (const r of rosterRows) {
        counts.get(r.managerId)![r.player.position] += 1;
        owned.get(r.managerId)!.add(r.playerId);
        ownedByLeague.add(r.playerId);
      }

      const managers: ManagerState[] = managerRows.map((m) => ({
        managerId: m.id,
        faabBudget: m.faabBudget,
        waiverOrderPosition: m.waiverOrderPosition,
        counts: counts.get(m.id)!,
        ownedPlayerIds: [...owned.get(m.id)!],
      }));

      // Resolve each add target's relevant-fixture kickoff once per distinct team.
      const teamOf = new Map<string, string | null>();
      for (const b of bidRows) teamOf.set(b.playerAddId, b.playerAdd.teamId);
      const kickoffByTeam = new Map<string | null, Date | null>();
      for (const teamId of new Set(teamOf.values())) {
        kickoffByTeam.set(teamId, await relevantKickoff(prisma, teamId));
      }

      // Which named drops are LOCKED by play (lineup_slot.locked_at in a still-open matchday)? Resolved
      // through @app/lineup so faab never reads lineup_slot itself. Per (manager → his locked drops).
      const dropsByManager = new Map<string, string[]>();
      for (const b of bidRows) {
        if (b.playerDropId === null) continue;
        const list = dropsByManager.get(b.managerId) ?? [];
        list.push(b.playerDropId);
        dropsByManager.set(b.managerId, list);
      }
      const lockedByManager = new Map<string, Set<string>>();
      for (const [managerId, playerIds] of dropsByManager) {
        lockedByManager.set(
          managerId,
          await findLockedSlotPlayerIds(prisma, { managerId, playerIds }),
        );
      }

      const bids: BidInput[] = bidRows.map((b) => ({
        bidId: b.id,
        managerId: b.managerId,
        playerAddId: b.playerAddId,
        addPosition: b.playerAdd.position,
        addTargetKickoffAt: kickoffByTeam.get(b.playerAdd.teamId) ?? null,
        playerDropId: b.playerDropId,
        dropPosition: b.playerDrop?.position ?? null,
        dropLocked:
          b.playerDropId !== null &&
          (lockedByManager.get(b.managerId)?.has(b.playerDropId) ?? false),
        amount: b.amount,
      }));

      return { leagueId, managers, bids, ownedByLeague };
    },

    async commitBatch({ leagueId, runAt, outcome }: CommitBatchInput): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const batch = await tx.faabBatch.create({
          data: { leagueId, runAt, status: "processing" },
          select: { id: true },
        });

        for (const r of outcome.resolutions) {
          if (r.outcome === "won") {
            // Settle the bid FIRST, guarded — only if it is still pending do we apply side effects.
            const settled = await tx.faabBid.updateMany({
              where: { id: r.bidId, status: "pending" },
              data: { status: "won", batchId: batch.id },
            });
            if (settled.count !== 1) continue;

            if (r.playerDropId !== null) {
              await tx.rosterPlayer.updateMany({
                where: {
                  leagueId,
                  managerId: r.managerId,
                  playerId: r.playerDropId,
                  droppedAt: null,
                },
                data: { droppedAt: runAt },
              });
              // Release the dropped player's UNLOCKED lineup slots so a dropped starter stops scoring.
              // The lineup_slot table is owned by @app/lineup, so we call its exported reconciliation
              // helper (in this same tx) rather than touch the table — faab never references lineup_slot.
              await releaseDroppedPlayerSlots(tx, {
                leagueId,
                managerId: r.managerId,
                playerId: r.playerDropId,
              });
            }
            await tx.rosterPlayer.create({
              data: {
                leagueId,
                managerId: r.managerId,
                playerId: r.playerAddId,
                acquiredAt: runAt,
              },
            });
            await tx.manager.update({
              where: { id: r.managerId },
              data: { faabBudget: { decrement: r.amount } },
            });
          } else {
            await tx.faabBid.updateMany({
              where: { id: r.bidId, status: "pending" },
              data: {
                status: r.outcome === "lost" ? "lost" : "voided_refunded",
                batchId: batch.id,
              },
            });
          }
        }

        // Move-to-bottom reorder: TWO-PHASE so the non-deferrable unique index never transiently trips.
        // Phase 1 parks every seeded manager in a disjoint NEGATIVE range; phase 2 writes the final 1..N.
        if (outcome.waiverOrderChanged) {
          for (const slot of outcome.waiverOrder) {
            await tx.manager.update({
              where: { id: slot.managerId },
              data: { waiverOrderPosition: -slot.position },
            });
          }
          for (const slot of outcome.waiverOrder) {
            await tx.manager.update({
              where: { id: slot.managerId },
              data: { waiverOrderPosition: slot.position },
            });
          }
        }

        await tx.faabBatch.update({ where: { id: batch.id }, data: { status: "complete" } });
        return batch.id;
      });
    },
  };
}

export function createPrismaFaabBidStore(prisma: Db): FaabBidStore {
  return {
    async loadManagerBidContext(managerId): Promise<ManagerBidContext | null> {
      const manager = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true, faabBudget: true },
      });
      if (!manager) return null;

      const [mineRows, leagueRows] = await Promise.all([
        prisma.rosterPlayer.findMany({
          where: { managerId, droppedAt: null },
          select: { playerId: true, player: { select: { position: true } } },
        }),
        prisma.rosterPlayer.findMany({
          where: { leagueId: manager.leagueId, droppedAt: null },
          select: { playerId: true },
        }),
      ]);

      const counts = ZERO_COUNTS();
      const ownedByManager = new Set<string>();
      for (const r of mineRows) {
        counts[r.player.position] += 1;
        ownedByManager.add(r.playerId);
      }
      return {
        leagueId: manager.leagueId,
        faabBudget: manager.faabBudget,
        counts,
        squadSize: mineRows.length,
        ownedByManager,
        ownedByLeague: new Set(leagueRows.map((r) => r.playerId)),
      };
    },

    async isDropLocked(managerId, playerDropId): Promise<boolean> {
      // Locked-by-play check via @app/lineup (lineup_slot.locked_at in a still-open matchday).
      const locked = await findLockedSlotPlayerIds(prisma, {
        managerId,
        playerIds: [playerDropId],
      });
      return locked.has(playerDropId);
    },

    async sumOtherPendingBids(managerId, exceptBidId): Promise<number> {
      const agg = await prisma.faabBid.aggregate({
        where: {
          managerId,
          status: "pending",
          ...(exceptBidId ? { id: { not: exceptBidId } } : {}),
        },
        _sum: { amount: true },
      });
      return agg._sum.amount ?? 0;
    },

    async getPlayerFacts(playerId): Promise<PlayerFacts | null> {
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { position: true, teamId: true },
      });
      if (!p) return null;
      return { position: p.position, kickoffAt: await relevantKickoff(prisma, p.teamId) };
    },

    async createBid(bid): Promise<PersistedBid> {
      const row = await prisma.faabBid.create({
        data: {
          leagueId: bid.leagueId,
          managerId: bid.managerId,
          playerAddId: bid.playerAddId,
          playerDropId: bid.playerDropId,
          amount: bid.amount,
          note: bid.note,
          submittedAt: bid.submittedAt,
          status: "pending",
        },
        select: {
          id: true,
          managerId: true,
          playerAddId: true,
          playerDropId: true,
          amount: true,
          note: true,
        },
      });
      return { bidId: row.id, ...row };
    },

    async getBid(
      bidId,
    ): Promise<{ managerId: string; status: string; playerAddId: string } | null> {
      const r = await prisma.faabBid.findUnique({
        where: { id: bidId },
        select: { managerId: true, status: true, playerAddId: true },
      });
      return r ?? null;
    },

    async updateBid(bidId, patch): Promise<PersistedBid | null> {
      const updated = await prisma.faabBid.updateMany({
        where: { id: bidId, status: "pending" },
        data: { amount: patch.amount, playerDropId: patch.playerDropId, note: patch.note },
      });
      if (updated.count !== 1) return null;
      const row = await prisma.faabBid.findUnique({
        where: { id: bidId },
        select: {
          id: true,
          managerId: true,
          playerAddId: true,
          playerDropId: true,
          amount: true,
          note: true,
        },
      });
      return row ? { bidId: row.id, ...row } : null;
    },

    async cancelBid(bidId): Promise<boolean> {
      const deleted = await prisma.faabBid.deleteMany({ where: { id: bidId, status: "pending" } });
      return deleted.count > 0;
    },
  };
}
