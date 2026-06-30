/**
 * Prisma-backed {@link WatchlistStore} — the production IO adapter for the watchlist toggle, and the ONLY
 * watchlist write file that touches the database. Like the project's other Prisma-backed store adapters it
 * has no unit test (it needs a live DB); it is covered by `tsc --noEmit`, the route-contract handler tests
 * against the Memory double, and the gated RLS integration suite (watchlistRls.integration.test.ts).
 *
 * The session manager carries no league_id, so {@link setWatched} resolves it SERVER-SIDE by managerId
 * (the row needs a denormalized league_id, mirroring pool_pick / the other per-manager tables). Writes run
 * as the Prisma OWNER role, which bypasses RLS; the owner-only policies in 20260630120000_watchlist are the
 * defence-in-depth backstop for any future JWT-scoped read.
 */
import type { PrismaClient } from "@app/db";
import type { WatchlistStore } from "./handleWatchlist";

type Db = PrismaClient;

export function createPrismaWatchlistStore(prisma: Db): WatchlistStore {
  return {
    async setWatched(managerId, playerId) {
      // Resolve the row's league_id from the SESSION manager id (never a client-supplied value).
      const manager = await prisma.manager.findUniqueOrThrow({
        where: { id: managerId },
        select: { leagueId: true },
      });
      // Idempotent: a duplicate star is a no-op (the watchlist_manager_player_uq unique key).
      await prisma.watchlist.upsert({
        where: { managerId_playerId: { managerId, playerId } },
        create: { leagueId: manager.leagueId, managerId, playerId },
        update: {},
      });
    },
    async clearWatched(managerId, playerId) {
      // deleteMany so a missing row is a no-op (idempotent unstar); delete() would throw P2025.
      await prisma.watchlist.deleteMany({ where: { managerId, playerId } });
    },
  };
}
