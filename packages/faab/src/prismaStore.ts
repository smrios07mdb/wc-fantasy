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
import { rosterCapForPlayoffPhase, type Position } from "@app/shared";
import { liveOwnedWhere, isAddTeamEliminated } from "./faEligibility";
import type { BidInput, ManagerState } from "./resolve";
import type {
  BatchContext,
  CommitBatchInput,
  FaabBatchStore,
  FaabBidStore,
  FaabReleaseStore,
  FaGrantContext,
  FaGrantStore,
  FaTargetFacts,
  ManagerBidContext,
  OverCapSurvivor,
  PersistedBid,
  PlayerFacts,
  ReleaseContext,
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
      // P3: the cap AND the D4 participant filter derive from playoff_entry EXISTENCE (the atomic twin of
      // league.status='playoff'), never the status field. Read ONCE here — a plain pre-validation read;
      // commitBatch's apply $transaction reads no cap/status, so this adds no lock to the spend path.
      const playoffPhaseActive = await loadPlayoffPhaseActive(prisma, leagueId);

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
            playerAdd: {
              select: { position: true, teamId: true, team: { select: { eliminated: true } } },
            },
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
        // Add-side eliminated-team gate (DECISIONS §D): the resolver voids+refunds this bid in its
        // pre-loop (same terminal shape as a kicked-off add). null team ⇒ not eliminated.
        addTeamEliminated: isAddTeamEliminated(b.playerAdd.team?.eliminated ?? null),
        playerDropId: b.playerDropId,
        dropPosition: b.playerDrop?.position ?? null,
        dropLocked:
          b.playerDropId !== null &&
          (lockedByManager.get(b.managerId)?.has(b.playerDropId) ?? false),
        amount: b.amount,
      }));

      // D4 (trim-down): in the playoff phase the batch competes ONLY the `alive` playoff_entry holders —
      // the resolver voids any other manager's bid. Null in group / pre-playoff (everyone participates).
      const participantManagerIds = playoffPhaseActive
        ? new Set(
            (
              await prisma.playoffEntry.findMany({
                where: { leagueId, status: "alive" },
                select: { managerId: true },
              })
            ).map((e) => e.managerId),
          )
        : null;

      return {
        leagueId,
        managers,
        bids,
        ownedByLeague,
        rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive),
        participantManagerIds,
      };
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
      // P3: phase + cap derive from playoff_entry EXISTENCE (the atomic twin of league.status='playoff'),
      // never the status field. One read feeds the participant gate and the cap.
      const playoffPhaseActive = await loadPlayoffPhaseActive(prisma, manager.leagueId);
      const isPlayoffParticipant = await loadIsPlayoffParticipant(prisma, {
        playoffPhaseActive,
        leagueId: manager.leagueId,
        managerId,
      });
      return {
        leagueId: manager.leagueId,
        faabBudget: manager.faabBudget,
        counts,
        squadSize: mineRows.length,
        rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive),
        ownedByManager,
        ownedByLeague: new Set(leagueRows.map((r) => r.playerId)),
        isPlayoffParticipant,
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
        select: { position: true, teamId: true, team: { select: { eliminated: true } } },
      });
      if (!p) return null;
      // The submission cutoff + the sealed→FA latch share the SAME add-period window the $0 FA grant
      // resolves (`resolveAddPeriodWindow`): the period of the player's next still-acquirable fixture →
      // that period's first kickoff (the "locked" bound) + its `batch_cleared_at` (the sealed→FA latch).
      // One resolver = the bid route and the FA route can never disagree on which period gates the add.
      const window = await resolveAddPeriodWindow(prisma, p.teamId);
      return {
        position: p.position,
        periodFirstKickoffAt: window?.firstKickoffAt ?? null,
        periodBatchClearedAt: window?.batchClearedAt ?? null,
        // Add-side eliminated-team gate (DECISIONS §D): the validator rejects with `add-team-eliminated`.
        addTeamEliminated: isAddTeamEliminated(p.team?.eliminated ?? null),
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

/** A specific period's FA window: its `batch_cleared_at` (the sealed→free-agency LATCH instant) + its
 *  first kickoff (MIN over the period's fixtures). The shared tail of BOTH the next-fixture inference
 *  below and the commissioner `--period` pin. (This is the WINDOW phase, not FA eligibility — eligibility
 *  is live-unowned per `liveOwnedWhere`.) */
async function resolvePeriodWindow(
  db: Pick<Db, "fifaMatch" | "period">,
  periodId: string,
): Promise<{ batchClearedAt: Date | null; firstKickoffAt: Date | null }> {
  const [period, first] = await Promise.all([
    db.period.findUnique({ where: { id: periodId }, select: { batchClearedAt: true } }),
    db.fifaMatch.findFirst({
      where: { periodId },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true },
    }),
  ]);
  return {
    batchClearedAt: period?.batchClearedAt ?? null,
    firstKickoffAt: first?.kickoffAt ?? null,
  };
}

/** The add target's PERIOD window: the period his next still-acquirable fixture falls in → that
 *  period's `batch_cleared_at` (the sealed→free-agency LATCH instant) + its first kickoff (MIN over the
 *  period). Resolved the same way the bid store derives the per-player / period kickoff (no second clock).
 *
 *  A `pinnedPeriodId` (the commissioner `--period`) resolves THAT period directly and bypasses the
 *  next-fixture inference — whose `status IN (scheduled, in_progress)` filter EXCLUDES an already-played
 *  player's only relevant (completed) fixture and lands on a still-sealed later MD (`batch_cleared_at`
 *  null → a wrong fa-conflict). The pin is what unblocks the MD1 "our-fault" repairs. */
async function resolveAddPeriodWindow(
  db: Pick<Db, "fifaMatch" | "period">,
  teamId: string | null,
  pinnedPeriodId?: string | null,
): Promise<{ batchClearedAt: Date | null; firstKickoffAt: Date | null } | null> {
  if (pinnedPeriodId != null) return resolvePeriodWindow(db, pinnedPeriodId);
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
  const w = await resolvePeriodWindow(db, m.periodId);
  return { batchClearedAt: w.batchClearedAt, firstKickoffAt: w.firstKickoffAt ?? m.kickoffAt };
}

/** The player ids that are NOT addable from the FAAB pool — the UNION of two orthogonal add-side rules
 *  (so the waivers loader can subtract one set to offer EXACTLY the addable players):
 *   1. OWNERSHIP — every player holding an ACTIVE ownership row (dropped_at IS NULL) in the league
 *      (`liveOwnedWhere`), the same predicate {@link FaGrantStore.getFaTargetFacts} + `claimFreeAgent`
 *      re-check, so the offered list and the accepted grant cannot drift; AND
 *   2. ELIMINATION (DECISIONS §D add gate) — every player whose WC team is ELIMINATED
 *      (`fifa_team.eliminated`), the same flag `getFaTargetFacts` / `claimFreeAgent` / the bid validator
 *      / the batch resolver enforce. A player with no team is never eliminated. UNLIKE the ownership set
 *      this also removes UNOWNED eliminated-team players from the pool — the whole point of the gate.
 *  A stale list only ever falls through to the route's `fa-conflict` / `fa-not-eligible` 409. */
export async function listFaIneligiblePlayerIds(db: Db, leagueId: string): Promise<Set<string>> {
  const [owned, eliminated] = await Promise.all([
    db.rosterPlayer.findMany({
      where: liveOwnedWhere(leagueId),
      distinct: ["playerId"],
      select: { playerId: true },
    }),
    db.player.findMany({
      where: { team: { eliminated: true } },
      select: { id: true },
    }),
  ]);
  const ids = new Set(owned.map((r) => r.playerId));
  for (const p of eliminated) ids.add(p.id);
  return ids;
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
      // P3: phase + cap derive from playoff_entry EXISTENCE (the atomic twin of league.status='playoff'),
      // never the status field. One read feeds the participant gate and the cap.
      const playoffPhaseActive = await loadPlayoffPhaseActive(prisma, manager.leagueId);
      const isPlayoffParticipant = await loadIsPlayoffParticipant(prisma, {
        playoffPhaseActive,
        leagueId: manager.leagueId,
        managerId,
      });
      return {
        leagueId: manager.leagueId,
        counts,
        squadSize: mine.length,
        rosterCap: rosterCapForPlayoffPhase(playoffPhaseActive),
        ownedByManager,
        isPlayoffParticipant,
      };
    },

    async getFaTargetFacts(leagueId, playerId): Promise<FaTargetFacts | null> {
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { position: true, teamId: true, team: { select: { eliminated: true } } },
      });
      if (!p) return null;
      const window = (await resolveAddPeriodWindow(prisma, p.teamId)) ?? {
        batchClearedAt: null,
        firstKickoffAt: null,
      };
      // FA-eligible = LIVE-UNOWNED (the target holds NO active roster row right now — commish decision
      // Jun 18 2026, the batch-clear snapshot + anti-snipe hold are retired) AND the add-side eliminated-
      // team gate (DECISIONS §D): his WC team must NOT be eliminated (a no-team player is never
      // eliminated). The single `liveOwnedWhere` predicate is shared with the pool list + the
      // `claimFreeAgent` re-check, and the single `isAddTeamEliminated` rule with the bid validator + the
      // resolver — so the offered list, this re-check, and the grant cannot drift. `validateFaGrant`
      // rejects a false `faEligible` with the existing `fa-not-eligible` (no validator change). The window
      // phase is gated separately by `validateFaGrant` (step 1).
      const teamEliminated = isAddTeamEliminated(p.team?.eliminated ?? null);
      const faEligible =
        !teamEliminated &&
        (await prisma.rosterPlayer.count({ where: liveOwnedWhere(leagueId, playerId) })) === 0;
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
      periodId,
      allowEliminated,
    }): Promise<"granted" | "conflict"> {
      try {
        await prisma.$transaction(async (tx) => {
          // WINDOW guard (NOT eligibility): the add target's period must have cleared its batch (be in
          // its free-agency phase) inside the tx. A pinned `periodId` (commish --period) resolves THAT
          // period's batch_cleared_at directly; otherwise the add's next-still-acquirable fixture infers
          // it (which for an already-played add points at a still-sealed later MD → the wrong fa-conflict
          // the pin repairs). Unchanged by the live-unowned move — this is the sealed→FA latch, not the
          // ownership predicate; the route already gated it (defensive belt-and-suspenders / commish path).
          const player = await tx.player.findUnique({
            where: { id: playerAddId },
            select: { teamId: true, team: { select: { eliminated: true } } },
          });
          const window = await resolveAddPeriodWindow(tx, player?.teamId ?? null, periodId);
          const T = window?.batchClearedAt ?? null;
          if (T === null) throw new FaConflict(); // the period's batch window is not open

          // Add-side eliminated-team RACE BELT (DECISIONS §D add gate): the add target's WC team must NOT
          // be eliminated (`fifa_team.eliminated`, the SAME flag the pool list + the per-player re-check +
          // the bid validator + the resolver enforce) — catches a team flipped eliminated between the
          // pre-tx validate and this commit, mirroring the live-unowned belt below. A no-team player is
          // never eliminated. The commissioner override (`allowEliminated`) deliberately bypasses it (the
          // commish roster repair); the live manager route never passes it.
          if (isAddTeamEliminated(player?.team?.eliminated ?? null) && allowEliminated !== true) {
            throw new FaConflict();
          }

          // Re-check FA eligibility under the LIVE-UNOWNED predicate (commish decision Jun 18 2026): the
          // add must hold NO active roster row right now — the SAME `liveOwnedWhere` the pool + per-player
          // re-check use (no longer snapshot-anchored). Catches the claimed-then-dropped race the
          // active-ownership unique alone would miss.
          const activeOwners = await tx.rosterPlayer.count({
            where: liveOwnedWhere(leagueId, playerAddId),
          });
          if (activeOwners !== 0) throw new FaConflict();

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

// ── the playoff trim-down release adapter (DECISIONS §D trim-down) ──────────────────

/**
 * Data-existence PHASE predicate for the FAAB/waiver READ path: the league is in the playoff phase iff ANY
 * `playoff_entry` row exists for it. This is the atomic twin of `league.status === 'playoff'` — the
 * group→playoff transition writes the status flip and the `alive` playoff_entry rows in ONE
 * `applyTransition` $transaction (apps/worker/src/commish/transitionStore.ts), so they never diverge in a
 * reachable phase — but keying on the DATA, not the status field, is the contract the dashboard/playoffs
 * loaders honor (DECISIONS → "FAAB/waiver phase derives from playoff_entry existence"). Deliberately NOT
 * `selectTournamentPhase` (kickoff-based): that returns `group` during the R32 pre-kickoff trim window and
 * `complete` after the Final, either of which would wrongly re-open the squad cap.
 */
export async function loadPlayoffPhaseActive(
  db: Pick<Db, "playoffEntry">,
  leagueId: string,
): Promise<boolean> {
  return (await db.playoffEntry.count({ where: { leagueId } })) > 0;
}

/**
 * D4 participant gate, single-sourced: outside the playoff phase EVERYONE participates (so group flows are
 * byte-identical); in the playoff phase a participant is a manager with an `alive` playoff_entry. Keyed on
 * `status === 'alive'` (NOT row-exists) so a later per-round `eliminated` flip removes them — Phase-2 ready.
 * `playoffPhaseActive` is the data-existence phase signal ({@link loadPlayoffPhaseActive}), NOT league.status.
 */
export async function loadIsPlayoffParticipant(
  db: Pick<Db, "playoffEntry">,
  {
    playoffPhaseActive,
    leagueId,
    managerId,
  }: { playoffPhaseActive: boolean; leagueId: string; managerId: string },
): Promise<boolean> {
  if (!playoffPhaseActive) return true;
  const entry = await db.playoffEntry.findUnique({
    where: { leagueId_managerId: { leagueId, managerId } },
    select: { status: true },
  });
  return entry?.status === "alive";
}

/**
 * The SET of league managers who are OUT OF CONTENTION for DISPLAY (the /vsfield live-field hide + the
 * /waivers budgets-rail strike) — the data-existence eliminated predicate applied league-wide. A manager is
 * eliminated iff the playoff phase is active AND they do NOT hold a SURVIVOR playoff_entry
 * (`status IN ('alive','champion')`), which is the ONLY correct "out" signal because it catches BOTH:
 *   - group-phase NON-ADVANCERS — they have NO playoff_entry row at all (status is NULL, never the string
 *     'eliminated'), so a `status = 'eliminated'` read silently misses them; and
 *   - managers guillotined DURING the playoffs — status flipped to 'eliminated'.
 * Survivors (`status='alive'`, plus the terminal `status='champion'`) are the only managers left OUT of the
 * returned set.
 *
 * `champion` is alive-equivalent HERE because it is the terminal form of "survived": the tournament winner
 * must not be struck (waivers) or hidden (vsfield). This is a DISPLAY concern ONLY and deliberately DIVERGES
 * from {@link loadIsPlayoffParticipant} and the FAAB ENFORCEMENT / roster-cap predicates, which stay strictly
 * `status === 'alive'` — a SEPARATE axis, left untouched (enforcement is moot post-tournament anyway).
 * Folding champion in also CLOSES the sub-60s Final-advance-before-tick window: after the manual
 * `commish:advance --round Final --apply` crowns the champion (alive→champion) but BEFORE the ~60s worker
 * tick closes the Final period, `isLivePeriod` is still true; with a strict `alive`-only set that window has
 * ZERO survivors and `filterEliminatedFromField` would blank the whole leaderboard. With champion counted in,
 * the winner remains and the field is never emptied.
 *
 * PHASE-GATED to EMPTY during the group phase: before the group→playoff transition there are ZERO survivor
 * rows, so a naive "not a survivor" derivation would mark EVERYONE eliminated and blank the whole live field /
 * budgets rail. Gating on {@link loadPlayoffPhaseActive} (ANY playoff_entry row exists) returns an empty set
 * until the transition fires — nobody is struck/hidden during group play. Both /vsfield (hide) and /waivers
 * (strike) call THIS one helper so the two surfaces cannot drift apart again.
 */
export async function loadEliminatedManagerIds(
  db: Pick<Db, "playoffEntry" | "manager">,
  leagueId: string,
): Promise<Set<string>> {
  if (!(await loadPlayoffPhaseActive(db, leagueId))) return new Set();
  const [managers, survivorEntries] = await Promise.all([
    db.manager.findMany({ where: { leagueId }, select: { id: true } }),
    // `champion` is alive-equivalent for DISPLAY — the terminal form of "survived" (see doc above). This is
    // NOT the enforcement/participant axis (loadIsPlayoffParticipant stays `alive`-only) — do not unify them.
    db.playoffEntry.findMany({
      where: { leagueId, status: { in: ["alive", "champion"] } },
      select: { managerId: true },
    }),
  ]);
  const survivorIds = new Set(survivorEntries.map((e) => e.managerId));
  return new Set(managers.filter((m) => !survivorIds.has(m.id)).map((m) => m.id));
}

/**
 * Thrown by the MANAGER release path's fail-loud slot-coverage guard: a dropped player was left with a
 * still-locked lineup slot, meaning the lock set the validator used was stale (TOCTOU — the slot locked
 * between validation and commit). The whole release transaction is rolled back rather than leaving a locked
 * starter attached to a dropped player. The commissioner `allowLocked` path can release the locked slot.
 */
export class ReleaseStaleLockError extends Error {
  constructor(public readonly playerIds: string[]) {
    super(
      `release aborted: drop target(s) ${playerIds.join(", ")} still hold a locked lineup slot — the lock state was stale (use the commissioner --allow-locked-slot path to release a played player)`,
    );
    this.name = "ReleaseStaleLockError";
  }
}

export function createPrismaFaabReleaseStore(prisma: Db): FaabReleaseStore {
  return {
    async loadReleaseContext(managerId): Promise<ReleaseContext | null> {
      const manager = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      if (!manager) return null;
      const { leagueId } = manager;
      // Phase from playoff_entry EXISTENCE (the data-existence contract), never league.status. Computed once
      // and fed to the cap, the trim-window period hint, and the participant gate. (Atomic twin of
      // status='playoff'; NOT selectTournamentPhase, which mis-reads the R32 pre-kickoff trim window.)
      const isPlayoffPhase = await loadPlayoffPhaseActive(prisma, leagueId);

      const rosterRows = await prisma.rosterPlayer.findMany({
        where: { managerId, droppedAt: null },
        select: { playerId: true, player: { select: { position: true } } },
      });
      const roster = rosterRows.map((r) => ({ playerId: r.playerId, position: r.player.position }));

      // Locked-by-play set (lineup_slot.locked_at in a still-open matchday). ∅ in the R32 pre-kickoff
      // trim window — every survivor droppable; once an R32 player has played he is in the set and locked.
      const lockedPlayerIds = await findLockedSlotPlayerIds(prisma, {
        managerId,
        playerIds: roster.map((p) => p.playerId),
      });

      // The current trim window = the earliest still-open knockout period (R32). Best-effort hint passed to
      // releaseRoster to scope a commissioner locked-slot release; null falls back to non-closed-period scope.
      const currentPeriod = isPlayoffPhase
        ? await prisma.period.findFirst({
            where: { leagueId, kind: "knockout_round", status: { not: "closed" } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;

      const isPlayoffParticipant = await loadIsPlayoffParticipant(prisma, {
        playoffPhaseActive: isPlayoffPhase,
        leagueId,
        managerId,
      });

      return {
        leagueId,
        roster,
        rosterCap: rosterCapForPlayoffPhase(isPlayoffPhase),
        lockedPlayerIds,
        isPlayoffPhase,
        isPlayoffParticipant,
        currentPeriodId: currentPeriod?.id ?? null,
      };
    },

    async releaseRoster(managerId, dropIds, { now, periodId, allowLocked }) {
      const drops = [...new Set(dropIds)];
      if (drops.length === 0) return { releasedSlots: 0 };

      return prisma.$transaction(async (tx) => {
        // Commissioner carve-out: a TRANSACTION-LOCAL GUC the lock-on-play DELETE trigger reads + exempts.
        // Set ONLY for an --allow-locked-slot release; the manager path never sets it, so the latch holds.
        if (allowLocked) await tx.$executeRawUnsafe("SET LOCAL app.commish_override = 'on'");

        const manager = await tx.manager.findUnique({
          where: { id: managerId },
          select: { leagueId: true },
        });
        if (!manager) throw new Error(`releaseRoster: unknown manager ${managerId}`);
        const { leagueId } = manager;

        // (1) Drop the named players (active rows only — a re-run finds 0 and is a no-op).
        await tx.rosterPlayer.updateMany({
          where: { leagueId, managerId, playerId: { in: drops }, droppedAt: null },
          data: { droppedAt: now },
        });

        // (2) Release each drop's lineup slots so a dropped starter stops scoring.
        let releasedSlots = 0;
        for (const playerId of drops) {
          // Always release the UNLOCKED slots (the @app/lineup boundary — faab never touches lineup_slot).
          releasedSlots += await releaseDroppedPlayerSlots(tx, { leagueId, managerId, playerId });
          if (allowLocked) {
            // Commissioner: also release the player's CURRENTLY-locked slot (a played starter) in the
            // trim window. Scoped to the pinned period when known, else any still-open period — never the
            // historical (closed-period) locked slots scoring still reads. The GUC exempts the trigger.
            const periodFilter =
              periodId != null
                ? { id: periodId }
                : { leagueId, status: { not: "closed" as const } };
            const { count } = await tx.lineupSlot.deleteMany({
              where: { managerId, playerId, lockedAt: { not: null }, period: periodFilter },
            });
            releasedSlots += count;
          }
        }

        // (3) FAIL-LOUD slot-coverage guard (manager path): the released-slot set must cover every slotted
        //     drop. If any drop is still locked in an open period, the injected lock set was stale (TOCTOU)
        //     — abort rather than silently leave a locked starter attached to a dropped player.
        if (!allowLocked) {
          const stillLocked = await findLockedSlotPlayerIds(tx, { managerId, playerIds: drops });
          if (stillLocked.size > 0) throw new ReleaseStaleLockError([...stillLocked]);
        }

        return { releasedSlots };
      });
    },

    async listOverCapPlayoffSurvivors(leagueId): Promise<OverCapSurvivor[]> {
      // P3: the playoff-phase gate + cap derive from playoff_entry EXISTENCE, never league.status.
      const playoffPhaseActive = await loadPlayoffPhaseActive(prisma, leagueId);
      if (!playoffPhaseActive) return [];
      const cap = rosterCapForPlayoffPhase(playoffPhaseActive);

      const alive = await prisma.playoffEntry.findMany({
        where: { leagueId, status: "alive" },
        select: { managerId: true },
      });
      if (alive.length === 0) return [];

      const counts = await prisma.rosterPlayer.groupBy({
        by: ["managerId"],
        where: { leagueId, droppedAt: null, managerId: { in: alive.map((a) => a.managerId) } },
        _count: { _all: true },
      });
      return counts
        .filter((c) => c._count._all > cap)
        .map((c) => ({ managerId: c.managerId, rosterCount: c._count._all, rosterCap: cap }));
    },
  };
}
