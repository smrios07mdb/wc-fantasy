/**
 * Lineup-domain IO that the FAAB batch needs but must NOT reach into directly — the `lineup_slot` model
 * is owned here, so faab calls these exported functions instead of touching the table. Both take a
 * Prisma client/transaction client (so the release runs INSIDE faab's commit transaction, keeping
 * scoring's starting-lineup source consistent with the drop). Reachable via `@app/lineup/prisma`.
 *
 * No unit test for the SQL adapters elsewhere in this package, but these two carry real domain rules
 * (release only UNLOCKED slots; "locked" = a played slot in a still-open matchday), so `slotRelease.test`
 * pins them against a fake client.
 */
import type { Prisma } from "@app/db";

/** A Prisma client OR `$transaction` client — both expose the `lineupSlot` delegate this module uses. */
export type LineupSlotClient = Prisma.TransactionClient;

/**
 * Release (delete) a dropped player's UNLOCKED `lineup_slot` rows for a manager, within `tx`. A
 * locked (already-played, `locked_at IS NOT NULL`) slot is historical and left intact — scoring still
 * reads it. Scoped to the league via the period relation. Returns the number of slots released.
 *
 * This is the single home for the FAAB-drop ↔ lineup reconciliation flagged in this package's
 * `prismaStore` (a dropped starter must stop scoring): faab's `commitBatch` calls it in the same
 * transaction as the roster drop.
 */
export async function releaseDroppedPlayerSlots(
  tx: LineupSlotClient,
  { leagueId, managerId, playerId }: { leagueId: string; managerId: string; playerId: string },
): Promise<number> {
  const { count } = await tx.lineupSlot.deleteMany({
    where: { managerId, playerId, lockedAt: null, period: { leagueId } },
  });
  return count;
}

/**
 * Of `playerIds`, return those the manager has LOCKED in a still-active matchday — i.e. a `lineup_slot`
 * with `locked_at IS NOT NULL` whose period is not yet `closed`. A locked-in-an-open-matchday player
 * cannot be dropped (he has played this matchday); once the matchday closes, the lock is historical and
 * he is droppable again. This is the lock-on-play seam (`lineup_slot.locked_at`) — no second clock.
 */
export async function findLockedSlotPlayerIds(
  client: LineupSlotClient,
  { managerId, playerIds }: { managerId: string; playerIds: readonly string[] },
): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();
  const rows = await client.lineupSlot.findMany({
    where: {
      managerId,
      playerId: { in: [...playerIds] },
      lockedAt: { not: null },
      period: { status: { not: "closed" } },
    },
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}
