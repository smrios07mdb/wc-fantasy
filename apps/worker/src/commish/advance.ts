/**
 * Playoff per-round cut APPLICATION (`commish:advance`) — Theme C, the guillotine survival ladder's WRITE
 * step. After the group→playoff transition seeds the field and writes each knockout round's `cut_count`,
 * the commissioner runs THIS once per round (R32 → R16 → QF → SF → Final): it assembles the round's frozen
 * scores, RESOLVES the cut via the pure `resolveRoundCut` (which reuses the untouched `selectGuillotineCuts`),
 * and APPLIES it — flipping the cut managers `alive → eliminated` and, on the final round, the lone survivor
 * `alive → champion`.
 *
 * IO at the edges: the pure derivation is `@app/recompute.resolveRoundCut`; the {@link PlayoffAdvanceStore}
 * loads the inputs and applies the cut in ONE transaction. Dry-run by default ({@link runRoundAdvance}
 * returns `planned`, mutating nothing) — `apply: true` performs the IRREVERSIBLE cut. In front stay the
 * override guards: the commissioner gate, a required reason, the FROZEN-round precondition (overridable with
 * `--allow-incomplete`), an ordering guard (earlier rounds must be cut first), idempotency (a re-run is a
 * no-op), and a structured audit line per applied cut. A residual boundary tie is NEVER auto-cut — it is
 * surfaced for `--break-tie` adjudication. Injected deps → testable against a memory store.
 *
 * OUT OF SCOPE (per the thread spec): no roster trim, no FAAB write (the D4 gate auto-excludes `eliminated`
 * holders), no score recompute (it READS `score_manager_period`), and no `league.status` flip — the
 * `playoff → complete` transition is left to the next thread.
 */
import { resolveRoundCut, type RoundCutResolution } from "@app/recompute";
import { KNOCKOUT_ROUNDS, type KnockoutRound } from "@app/shared";
import { formatAudit, isCommissionerActor } from "@app/commish-core";
import type { PlayoffAdvanceStore } from "./advanceStore";

const FINAL_ROUND = KNOCKOUT_ROUNDS[KNOCKOUT_ROUNDS.length - 1];

export interface AdvanceDeps {
  now: Date;
  store: PlayoffAdvanceStore;
  log: (line: string) => void;
}

export interface AdvanceInput {
  actor: { email: string | null; isCommissioner: boolean };
  leagueId: string;
  /** The knockout round to cut (`--round`, e.g. "R32"). */
  roundLabel: string;
  reason: string;
  /** `--break-tie`: the managerIds chosen to be cut from the residual tie, or null (CLI resolves labels). */
  breakTie: string[] | null;
  /** `--allow-incomplete`: override the frozen-round precondition (the irreversible-op guard). */
  allowIncomplete: boolean;
  apply: boolean;
  /** id → display label for the plan + audit; falls back to the id when unknown. */
  nameOf: Readonly<Record<string, string>>;
  timestamp: string;
}

export interface AdvanceFieldRow {
  managerId: string;
  name: string;
  roundPoints: number;
  cumulativeTotal: number;
}

export interface AdvancePlan {
  leagueId: string;
  round: string;
  cutCount: number | null;
  frozen: boolean;
  isFinalRound: boolean;
  alreadyCut: boolean;
  /** The alive field sorted by round score ascending (the cut zone is the bottom), with display names. */
  field: AdvanceFieldRow[];
  /** The pure resolution, or null when refused before resolving (e.g. not frozen / out of order). */
  resolution: RoundCutResolution | null;
}

export type AdvanceResult =
  | { status: "refused"; reason: string; plan?: AdvancePlan }
  | { status: "needs-commissioner"; reason: string; plan: AdvancePlan }
  | { status: "skipped"; reason: string; plan?: AdvancePlan }
  | { status: "planned"; plan: AdvancePlan }
  | { status: "applied"; plan: AdvancePlan; audits: string[] };

export async function runRoundAdvance(
  deps: AdvanceDeps,
  input: AdvanceInput,
): Promise<AdvanceResult> {
  const name = (id: string): string => input.nameOf[id] ?? id;

  // (0) Front guards: commissioner identity, a recorded reason, a real round label.
  if (!isCommissionerActor(input.actor)) {
    return { status: "refused", reason: "not the commissioner — advance refused" };
  }
  if (!input.reason.trim()) {
    return { status: "refused", reason: "a --reason is required for any override" };
  }
  if (!KNOCKOUT_ROUNDS.includes(input.roundLabel as KnockoutRound)) {
    return {
      status: "refused",
      reason: `unknown round "${input.roundLabel}" — expected one of ${KNOCKOUT_ROUNDS.join(", ")}`,
    };
  }

  const ctx = await deps.store.loadRoundContext(input.leagueId, input.roundLabel);
  if (!ctx) {
    return {
      status: "refused",
      reason: `no knockout round labelled "${input.roundLabel}" — has commish:transition been run?`,
    };
  }

  const isFinalRound = input.roundLabel === FINAL_ROUND;
  const field: AdvanceFieldRow[] = [...ctx.alive]
    .sort((a, b) => a.roundPoints - b.roundPoints || (a.managerId < b.managerId ? -1 : 1))
    .map((a) => ({
      managerId: a.managerId,
      name: name(a.managerId),
      roundPoints: a.roundPoints,
      cumulativeTotal: a.cumulativeTotal,
    }));
  const plan = (resolution: RoundCutResolution | null): AdvancePlan => ({
    leagueId: input.leagueId,
    round: ctx.round.label,
    cutCount: ctx.round.cutCount,
    frozen: ctx.round.frozenAt !== null,
    isFinalRound,
    alreadyCut: ctx.alreadyCut,
    field,
    resolution,
  });

  // (1) Idempotency: a round already cut is a no-op skip, not an error.
  if (ctx.alreadyCut) {
    return {
      status: "skipped",
      reason: `round ${ctx.round.label} has already been cut`,
      plan: plan(null),
    };
  }
  // (2) cut_count must be seeded (by the transition) and positive.
  if (ctx.round.cutCount === null || ctx.round.cutCount <= 0) {
    return {
      status: "refused",
      reason: `round ${ctx.round.label} has no positive cut_count — was commish:transition run?`,
      plan: plan(null),
    };
  }
  // (3) Ordering guard: earlier knockout rounds must be cut first so the alive set is current.
  if (ctx.uncutPriorRounds.length > 0) {
    return {
      status: "refused",
      reason: `cut the earlier round(s) first — ${ctx.uncutPriorRounds.join(", ")} not yet applied`,
      plan: plan(null),
    };
  }
  if (ctx.alive.length === 0) {
    return { status: "refused", reason: "no alive survivors to cut", plan: plan(null) };
  }
  // (4) Frozen precondition (readiness) — overridable for an emergency cut, mirroring the transition.
  if (ctx.round.frozenAt === null && !input.allowIncomplete) {
    return {
      status: "refused",
      reason: `round ${ctx.round.label} is not frozen — wait for the result freeze, or pass --allow-incomplete`,
      plan: plan(null),
    };
  }

  // (5) Resolve the cut (pure). A --break-tie choice is validated + adjudicated here.
  const resolution = resolveRoundCut({
    aliveRoundScores: ctx.alive.map((a) => ({ managerId: a.managerId, points: a.roundPoints })),
    cumulativeTotals: new Map(ctx.alive.map((a) => [a.managerId, a.cumulativeTotal])),
    cutCount: ctx.round.cutCount,
    breakTie: input.breakTie ?? undefined,
  });
  const p = plan(resolution);

  if (resolution.kind === "invalid-tiebreak") {
    return { status: "refused", reason: resolution.reason, plan: p };
  }
  if (resolution.kind === "needsCommissioner") {
    // The dry-run SHOWS the tie; an --apply without a valid --break-tie refuses (never auto-cuts).
    if (!input.apply) return { status: "planned", plan: p };
    return {
      status: "needs-commissioner",
      reason: `boundary tie — re-run --apply --break-tie naming ${resolution.cutsRemaining} of {${resolution.tied
        .map(name)
        .join(", ")}}`,
      plan: p,
    };
  }

  // (6) Determined — cheap champion/schedule sanity checks (the lone-survivor must be the final round).
  if (resolution.survivors.length === 0) {
    return {
      status: "refused",
      reason: "the cut would eliminate the entire field — schedule inconsistency",
      plan: p,
    };
  }
  if (resolution.champion !== null && !isFinalRound) {
    return {
      status: "refused",
      reason: `the cut leaves a lone survivor on a non-final round (${ctx.round.label}) — schedule inconsistency; not applying`,
      plan: p,
    };
  }
  if (isFinalRound && resolution.champion === null) {
    return {
      status: "refused",
      reason: `the final round did not resolve to a single champion (${resolution.survivors.length} survive) — earlier rounds may be unapplied`,
      plan: p,
    };
  }

  // (7) Dry-run by default — change nothing.
  if (!input.apply) return { status: "planned", plan: p };

  // (8) Apply transactionally. The store's conditional alive→eliminated claim is the idempotency gate.
  const outcome = await deps.store.applyRoundCut({
    leagueId: input.leagueId,
    roundLabel: ctx.round.label,
    eliminated: resolution.eliminated,
    champion: resolution.champion,
    at: deps.now,
  });
  if (outcome === "already-cut") {
    return { status: "skipped", reason: "another run already cut this round", plan: p };
  }

  // (9) Audit: one line per eliminated manager + one for the champion flip.
  const commissioner = input.actor.email ?? "(is_commissioner flag)";
  const tieAdjudicated = (input.breakTie?.length ?? 0) > 0;
  const audits: string[] = resolution.eliminated.map((managerId) =>
    formatAudit({
      command: "advance",
      commissioner,
      team: name(managerId),
      managerId,
      action: "eliminated",
      round: ctx.round.label,
      tieAdjudicated,
      reason: input.reason,
      kickoffBypassed: false,
      timestamp: input.timestamp,
    }),
  );
  if (resolution.champion) {
    audits.push(
      formatAudit({
        command: "advance",
        commissioner,
        team: name(resolution.champion),
        managerId: resolution.champion,
        action: "champion",
        round: ctx.round.label,
        tieAdjudicated: false,
        reason: input.reason,
        kickoffBypassed: false,
        timestamp: input.timestamp,
      }),
    );
  }
  for (const line of audits) deps.log(line);
  deps.log(
    `✓ ${ctx.round.label} cut APPLIED — eliminated ${resolution.eliminated.length}` +
      `${resolution.champion ? `, champion ${name(resolution.champion)}` : ""}; by ${commissioner} — reason: ${input.reason}`,
  );
  return { status: "applied", plan: p, audits };
}
