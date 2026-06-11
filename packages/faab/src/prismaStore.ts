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
  FaGrantContext,
  FaGrantStore,
  FaTargetFacts,
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

/** The acquisition cutoff for ADDING a player (Theme-D "per-matchday acquisition window" amendment):
 *  the LEAGUE-WIDE first kickoff of the PERIOD his next still-acquirable fixture falls in — superseding
 *  the per-player kickoff. Resolution: his relevant fixture (the same MIN(kickoff) among NOT-completed
 *  fixtures `relevantKickoff` finds) → that fixture's `period_id` → MIN(kickoff) among the period's
 *  fixtures. A fixture with no period link yet falls back to its own kickoff (defensive — pre-seed).
 *  Only `getPlayerFacts` (the submission path) uses this; the BATCH keeps the per-player kickoff for the
 *  resolver's defensive void-refund branch. */
async function periodFirstKickoff(prisma: Db, teamId: string | null): Promise<Date | null> {
  if (teamId === null) return null;
  const m = await prisma.fifaMatch.findFirst({
    where: {
      status: { in: ["scheduled", "in_progress"] },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true, periodId: true },
  });
  if (!m) return null;
  if (m.periodId === null) return m.kickoffAt; // no period seeded yet → fall back to the fixture kickoff
  const first = await prisma.fifaMatch.findFirst({
    where: { periodId: m.periodId },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });
  return first?.kickoffAt ?? m.kickoffAt;
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

    async commitBatch({
      leagueId,
      runAt,
      outcome,
      claimPeriodId,
    }: CommitBatchInput): Promise<string | null> {
      return prisma.$transaction(async (tx) => {
        // ENTRY GATE: atomically claim the period. The conditional `batch_cleared_at IS NULL` + the
        // rowcount check is the once-only guard — if another worker/tick already cleared this period,
        // 0 rows match and we abort BEFORE any irreversible mutation (the whole tx rolls back to a
        // no-op). The claim and the apply share this single transaction, so a crash can't leave the
        // period applied-but-unclaimed or claimed-but-unapplied.
        const claimed = await tx.period.updateMany({
          where: { id: claimPeriodId, batchClearedAt: null },
          data: { batchClearedAt: runAt },
        });
        if (claimed.count === 0) return null;

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
      return {
        position: p.position,
        periodFirstKickoffAt: await periodFirstKickoff(prisma, p.teamId),
      };
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

// ── the $0 free-agency route's adapter (Prompt 48) ─────────────────────────────────

/** Raised inside the claim transaction for a non-exception conflict (eligibility lost / drop gone) so
 *  the whole transaction rolls back; caught outside and reported as "conflict". */
class FaConflict extends Error {}

/** A Prisma unique-violation (P2002) — here, the active-ownership unique: someone else owns the add. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** The add target's PERIOD window: the period his next still-acquirable fixture falls in → that
 *  period's `batch_cleared_at` (the FA snapshot instant T) + its first kickoff (MIN over the period).
 *  Resolved the same way the bid store derives the per-player / period kickoff (no second clock). */
async function resolveAddPeriodWindow(
  db: Pick<Db, "fifaMatch" | "period">,
  teamId: string | null,
): Promise<{ batchClearedAt: Date | null; firstKickoffAt: Date | null } | null> {
  if (teamId === null) return null;
  const m = await db.fifaMatch.findFirst({
    where: {
      status: { in: ["scheduled", "in_progress"] },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    orderBy: { kickoffAt: "asc" },
    select: { periodId: true, kickoffAt: true },
  });
  if (!m) return null;
  if (m.periodId === null) return { batchClearedAt: null, firstKickoffAt: m.kickoffAt };
  const [period, first] = await Promise.all([
    db.period.findUnique({ where: { id: m.periodId }, select: { batchClearedAt: true } }),
    db.fifaMatch.findFirst({
      where: { periodId: m.periodId },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true },
    }),
  ]);
  return {
    batchClearedAt: period?.batchClearedAt ?? null,
    firstKickoffAt: first?.kickoffAt ?? m.kickoffAt,
  };
}

/** The roster-ownership WHERE that makes a player INELIGIBLE for a $0 FA grant at the batch-clear
 *  snapshot instant T: an ownership row that is active (dropped_at IS NULL) OR was dropped at/after T.
 *  The SINGLE definition of the FA snapshot predicate (DECISIONS §D) — shared by the per-player
 *  {@link FaGrantStore.getFaTargetFacts} re-check (one player) and the batch
 *  {@link listFaIneligiblePlayerIds} (the waivers loader's offered pool), so the list the UI shows and
 *  the grant the route accepts can never drift. */
function snapshotOwnershipWhere(leagueId: string, snapshotAt: Date, playerId?: string) {
  return {
    leagueId,
    ...(playerId ? { playerId } : {}),
    OR: [{ droppedAt: null }, { droppedAt: { gte: snapshotAt } }],
  };
}

/** The player ids that are NOT snapshot-eligible free agents at `snapshotAt` (= the current period's
 *  batch_cleared_at): every player with an ownership row matching the FA snapshot predicate (owned now,
 *  OR dropped during this window). The waivers loader subtracts this from the player pool to offer
 *  EXACTLY the free agents the $0 grant will accept — reusing the same predicate
 *  {@link FaGrantStore.getFaTargetFacts} re-checks, so the offered list and the accepted grant cannot
 *  drift (a stale list only ever falls through to the route's `fa-conflict` 409). */
export async function listFaIneligiblePlayerIds(
  db: Db,
  leagueId: string,
  snapshotAt: Date,
): Promise<Set<string>> {
  const rows = await db.rosterPlayer.findMany({
    where: snapshotOwnershipWhere(leagueId, snapshotAt),
    distinct: ["playerId"],
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}

export function createPrismaFaGrantStore(prisma: Db): FaGrantStore {
  return {
    async loadManagerFaContext(managerId): Promise<FaGrantContext | null> {
      const manager = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      if (!manager) return null;
      const mine = await prisma.rosterPlayer.findMany({
        where: { managerId, droppedAt: null },
        select: { playerId: true, player: { select: { position: true } } },
      });
      const counts = ZERO_COUNTS();
      const ownedByManager = new Set<string>();
      for (const r of mine) {
        counts[r.player.position] += 1;
        ownedByManager.add(r.playerId);
      }
      return { leagueId: manager.leagueId, counts, squadSize: mine.length, ownedByManager };
    },

    async getFaTargetFacts(leagueId, playerId): Promise<FaTargetFacts | null> {
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { position: true, teamId: true },
      });
      if (!p) return null;
      const window = (await resolveAddPeriodWindow(prisma, p.teamId)) ?? {
        batchClearedAt: null,
        firstKickoffAt: null,
      };
      // FA-eligible = open at this period's batch-clear AND still unowned (the batch-clear SNAPSHOT, not
      // live-unowned). The single immutable predicate lives in `snapshotOwnershipWhere` (also used by the
      // batch `listFaIneligiblePlayerIds` the waivers loader offers, so the list + this re-check can't
      // drift): NO ownership row touching or after T = batch_cleared_at — which holds batch winners/
      // droppees, mid-window FA drops, and claimed-then-dropped, while letting genuinely-unclaimed players
      // (and prior-period releases) through. False until the batch has cleared.
      const T = window.batchClearedAt;
      const faEligible =
        T !== null &&
        (await prisma.rosterPlayer.count({
          where: snapshotOwnershipWhere(leagueId, T, playerId),
        })) === 0;
      return { position: p.position, window, faEligible };
    },

    async getDropFacts(playerId): Promise<{ position: Position } | null> {
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { position: true },
      });
      return p ? { position: p.position } : null;
    },

    async isDropLocked(managerId, playerDropId): Promise<boolean> {
      const locked = await findLockedSlotPlayerIds(prisma, {
        managerId,
        playerIds: [playerDropId],
      });
      return locked.has(playerDropId);
    },

    async claimFreeAgent({
      leagueId,
      managerId,
      playerAddId,
      playerDropId,
      runAt,
    }): Promise<"granted" | "conflict"> {
      try {
        await prisma.$transaction(async (tx) => {
          // Resolve the add target's period batch-clear instant T (the snapshot) inside the tx.
          const player = await tx.player.findUnique({
            where: { id: playerAddId },
            select: { teamId: true },
          });
          const window = player ? await resolveAddPeriodWindow(tx, player.teamId) : null;
          const T = window?.batchClearedAt ?? null;
          if (T === null) throw new FaConflict(); // window not open (defensive — the handler gated it)

          // Re-check FA eligibility under the SAME snapshot predicate (catches the claimed-then-dropped
          // race the active-ownership unique alone would miss).
          const stillOpen = await tx.rosterPlayer.count({
            where: {
              leagueId,
              playerId: playerAddId,
              OR: [{ droppedAt: null }, { droppedAt: { gte: T } }],
            },
          });
          if (stillOpen !== 0) throw new FaConflict();

          if (playerDropId !== null) {
            const dropped = await tx.rosterPlayer.updateMany({
              where: { leagueId, managerId, playerId: playerDropId, droppedAt: null },
              data: { droppedAt: runAt },
            });
            if (dropped.count !== 1) throw new FaConflict(); // the drop is no longer actively owned
            // Release the dropped player's UNLOCKED lineup slots (the @app/lineup boundary; same as the
            // batch) so a dropped starter stops scoring.
            await releaseDroppedPlayerSlots(tx, { leagueId, managerId, playerId: playerDropId });
          }

          // Claim the add — gated on the `roster_player_active_ownership_uq` partial unique (the
          // first-come guard). A concurrent winner makes this INSERT raise P2002 → conflict.
          // $0: NO manager.faab_budget change, NO waiver-order mutation (instant FA is bids-free).
          await tx.rosterPlayer.create({
            data: { leagueId, managerId, playerId: playerAddId, acquiredAt: runAt },
          });
        });
        return "granted";
      } catch (e) {
        if (e instanceof FaConflict || isUniqueViolation(e)) return "conflict";
        throw e;
      }
    },
  };
}
