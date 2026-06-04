/**
 * Prisma-backed {@link DraftStore} — the production IO adapter, and the ONLY file in the package that
 * touches the database (the pure snake/legality/autopick logic + the controller carry no DB
 * dependency). It is reachable only via `@app/draft/prisma`, keeping the package's `.` surface IO-free.
 *
 * {@link DraftStore.commitPick} is the one transactional method: the guarded advance + the pick row +
 * the ownership row are ONE `$transaction`. The advance is a monotonic latch (`WHERE current_pick_no =
 * pickNo AND status = active`) so a stale/duplicate commit writes nothing; the `draft_pick` unique on
 * (draft_id, pick_no) and the `roster_player` active-ownership partial-unique are the DB backstops —
 * a constraint trip (P2002) rolls the whole transaction back and surfaces as a clean `false` (no-op).
 *
 * Like @app/scrape's adapter this has no unit test (it needs a live DB); it is covered by `tsc
 * --noEmit` plus the Memory double's tests, which exercise the same controller against the same port.
 */
import { Prisma, type PrismaClient } from "@app/db";
import type { Position } from "@app/shared";
import type { QueueEntry, RankedPlayer } from "./autopick";
import type { PositionCounts } from "./roster";
import type { DraftInit, DraftSnapshot, DraftStore, PickCommit } from "./store";

/** Minimal client surface this store needs (the singleton from `@app/db` satisfies it). */
type Db = PrismaClient;

export function createPrismaDraftStore(prisma: Db): DraftStore {
  return {
    async loadDraft(draftId): Promise<DraftSnapshot | null> {
      const d = await prisma.draft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          leagueId: true,
          status: true,
          currentPickNo: true,
          currentManagerId: true,
          pickDeadlineAt: true,
          league: { select: { draftPickSeconds: true } },
        },
      });
      if (!d) return null;
      // Snake seed: managers with a draft_slot, slot-ascending (the per-pick→manager map is derived).
      const managers = await prisma.manager.findMany({
        where: { leagueId: d.leagueId, draftSlot: { not: null } },
        orderBy: { draftSlot: "asc" },
        select: { id: true },
      });
      return {
        draftId: d.id,
        leagueId: d.leagueId,
        status: d.status,
        currentPickNo: d.currentPickNo,
        currentManagerId: d.currentManagerId,
        pickDeadlineAt: d.pickDeadlineAt,
        draftPickSeconds: d.league.draftPickSeconds,
        orderedManagerIds: managers.map((m) => m.id),
      };
    },

    async getPlayerPosition(playerId): Promise<Position | null> {
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { position: true },
      });
      return p ? p.position : null;
    },

    async getRosterCounts(managerId): Promise<PositionCounts> {
      const rows = await prisma.rosterPlayer.findMany({
        where: { managerId, droppedAt: null },
        select: { player: { select: { position: true } } },
      });
      const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const r of rows) counts[r.player.position] += 1;
      return counts;
    },

    async listOwnedPlayerIds(leagueId): Promise<ReadonlySet<string>> {
      const rows = await prisma.rosterPlayer.findMany({
        where: { leagueId, droppedAt: null },
        select: { playerId: true },
      });
      return new Set(rows.map((r) => r.playerId));
    },

    async getQueue(managerId): Promise<QueueEntry[]> {
      const rows = await prisma.draftQueue.findMany({
        where: { managerId },
        orderBy: { position: "asc" },
        select: { playerId: true, player: { select: { position: true } } },
      });
      return rows.map((r) => ({ playerId: r.playerId, position: r.player.position }));
    },

    getDefaultRanking(_leagueId): Promise<RankedPlayer[]> {
      // SEAM — TODO(confirm): the real default-ranking SOURCE for "best available". The brain files
      // name "best-available by default ranking" but define no source, and no `player.default_rank`
      // column exists. A real ordering (a seeded rank column or a commissioner-provided list) is a
      // follow-up; until then this returns [] (no fabricated ranking — alphabetical / balldontlie-id
      // order would masquerade as a ranking), so autopick relies on each manager's queue.
      return Promise.resolve([]);
    },

    async commitPick(commit: PickCommit): Promise<boolean> {
      try {
        return await prisma.$transaction(async (tx) => {
          // Guarded advance FIRST (monotonic latch): only proceeds while the draft is still on this
          // exact pick. A lost guard writes nothing and the transaction commits a clean no-op.
          const advanced = await tx.draft.updateMany({
            where: { id: commit.draftId, status: "active", currentPickNo: commit.pickNo },
            data:
              commit.advance.kind === "complete"
                ? {
                    status: "complete",
                    currentPickNo: null,
                    currentManagerId: null,
                    pickDeadlineAt: null,
                  }
                : {
                    currentPickNo: commit.advance.nextPickNo,
                    currentManagerId: commit.advance.nextManagerId,
                    pickDeadlineAt: commit.advance.pickDeadlineAt,
                  },
          });
          if (advanced.count !== 1) return false;

          // Write the pick (unique on draft_id, pick_no) + ownership (active-ownership partial-unique).
          // If either trips (a concurrent double-pick), the throw rolls back the advance too — atomic.
          await tx.draftPick.create({
            data: {
              draftId: commit.draftId,
              pickNo: commit.pickNo,
              managerId: commit.managerId,
              playerId: commit.playerId,
              isAuto: commit.isAuto,
              madeAt: commit.madeAt,
            },
          });
          await tx.rosterPlayer.create({
            data: {
              leagueId: commit.leagueId,
              managerId: commit.managerId,
              playerId: commit.playerId,
              acquiredAt: commit.madeAt,
            },
          });
          return true;
        });
      } catch (e) {
        // A unique-constraint violation (the DB backstop) is a clean rejection, not a duplicate write.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
        throw e;
      }
    },

    async initDraft(draftId, init: DraftInit): Promise<boolean> {
      // Guarded start (idempotent): only a `pending` draft transitions to `active`.
      const res = await prisma.draft.updateMany({
        where: { id: draftId, status: "pending" },
        data: {
          status: "active",
          currentPickNo: init.currentPickNo,
          currentManagerId: init.currentManagerId,
          pickDeadlineAt: init.pickDeadlineAt,
        },
      });
      return res.count === 1;
    },

    async listActiveDraftIds(): Promise<string[]> {
      const rows = await prisma.draft.findMany({
        where: { status: "active" },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },
  };
}
