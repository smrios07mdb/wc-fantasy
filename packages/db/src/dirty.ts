/**
 * The `stat_player_match.dirty` re-dirty helper — ONE home for the no-clobber invariant used by
 * @app/ingest (05a). `sweep` Phase 1 (`claimDirtyPlayerMatches`) reads the raw `dirty` BOOLEAN, so a
 * match-level write (e.g. a late event) re-dirties the player through it. INSERT writes an all-null
 * stub (a player with no stat row yet — the adapter tolerates it); CONFLICT touches ONLY the flag
 * (`STAT_DIRTY_UPDATE`), so a late write never nulls out stats that already landed.
 */
import type { PrismaClient } from "@prisma/client";

export const STAT_DIRTY_UPDATE = { dirty: true } as const;

export async function markStatPlayerDirty(
  prisma: PrismaClient,
  matchId: string,
  playerId: string,
): Promise<void> {
  await prisma.statPlayerMatch.upsert({
    where: { matchId_playerId: { matchId, playerId } },
    create: { matchId, playerId, dirty: true },
    update: STAT_DIRTY_UPDATE,
  });
}
