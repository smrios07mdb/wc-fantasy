/**
 * Commissioner roster override (`commish:roster`) — repair an add/drop the app's (previously missing)
 * free-agency UI blocked. It BYPASSES the FA/waiver window (it never calls the window gate), but reuses
 * the real engine for everything correctness-critical:
 *   • the atomic drop + unlocked-slot-release + first-come INSERT (`claimFreeAgent` — the
 *     `roster_player_active_ownership_uq` guard, valid-drop, slot-release ALL kept), $0;
 *   • the roster cap + valid-drop rules (`validateFaGrant` with ONLY the window/eligibility gates
 *     neutralized — `windowState:"free-agency"`, `faEligible:true`, `dropLocked:false`).
 *
 * In front of the engine stay the override's own guards: the commissioner gate, a required reason, the
 * per-player kickoff integrity guard (default-block, `--allow-post-kickoff` honors it LOUDLY), an
 * idempotent skip, and dry-run-by-default (nothing applies without `apply`). Injected deps → testable.
 */
import { validateFaGrant, type FaGrantStore } from "@app/faab";
import type { Position } from "@app/shared";
import { formatAudit, isCommissionerActor, kickoffGuard, rosterEndStateHolds } from "./core";

export interface RosterDeps {
  now: Date;
  /** The FA grant store ports — the override calls the SAME `claimFreeAgent` the route uses. */
  store: Pick<
    FaGrantStore,
    "loadManagerFaContext" | "getFaTargetFacts" | "getDropFacts" | "claimFreeAgent"
  >;
  /** The add target's relevant fixture (per-player kickoff guard + audit); null if none upcoming. A
   *  `pinnedPeriodId` (commissioner `--period`) scopes it to the add's fixture IN that period, not his
   *  next upcoming one (which for an already-played player points at a not-yet-kicked-off later MD). */
  getAddMatch: (
    playerId: string,
    pinnedPeriodId: string | null,
  ) => Promise<{ label: string; kickoffAt: Date } | null>;
  log: (line: string) => void;
}

export interface RosterInput {
  actor: { email: string | null; isCommissioner: boolean };
  managerId: string;
  teamLabel: string;
  addId: string;
  addName: string;
  dropId: string | null;
  dropName: string | null;
  reason: string;
  apply: boolean;
  allowPostKickoff: boolean;
  /** Commissioner period pin (`--period`): the FA snapshot + the kickoff guard key off THIS period, not
   *  the add's next-fixture-inferred one (which for an already-played player resolves to a still-sealed
   *  later matchday → a wrong fa-conflict + a false "not yet kicked off"). null ⇒ next-fixture (default). */
  pinnedPeriodId: string | null;
  /** The pinned period's human label, recorded in the dry-run plan + the audit trail (null = unpinned). */
  pinnedPeriodLabel: string | null;
  /** Injected ISO timestamp for the audit line (no wall clock in the pure path). */
  timestamp: string;
}

export interface RosterPlan {
  team: string;
  managerId: string;
  add: string;
  drop: string | null;
  pinnedPeriod: string | null;
  addMatch: { label: string; kickoffAt: string } | null;
  alreadyPlayed: boolean;
  kickoffBypassed: boolean;
}

export type RosterResult =
  | { status: "refused"; reason: string; plan?: RosterPlan }
  | { status: "not-found"; reason: string }
  | { status: "skipped"; reason: string; plan: RosterPlan }
  | { status: "blocked"; reason: string; plan: RosterPlan }
  | { status: "planned"; plan: RosterPlan }
  | { status: "conflict"; reason: string; plan: RosterPlan }
  | { status: "applied"; plan: RosterPlan; audit: string };

export async function runRosterOverride(
  deps: RosterDeps,
  input: RosterInput,
): Promise<RosterResult> {
  // (0) The unconditional front guards: commissioner identity + a recorded reason.
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — override refused" };
  }
  if (!input.reason.trim()) {
    return { status: "refused", reason: "a --reason is required for any override" };
  }

  const ctx = await deps.store.loadManagerFaContext(input.managerId);
  if (!ctx) return { status: "not-found", reason: `unknown manager ${input.managerId}` };

  const addFacts = await deps.store.getFaTargetFacts(ctx.leagueId, input.addId);
  if (!addFacts) return { status: "not-found", reason: `unknown add player "${input.addName}"` };

  let dropPosition: Position | null = null;
  if (input.dropId !== null) {
    const dropFacts = await deps.store.getDropFacts(input.dropId);
    if (!dropFacts)
      return { status: "not-found", reason: `unknown drop player "${input.dropName}"` };
    dropPosition = dropFacts.position;
  }

  const addMatch = await deps.getAddMatch(input.addId, input.pinnedPeriodId);
  const guard = kickoffGuard({
    addMatchKickoffAt: addMatch?.kickoffAt ?? null,
    now: deps.now,
    allowPostKickoff: input.allowPostKickoff,
  });
  const plan: RosterPlan = {
    team: input.teamLabel,
    managerId: input.managerId,
    add: input.addName,
    drop: input.dropName,
    pinnedPeriod: input.pinnedPeriodLabel,
    addMatch: addMatch
      ? { label: addMatch.label, kickoffAt: addMatch.kickoffAt.toISOString() }
      : null,
    alreadyPlayed: guard.alreadyPlayed,
    kickoffBypassed: guard.alreadyPlayed && input.allowPostKickoff,
  };

  // (1) Idempotency: if the end state already holds, do nothing (safe to re-run).
  if (
    rosterEndStateHolds({
      ownedByManager: ctx.ownedByManager,
      addId: input.addId,
      dropId: input.dropId,
    })
  ) {
    return { status: "skipped", reason: "already in the desired end state", plan };
  }

  // (2) KEEP the roster cap + valid-drop by reusing `validateFaGrant`; ONLY the window + (live-unowned)
  //     eligibility + drop-lock gates are neutralized (the deliberate, commissioner-only bypass).
  const verr = validateFaGrant(
    {
      managerId: input.managerId,
      playerAddId: input.addId,
      addPosition: addFacts.position,
      playerDropId: input.dropId,
      dropPosition,
    },
    {
      windowState: "free-agency",
      faEligible: true,
      counts: ctx.counts,
      squadSize: ctx.squadSize,
      // KEEP the phase roster cap (15 group / 9 playoff) even on a commissioner override — the bypass
      // neutralizes only the window/snapshot/drop-lock gates, never the squad cap.
      rosterCap: ctx.rosterCap,
      ownedByManager: ctx.ownedByManager,
      dropLocked: false,
    },
  );
  if (verr) return { status: "refused", reason: `${verr.code}: ${verr.message}`, plan };

  // (3) Dry-run by default: print the plan, change nothing.
  if (!input.apply) return { status: "planned", plan };

  // (4) The per-player kickoff integrity guard gates the WRITE (default-block).
  if (guard.blocked) {
    return {
      status: "blocked",
      reason: `add target's match has already kicked off (${plan.addMatch?.kickoffAt}); pass --allow-post-kickoff to honor a pre-kickoff move`,
      plan,
    };
  }
  if (plan.kickoffBypassed) {
    deps.log(
      `⚠️  POST-KICKOFF OVERRIDE — adding "${input.addName}" via ${plan.addMatch?.label} (kickoff ${plan.addMatch?.kickoffAt}); his points for that match are already known.`,
    );
  }

  // (5) Apply via the SAME atomic claim the route uses (active-ownership unique + valid-drop kept).
  const outcome = await deps.store.claimFreeAgent({
    leagueId: ctx.leagueId,
    managerId: input.managerId,
    playerAddId: input.addId,
    playerDropId: input.dropId,
    runAt: deps.now,
    periodId: input.pinnedPeriodId,
  });
  if (outcome === "conflict") {
    return {
      status: "conflict",
      reason:
        "claim conflict — the add is already owned, the drop is no longer owned, or the period's batch has not cleared yet",
      plan,
    };
  }

  const audit = formatAudit({
    command: "roster",
    commissioner: input.actor.email ?? "(is_commissioner flag)",
    team: input.teamLabel,
    managerId: input.managerId,
    action: input.dropId ? "add/drop" : "add",
    add: input.addName,
    drop: input.dropName,
    period: input.pinnedPeriodLabel,
    reason: input.reason,
    kickoffBypassed: plan.kickoffBypassed,
    timestamp: input.timestamp,
  });
  deps.log(audit);
  return { status: "applied", plan, audit };
}
