/**
 * Commissioner lineup override (`commish:lineup`) — set a team's starting XI after the lineup edit window
 * has closed. It BYPASSES the edit-window lock (via {@link relaxPeriodLock}) and, ONLY with the explicit
 * `--allow-locked-slot` flag, the lock-on-play latch; it reuses the REAL `@app/lineup` validation/service
 * for everything else, so formation/position legality, ownership, and the 11-distinct XI are ALWAYS kept:
 *   • `validateLineup(... relaxPeriodLock(period) ...)` skips ONLY the phase-1 window check; the injected
 *     `lockState` is emptied ONLY under `--allow-locked-slot`, so its phase-4 lock-on-play check is the one
 *     thing that flag relaxes (the ownership / 11-XI / formation phases are untouched);
 *   • `store.saveLineup(...)` writes the full slot set and re-checks the per-play latch — a played player
 *     stays frozen on the normal path (the DB trigger `enforce_lineup_lock()` is the ultimate backstop);
 *     under `--allow-locked-slot` the store skips that re-check and the trigger is exempted by a
 *     transaction-local `app.commish_override` GUC (set ONLY for that override, inside the write tx).
 *
 * In front stay the override guards: commissioner gate, required reason, idempotent skip, dry-run default,
 * and a structured audit line (`lockOverride` records the latch carve-out). Injected deps → testable
 * against `MemoryLineupStore`.
 */
import { validateLineup, type DesiredSlot, type LineupStore } from "@app/lineup";
import { formatAudit, isCommissionerActor, lineupEndStateHolds, relaxPeriodLock } from "./core";

export interface LineupDeps {
  now: Date;
  store: LineupStore;
  log: (line: string) => void;
}

export interface LineupInput {
  actor: { email: string | null; isCommissioner: boolean };
  managerId: string;
  teamLabel: string;
  periodId: string;
  periodLabel: string;
  starterIds: readonly string[];
  /** Display names for the chosen XI (plan + audit). */
  starterNames: readonly string[];
  reason: string;
  apply: boolean;
  /** Commissioner `--allow-locked-slot` carve-out (requires `--reason`; commissioner-gated): relax the
   *  lock-on-play latch so a played player can be moved. Formation/position/ownership/XI stay enforced.
   *  false ⇒ the latch holds (the default). */
  allowLockedSlot: boolean;
  timestamp: string;
}

export interface LineupPlan {
  team: string;
  managerId: string;
  periodLabel: string;
  /** Current starter ids (before) and the proposed starter ids (after). */
  before: string[];
  after: string[];
}

export type LineupResult =
  | { status: "refused"; reason: string }
  | { status: "not-found"; reason: string }
  | { status: "skipped"; reason: string; plan: LineupPlan }
  | { status: "planned"; plan: LineupPlan }
  | { status: "conflict"; reason: string; plan: LineupPlan }
  | { status: "applied"; plan: LineupPlan; audit: string };

export async function runLineupOverride(
  deps: LineupDeps,
  input: LineupInput,
): Promise<LineupResult> {
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — override refused" };
  }
  if (!input.reason.trim()) {
    return { status: "refused", reason: "a --reason is required for any override" };
  }

  const ctx = await deps.store.loadLineupContext(input.managerId, input.periodId);
  if (!ctx || !ctx.period) {
    return {
      status: "not-found",
      reason: `unknown manager/period (${input.managerId} / ${input.periodId})`,
    };
  }

  // Authoritative lock state from the store (server truth, not the caller) — keeps lock-on-play enforced,
  // UNLESS the commissioner passed --allow-locked-slot, which relaxes ONLY the played-player freeze: an
  // empty lock state makes validateLineup's phase-4 a no-op while formation/ownership/XI stay enforced.
  const lockState = input.allowLockedSlot
    ? []
    : ctx.slots
        .filter((s) => s.locked)
        .map((s) => ({ playerId: s.playerId, isStarter: s.isStarter }));

  // KEEP formation/position/ownership/XI/lock-on-play; bypass ONLY the edit-window lock.
  const verdict = validateLineup(
    ctx.squad,
    input.starterIds,
    lockState,
    relaxPeriodLock(ctx.period),
    deps.now,
  );
  if (!verdict.ok) {
    return { status: "refused", reason: `${verdict.error.code}: ${verdict.error.message}` };
  }

  const before = ctx.slots.filter((s) => s.isStarter).map((s) => s.playerId);
  const plan: LineupPlan = {
    team: input.teamLabel,
    managerId: input.managerId,
    periodLabel: input.periodLabel,
    before,
    after: [...input.starterIds],
  };

  if (lineupEndStateHolds({ currentStarterIds: before, desiredStarterIds: input.starterIds })) {
    return { status: "skipped", reason: "already in the desired lineup", plan };
  }

  if (!input.apply) return { status: "planned", plan };

  // Write the FULL squad: chosen XI as starters, everyone else benched (the service's commit shape).
  const starters = new Set(input.starterIds);
  const desired: DesiredSlot[] = ctx.squad.map((p) => ({
    playerId: p.playerId,
    role: p.position,
    isStarter: starters.has(p.playerId),
  }));

  const outcome = await deps.store.saveLineup({
    managerId: input.managerId,
    periodId: input.periodId,
    desired,
    allowLockedSlot: input.allowLockedSlot,
  });
  if (!outcome.ok) {
    return {
      status: "conflict",
      reason: `a locked-by-play slot would change (player ${outcome.conflict.playerId}) — not bypassable`,
      plan,
    };
  }

  const audit = formatAudit({
    command: "lineup",
    commissioner: input.actor.email ?? "(is_commissioner flag)",
    team: input.teamLabel,
    managerId: input.managerId,
    action: "set-lineup",
    starters: input.starterNames,
    reason: input.reason,
    kickoffBypassed: false,
    lockOverride: input.allowLockedSlot,
    timestamp: input.timestamp,
  });
  deps.log(audit);
  return { status: "applied", plan, audit };
}
