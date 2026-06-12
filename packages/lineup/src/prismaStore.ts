/**
 * Prisma-backed {@link LineupStore} — the production IO adapter, and the ONLY file in the package that
 * touches the database (the pure `validateLineup` + the controller carry no DB dependency). It is
 * reachable only via `@app/lineup/prisma`, keeping the package's `.` surface IO-free.
 *
 * {@link LineupStore.saveLineup} is the one transactional method. The full per-period slot set is
 * written in ONE `$transaction`, with the lock latch re-checked TWICE for defence in depth:
 *   1. application re-check — refuse the whole commit (no write) if a `locked_at IS NOT NULL` row would
 *      have its `is_starter` flipped (the server is authoritative even if the client lies);
 *   2. every UPDATE is guarded on `locked_at: null`, so the DB trigger `enforce_lineup_lock()` (which
 *      RAISEs on any edit to a locked row) can never fire — a row that locked mid-write simply matches
 *      zero rows and is left frozen.
 *
 * Like @app/draft's adapter this has no unit test (it needs a live DB); it is covered by `tsc --noEmit`
 * plus the Memory double's tests, which exercise the same controller against the same port.
 */
import type { PrismaClient } from "@app/db";
import type { LineupCommit, LineupContext, LineupStore, SaveOutcome } from "./store";

// FAAB-drop ↔ lineup reconciliation lives in @app/lineup (the owner of lineup_slot), re-exported on the
// `@app/lineup/prisma` surface so the FAAB batch consumes it without touching the table itself.
export { releaseDroppedPlayerSlots, findLockedSlotPlayerIds } from "./slotRelease";
export type { LineupSlotClient } from "./slotRelease";

/** Minimal client surface this store needs (the singleton from `@app/db` satisfies it). */
type Db = PrismaClient;

export function createPrismaLineupStore(prisma: Db): LineupStore {
  return {
    async loadLineupContext(managerId, periodId): Promise<LineupContext | null> {
      const manager = await prisma.manager.findUnique({
        where: { id: managerId },
        select: { leagueId: true },
      });
      if (!manager) return null;

      const [rosterRows, slotRows, periodRow] = await Promise.all([
        // The active 15-man squad: roster_player rows still owned (dropped_at IS NULL), with position.
        prisma.rosterPlayer.findMany({
          where: { managerId, droppedAt: null },
          select: { player: { select: { id: true, position: true } } },
        }),
        prisma.lineupSlot.findMany({
          where: { managerId, periodId },
          select: { playerId: true, isStarter: true, voidedAt: true },
        }),
        prisma.period.findUnique({
          where: { id: periodId },
          select: { id: true, leagueId: true, status: true, closesAt: true },
        }),
      ]);

      // "Has played" is the SINGLE authoritative source (DECISIONS Theme B forfeit model): a
      // score_player_match row exists for (player, his match in THIS period). NOT locked_at — locked_at is
      // retired from movability. A player plays at most one match per period (his team's fixture).
      const slotPlayerIds = slotRows.map((s) => s.playerId);
      const playedRows =
        slotPlayerIds.length > 0
          ? await prisma.scorePlayerMatch.findMany({
              where: { playerId: { in: slotPlayerIds }, match: { periodId } },
              select: { playerId: true },
            })
          : [];
      const playedSet = new Set(playedRows.map((r) => r.playerId));

      return {
        leagueId: manager.leagueId,
        squad: rosterRows.map((r) => ({ playerId: r.player.id, position: r.player.position })),
        slots: slotRows.map((s) => ({
          playerId: s.playerId,
          isStarter: s.isStarter,
          hasPlayed: playedSet.has(s.playerId), // authoritative: a score_player_match row exists
          voided: s.voidedAt !== null, // the one-way forfeit latch
        })),
        period:
          periodRow && periodRow.leagueId === manager.leagueId
            ? { id: periodRow.id, status: periodRow.status, closesAt: periodRow.closesAt }
            : null,
      };
    },

    async saveLineup(commit: LineupCommit): Promise<SaveOutcome> {
      const override = commit.allowLockedSlot === true;
      const voidSet = new Set(commit.voidPlayerIds);
      return prisma.$transaction(async (tx) => {
        // Commissioner carve-out: a TRANSACTION-LOCAL GUC the lock-on-play trigger reads + exempts. Set
        // ONLY for an --allow-locked-slot override; the normal path never sets it, so the DB latch holds.
        if (override) await tx.$executeRawUnsafe("SET LOCAL app.commish_override = 'on'");

        const current = await tx.lineupSlot.findMany({
          where: { managerId: commit.managerId, periodId: commit.periodId },
          select: { playerId: true, isStarter: true, lockedAt: true },
        });
        const cur = new Map(current.map((r) => [r.playerId, r]));

        // (1) Latch re-check (server-authoritative): refuse the WHOLE commit if a locked slot would
        //     change its is_starter — EXCEPT the sanctioned forfeit transition (a played starter benched
        //     AND voided this save, in the void set). Checked before any write — no partial save. Skipped
        //     under the commissioner override (the deliberate move of a played player).
        if (!override) {
          for (const d of commit.desired) {
            const c = cur.get(d.playerId);
            if (!c || c.lockedAt === null || c.isStarter === d.isStarter) continue;
            const isForfeit = voidSet.has(d.playerId) && c.isStarter && !d.isStarter;
            if (!isForfeit) {
              return { ok: false, conflict: { playerId: d.playerId, isStarter: c.isStarter } };
            }
          }
        }

        // TODO(prompt-NN: FAAB add/drop) — reconcile DELETEs. `commit.desired` is the CURRENT active
        // squad (loadLineupContext reads roster_player WHERE dropped_at IS NULL), so a slot for a player
        // later dropped from the roster is never in `desired` and would be left as a STALE ORPHAN — and
        // recompute reads lineup_slot by (manager, period) with no roster join, so a stale STARTER would
        // still score. When the drop path ships: in this same tx, deleteMany the current rows whose
        // playerId is absent from `desired` AND lockedAt IS NULL (the guard keeps the trigger quiet; a
        // locked orphan is a separate case — forbid dropping a player who already has a locked slot).
        // BENIGN NOW: through the group stage the squad is fixed at 15 (dropped_at always NULL), so no
        // orphan can be produced — there is no add/drop write path yet.

        // (2) Apply: a FORFEIT target is benched AND stamped voided_at in one UPDATE — the only way a
        //     locked row's is_starter changes (the extended trigger permits exactly this transition; no
        //     `lockedAt: null` guard, since the row IS locked). Otherwise: insert missing slots (born
        //     unlocked/unvoided) and overwrite changed unlocked slots. locked_at itself is never written.
        for (const d of commit.desired) {
          const c = cur.get(d.playerId);
          if (!c) {
            await tx.lineupSlot.create({
              data: {
                managerId: commit.managerId,
                periodId: commit.periodId,
                playerId: d.playerId,
                role: d.role,
                isStarter: d.isStarter,
              },
            });
          } else if (voidSet.has(d.playerId)) {
            // The forfeit: bench + stamp voided_at (one-way). Idempotency-guarded on voidedAt: null so a
            // re-run can't re-stamp (the trigger also forbids re-voiding).
            await tx.lineupSlot.updateMany({
              where: {
                managerId: commit.managerId,
                periodId: commit.periodId,
                playerId: d.playerId,
                voidedAt: null,
              },
              data: { isStarter: false, voidedAt: commit.now },
            });
          } else if (c.isStarter !== d.isStarter && (override || c.lockedAt === null)) {
            await tx.lineupSlot.updateMany({
              where: {
                managerId: commit.managerId,
                periodId: commit.periodId,
                playerId: d.playerId,
                ...(override ? {} : { lockedAt: null }),
              },
              data: { isStarter: d.isStarter },
            });
          }
        }

        // (3) A forfeit changes who counts toward the manager-period score → enqueue a restate in the SAME
        //     transaction (deduped, mirroring @app/recompute's enqueueManagerPeriodDirty so @app/lineup
        //     stays free of an @app/recompute dependency). No forfeit → no enqueue (the unchanged path).
        if (voidSet.size > 0) {
          const existing = await tx.recomputeDirty.findFirst({
            where: {
              scope: "manager_period",
              managerId: commit.managerId,
              periodId: commit.periodId,
              processedAt: null,
            },
            select: { id: true },
          });
          if (!existing) {
            await tx.recomputeDirty.create({
              data: {
                scope: "manager_period",
                managerId: commit.managerId,
                periodId: commit.periodId,
              },
            });
          }
        }
        return { ok: true };
      });
    },
  };
}
