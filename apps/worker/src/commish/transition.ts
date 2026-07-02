/**
 * Group→playoff TRANSITION (`commish:transition`) — Theme C/D, the one-time collapse of the all-play-all
 * group league into the guillotine SURVIVAL LADDER over the WC's 5 knockout rounds. At the end of the
 * group stage the commissioner runs this; it locks the final standings, seeds the top-N field, writes the
 * derived per-round cut schedule, releases the non-advancers' rosters into the FAAB pool, carries the
 * rolling waiver order forward (eliminated removed, no re-seed), and flips `league.status` group→playoff.
 * The one-time $100 FAAB allowance is NOT reset here — group-stage spend carries into the playoffs.
 *
 * IO at the edges: the pure derivation ({@link buildTransitionPlan}) composes the @app/recompute pure
 * functions (`selectPlayoffField` / `cutScheduleFor` / `carryForwardWaiverOrder`); the {@link
 * PlayoffTransitionStore} loads the inputs and APPLIES the plan in ONE transaction. Dry-run by default
 * ({@link runPlayoffTransition} returns `planned`, mutating nothing) — `apply: true` performs it. It is
 * IRREVERSIBLE, so the apply is idempotent: a conditional `league.status='group'→'playoff'` claim is the
 * entry gate, and the orchestrator skips once the league has left the `group` phase.
 *
 * OUT OF SCOPE here (the later Phase-2 prompt): RUNNING each round — calling `selectGuillotineCuts` at
 * round close, flipping `playoff_entry.status` → `eliminated`/`champion`, and `playoff`→`complete`. This
 * phase only SETS UP the field / periods / survival state those consume.
 */
import {
  selectPlayoffField,
  cutScheduleFor,
  carryForwardWaiverOrder,
  type CutScheduleEntry,
  type PlayoffFieldEntry,
  type WaiverOrderSlot,
  type CarriedWaiverSlot,
} from "@app/recompute";
import { effectiveBatchAt, type PeriodCadenceView } from "@app/faab";
import { PLAYOFF_ROSTER, type LeagueStatus } from "@app/shared";
import { isCommissionerActor } from "@app/commish-core";

// ── the snapshot the store loads (the inputs the pure plan needs) ─────────────────────
export interface TransitionManager {
  managerId: string;
  displayName: string;
  /** Current rolling waiver position (null = unseeded). */
  waiverOrderPosition: number | null;
}

export interface TransitionContext {
  leagueId: string;
  leagueStatus: LeagueStatus;
  /** The FINAL group standings (scope=group_stage), seed carried VERBATIM (1 = best). */
  standings: { managerId: string; seed: number }[];
  /** Every manager in the league — the non-advancer split + the waiver carry-forward + the plan display. */
  managers: TransitionManager[];
  /** Active roster size per manager — drives the dry-run "release N players" line (not load-bearing). */
  activeRosterSizeByManager: Record<string, number>;
  /** Labels of group_md periods NOT yet frozen (`frozen_at IS NULL`) — i.e. whose results are not final.
   *  Empty ⇒ the group standings are settled and safe to seed the bracket from. The precondition guard
   *  refuses an --apply over a non-empty list unless `allowIncompleteStandings`. */
  unfinalizedGroupPeriods: string[];
  /** The R32 period's cadence inputs → the trim deadline (= first playoff batch); null if no R32 period. */
  r32Cadence: PeriodCadenceView | null;
}

// ── the plan the orchestrator derives + the store applies ─────────────────────────────
export interface ReleasedManager {
  managerId: string;
  displayName: string;
  /** How many active players this non-advancer releases into the FAAB pool. */
  releasedCount: number;
}

export interface TransitionPlan {
  leagueId: string;
  fieldSize: number;
  /** The seeded field (advancers) in seed order — one `alive` playoff_entry each. */
  field: PlayoffFieldEntry[];
  /** The 5-round front-loaded cut schedule → each knockout period's `cut_count`. */
  cutSchedule: CutScheduleEntry[];
  /** The non-advancers whose rosters are released into the FAAB pool. */
  released: ReleasedManager[];
  /** The survivors' carried-forward CONTIGUOUS waiver order (1..K), relative order preserved, no re-seed.
   *  Non-advancers are cleared to NULL by the store. */
  waiverOrder: CarriedWaiverSlot[];
  /** The reduced playoff squad cap (15→9) the advancers must trim to. */
  trimCap: number;
  /** The trim deadline = the first playoff (R32) batch instant; null when R32 fixtures are not yet synced
   *  (the deadline is DERIVED, not stored — the 9-cap blocks adds until a manager has trimmed). */
  trimDeadlineAt: Date | null;
  /** Group periods not yet frozen at derivation time (the precondition status, surfaced in the dry-run).
   *  Empty ⇒ standings final. Non-empty appears only when seeding via `--allow-incomplete-standings`. */
  unfinalizedGroupPeriods: string[];
}

// ── the store port (IO) ───────────────────────────────────────────────────────────────
export interface PlayoffTransitionStore {
  /** Load the transition inputs, or null if the league does not exist. */
  loadTransitionContext(leagueId: string): Promise<TransitionContext | null>;
  /** Apply the whole transition in ONE transaction. Returns "applied", or "already-transitioned" when the
   *  conditional `league.status='group'→'playoff'` claim finds 0 rows (a concurrent apply already ran). */
  applyTransition(
    plan: TransitionPlan,
    meta: { runAt: Date },
  ): Promise<"applied" | "already-transitioned">;
}

// ── pure plan derivation (no IO/clock) ────────────────────────────────────────────────
/**
 * Derive the complete transition plan from the loaded context + the commissioner-chosen `fieldSize`. Pure:
 * the field + cut schedule + waiver carry-forward are the @app/recompute pure functions; the trim deadline
 * is `effectiveBatchAt` over the R32 cadence (the SAME instant the FAAB worker fires the first playoff
 * batch on). Throws (via `selectPlayoffField` / `cutScheduleFor`) on a malformed field/standings — the
 * caller turns that into a clean refusal.
 */
export function buildTransitionPlan(
  ctx: TransitionContext,
  fieldSize: number,
  leadMs: number,
): TransitionPlan {
  const field = selectPlayoffField(ctx.standings, fieldSize); // throws on a malformed field/standings
  const cutSchedule = cutScheduleFor(fieldSize);
  const fieldIds = new Set(field.map((f) => f.managerId));

  const current: WaiverOrderSlot[] = ctx.managers.map((m) => ({
    managerId: m.managerId,
    waiverOrderPosition: m.waiverOrderPosition,
  }));
  const waiverOrder = carryForwardWaiverOrder(current, [...fieldIds]);

  const released: ReleasedManager[] = ctx.managers
    .filter((m) => !fieldIds.has(m.managerId))
    .map((m) => ({
      managerId: m.managerId,
      displayName: m.displayName,
      releasedCount: ctx.activeRosterSizeByManager[m.managerId] ?? 0,
    }));

  return {
    leagueId: ctx.leagueId,
    fieldSize,
    field,
    cutSchedule,
    released,
    waiverOrder,
    trimCap: PLAYOFF_ROSTER.cap,
    trimDeadlineAt: ctx.r32Cadence ? effectiveBatchAt(ctx.r32Cadence, leadMs) : null,
    unfinalizedGroupPeriods: ctx.unfinalizedGroupPeriods,
  };
}

// ── orchestrator ──────────────────────────────────────────────────────────────────────
export interface TransitionDeps {
  now: Date;
  /** The FAAB batch lead (ms) — feeds the trim-deadline derivation (= R32 first kickoff − lead). */
  leadMs: number;
  store: PlayoffTransitionStore;
  log: (line: string) => void;
}

export interface TransitionInput {
  actor: { email: string | null; isCommissioner: boolean };
  leagueId: string;
  /** The commissioner-chosen playoff field size (e.g. 8 or 10), fixed at the transition (Theme C). */
  fieldSize: number;
  reason: string;
  /** Override the "all group periods frozen" precondition — seed the bracket from provisional standings.
   *  Default false: the transition is irreversible, so it refuses over not-yet-final group results. */
  allowIncompleteStandings: boolean;
  apply: boolean;
}

export type TransitionResult =
  | { status: "refused"; reason: string }
  | { status: "skipped"; reason: string; plan?: TransitionPlan }
  | { status: "planned"; plan: TransitionPlan }
  | { status: "applied"; plan: TransitionPlan };

export async function runPlayoffTransition(
  deps: TransitionDeps,
  input: TransitionInput,
): Promise<TransitionResult> {
  // (0) Front guards: commissioner identity + a recorded reason (every override carries a why).
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — transition refused" };
  }
  if (!input.reason.trim()) {
    return { status: "refused", reason: "a --reason is required for the transition" };
  }

  const ctx = await deps.store.loadTransitionContext(input.leagueId);
  if (!ctx) return { status: "refused", reason: `unknown league ${input.leagueId}` };

  // (1) Phase / idempotency guard (lifecycle: draft → group → playoff → complete). Re-running after a
  //     successful transition is a no-op, NOT an error (the irreversible step is safe to re-invoke).
  if (ctx.leagueStatus === "playoff" || ctx.leagueStatus === "complete") {
    return {
      status: "skipped",
      reason: `league is already in the ${ctx.leagueStatus} phase — nothing to do`,
    };
  }
  if (ctx.leagueStatus !== "group") {
    return {
      status: "refused",
      reason: `league is in the ${ctx.leagueStatus} phase — the group stage must be active to transition`,
    };
  }
  if (ctx.standings.length === 0) {
    return {
      status: "refused",
      reason: "no group standings found — recompute standings before transitioning",
    };
  }

  // (1b) Finality precondition: the transition is IRREVERSIBLE and seeds the whole bracket, so it refuses
  //      over not-yet-final group results (any group_md period still unfrozen) unless the commissioner
  //      explicitly overrides. The dry-run always REPORTS the status (see the plan), so it is eyeballable.
  if (ctx.unfinalizedGroupPeriods.length > 0 && !input.allowIncompleteStandings) {
    return {
      status: "refused",
      reason:
        `group standings are not final — ${ctx.unfinalizedGroupPeriods.length} group period(s) not yet ` +
        `frozen (${ctx.unfinalizedGroupPeriods.join(", ")}); finalize them, or pass ` +
        `--allow-incomplete-standings to seed from provisional standings`,
    };
  }

  // (2) Derive the plan (pure). A malformed field/standings is a clean refusal, not a crash.
  let plan: TransitionPlan;
  try {
    plan = buildTransitionPlan(ctx, input.fieldSize, deps.leadMs);
  } catch (e) {
    return { status: "refused", reason: (e as Error).message };
  }

  // (3) Dry-run by default: change nothing.
  if (!input.apply) return { status: "planned", plan };

  // (4) Apply transactionally. The store's conditional group→playoff claim is the entry gate; a concurrent
  //     run that already transitioned returns "already-transitioned" (this run applied nothing).
  const outcome = await deps.store.applyTransition(plan, { runAt: deps.now });
  if (outcome === "already-transitioned") {
    return { status: "skipped", reason: "another run already transitioned this league", plan };
  }

  deps.log(
    `✓ group→playoff transition APPLIED — league ${plan.leagueId}: field ${plan.fieldSize}, ` +
      `released ${plan.released.length} manager(s) (FAAB budgets carry forward — not reset); ` +
      `by ${input.actor.email ?? "(is_commissioner flag)"} — reason: ${input.reason}`,
  );
  return { status: "applied", plan };
}
