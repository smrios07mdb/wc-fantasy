/**
 * The store-backed set-lineup controller — `setLineup` mirrors `@app/draft`'s `submitPick`: it is async
 * but pure with respect to IO (it only calls the {@link LineupStore} port and the injected `now`; it
 * never touches Prisma / Supabase / the wall clock). It loads the AUTHORITATIVE context (squad, current
 * slots → lock state, the period window), runs the pure {@link validateLineup}, and only then commits.
 *
 * This is where the server-authoritative lock lives: the lock state fed to `validateLineup` comes from
 * the store (the real `lineup_slot.locked_at` rows), NOT from the client — so a client that lies about
 * what's movable is still rejected. `saveLineup` re-checks the latch once more at write time. There is
 * NO partial write: every rejection returns before `saveLineup`, and `saveLineup` itself is all-or-none.
 */
import { validateLineup, type SlotState } from "./validate";
import { type LineupError, wrongPeriod, lockedPlayerMoved } from "./errors";
import type { DesiredSlot, LineupStore } from "./store";

export interface SetLineupInput {
  managerId: string;
  periodId: string;
  /** The player ids chosen to START; the rest of the squad becomes the bench. */
  starterIds: readonly string[];
  /** Player ids the caller has explicitly confirmed FORFEITING (benching after they played). Benching a
   *  played starter is one-way + final, so the controller refuses it unless the player is confirmed here.
   *  The C1 route never sets this (the current UI sends no confirm) → benching a played starter is
   *  rejected, preserving today's affordance; C2's destructive-confirm UI populates it. */
  forfeitConfirmedPlayerIds?: readonly string[];
}

export type SetLineupResult = { ok: true } | { ok: false; error: LineupError };

export async function setLineup(
  store: LineupStore,
  input: SetLineupInput,
  now: Date,
): Promise<SetLineupResult> {
  const ctx = await store.loadLineupContext(input.managerId, input.periodId);
  // Unknown manager (shouldn't happen post-auth) or unknown period → not an editable target.
  if (!ctx || !ctx.period) return { ok: false, error: wrongPeriod("unknown") };

  // Authoritative play state: each slot's current role + whether the player has played + been voided
  // (server truth — the client can't be trusted with the forfeit / hindsight rules).
  const slotStates: SlotState[] = ctx.slots.map((s) => ({
    playerId: s.playerId,
    isStarter: s.isStarter,
    hasPlayed: s.hasPlayed,
    voided: s.voided,
  }));
  const forfeitConfirmed = new Set(input.forfeitConfirmedPlayerIds ?? []);

  const verdict = validateLineup(
    ctx.squad,
    input.starterIds,
    slotStates,
    ctx.period,
    now,
    forfeitConfirmed,
  );
  if (!verdict.ok) return { ok: false, error: verdict.error };

  // Write the FULL squad as slots: the chosen XI as starters, everyone else as bench.
  const starters = new Set(input.starterIds);
  const desired: DesiredSlot[] = ctx.squad.map((p) => ({
    playerId: p.playerId,
    role: p.position,
    isStarter: starters.has(p.playerId),
  }));

  // The forfeits to stamp: confirmed players who PLAYED, are CURRENTLY starters, and are now benched.
  // (Validation already proved each is legal; this is the subset whose `voided_at` the store must set.)
  const voidPlayerIds = slotStates
    .filter(
      (s) =>
        s.hasPlayed && s.isStarter && !starters.has(s.playerId) && forfeitConfirmed.has(s.playerId),
    )
    .map((s) => s.playerId);

  const outcome = await store.saveLineup({
    managerId: input.managerId,
    periodId: input.periodId,
    desired,
    voidPlayerIds,
    now,
  });
  if (!outcome.ok) {
    // A slot locked between the read and the write — surface it as a lock move (server-authoritative).
    return {
      ok: false,
      error: lockedPlayerMoved(
        outcome.conflict.playerId,
        outcome.conflict.isStarter ? "starter" : "bench",
      ),
    };
  }
  return { ok: true };
}
