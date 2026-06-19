/**
 * LIVE-UNOWNED free-agent eligibility — the ONE rule (DECISIONS §D, commissioner decision Jun 18 2026).
 *
 * A player is a free agent the moment he holds NO active roster row (`dropped_at IS NULL`) in the league —
 * including a player dropped by a winning waiver bid AND a player dropped mid-window — regardless of any
 * earlier dropped rows. This SUPERSEDES the Prompt-48 batch-clear snapshot and its anti-snipe hold (the
 * retired `OR dropped_at >= batch_cleared_at` term, which held a freshly-dropped player back to the next
 * batch). The sealed→free-agency WINDOW phase (`acquisitionWindowState`) is a SEPARATE gate, unchanged.
 *
 * PURE + IO-free (proven by `purity.test.ts`): the SQL realization {@link liveOwnedWhere} (a `roster_player`
 * WHERE the Prisma adapter counts against) and the in-memory twin {@link isLiveUnowned} share this one
 * definition, so the offered pool, the per-player re-check, and the grant can never silently drift.
 */

/** A `roster_player` ownership row reduced to what the eligibility rule reads. */
export interface OwnershipRow {
  leagueId: string;
  playerId: string;
  /** When this ownership ended; `null` ⇒ the row is ACTIVE (currently rostered). */
  droppedAt: Date | null;
}

/**
 * The `roster_player` WHERE that matches a NON-free-agent under live-unowned: an ACTIVE ownership row
 * (`dropped_at IS NULL`), optionally scoped to one player. The SINGLE predicate the Prisma adapter counts
 * against in `listFaIneligiblePlayerIds` (the waivers pool), `getFaTargetFacts` (the per-player re-check),
 * and `claimFreeAgent` (the grant re-check) — so the list the UI shows and the grant the route accepts
 * can never drift. No `OR` / `gte` term: the batch-clear snapshot is retired.
 */
export function liveOwnedWhere(leagueId: string, playerId?: string) {
  return {
    leagueId,
    ...(playerId ? { playerId } : {}),
    droppedAt: null,
  };
}

/**
 * The in-memory twin of {@link liveOwnedWhere}: a player is live-unowned (a free agent) iff NO row in
 * `rows` is an active ownership of him in `leagueId`. Equivalent to
 * `COUNT(liveOwnedWhere(leagueId, playerId)) === 0` — the store's eligibility test, expressed as data so
 * it is unit-testable with literals.
 */
export function isLiveUnowned(
  rows: ReadonlyArray<OwnershipRow>,
  leagueId: string,
  playerId: string,
): boolean {
  return !rows.some(
    (r) => r.leagueId === leagueId && r.playerId === playerId && r.droppedAt === null,
  );
}
