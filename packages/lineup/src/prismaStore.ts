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
          select: { playerId: true, isStarter: true, lockedAt: true },
        }),
        prisma.period.findUnique({
          where: { id: periodId },
          select: { id: true, leagueId: true, status: true, closesAt: true },
        }),
      ]);

      return {
        leagueId: manager.leagueId,
        squad: rosterRows.map((r) => ({ playerId: r.player.id, position: r.player.position })),
        slots: slotRows.map((s) => ({
          playerId: s.playerId,
          isStarter: s.isStarter,
          locked: s.lockedAt !== null, // the lock-on-play latch
        })),
        period:
          periodRow && periodRow.leagueId === manager.leagueId
            ? { id: periodRow.id, status: periodRow.status, closesAt: periodRow.closesAt }
            : null,
      };
    },

    async saveLineup(commit: LineupCommit): Promise<SaveOutcome> {
      const override = commit.allowLockedSlot === true;
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
        //     change its is_starter. Checked before any write — no partial save. Skipped under the
        //     commissioner override (the deliberate move of a played player).
        if (!override) {
          for (const d of commit.desired) {
            const c = cur.get(d.playerId);
            if (c && c.lockedAt !== null && c.isStarter !== d.isStarter) {
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

        // (2) Apply: insert missing slots (born unlocked) and overwrite changed slots. On the normal path
        //     a locked row is left frozen (the `lockedAt: null` guard means a row that locked mid-write
        //     matches zero rows); under the override a locked row is updated too — the GUC set above lets
        //     the DB trigger pass. locked_at itself is never written, so the latch instant is preserved.
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
        return { ok: true };
      });
    },
  };
}
