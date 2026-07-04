/**
 * The resident-tick PLAYOFF ROUND AUTO-FIRE driver (feat/autofire-round-cut) — the highest-risk step: an
 * UNATTENDED, IRREVERSIBLE cut that releases the eliminated managers' rosters on PROVISIONAL (not-yet-frozen)
 * scores. Every guard is load-bearing. It INVOKES the untouched `runRoundAdvance` orchestrator (the SAME
 * entry the `commish:advance` CLI uses) — it re-implements NO cut / release / resolution logic.
 *
 * Each tick (only when `AUTOFIRE_CUTS_ENABLED`):
 *   1. load the knockout-round facts + pick the EARLIEST uncut CLOSED round past the settle window — the
 *      pure {@link selectAutoFireCut} (pass 1, resolution unknown → `resolve`);
 *   2. DATA-COMPLETENESS GATE (FIX 1, the PRIMARY safety gate): load the round's fixtures + rating/dirty
 *      state and run the pure {@link selectRoundDataComplete}. HOLD (never fire) unless every fixture is
 *      completed + fully rated + swept — so the cut never fires on scores whose RATINGS have not landed
 *      (the last-arriving input). A hold is logged (VISIBLE, not silent); manual `commish:advance` is the
 *      fallback. This is what justifies `allowIncomplete: true`: scores are PRESENT, just not yet frozen;
 *   3. RESOLVE that round via a DRY-RUN `runRoundAdvance` (mutates nothing) with `allowIncomplete: true` and
 *      a SYSTEM commissioner actor (so the audit distinguishes auto from manual);
 *   4. feed the resolution back through the SAME pure decision (pass 2):
 *        • `determined`        → APPLY the cut+release+DURABLE-audit via `runRoundAdvance({ apply: true })`
 *          against the tx-bound audit store (FIX 2 — the `auto_advance` `commish_audit` row commits atomically
 *          with the cut+release);
 *        • boundary tie / bad tiebreak → NEVER cut; dispatch a ledgered commissioner alert + leave it for
 *          manual `commish:advance`;
 *        • still unresolved (out of order / no cut_count) → skip, untouched.
 *
 * Idempotency is inherited, not re-invented: `runRoundAdvance`'s 0-row `alive → eliminated` claim makes a
 * re-tick of an already-cut round a no-op (releasing nothing, writing no audit row), and the
 * `notification_sent` ledger collapses re-alerts to one per round. A thrown error here is caught by the
 * scheduler's own try/catch (isolation — never starves the tick).
 */
import { runRoundAdvance, type AdvanceInput, type AdvanceResult } from "@app/commish-core";
import type { PlayoffAdvanceStore } from "@app/commish-core/advanceStore";
import { dispatchCommissionerAlert, type NotifyStore, type PushPayload } from "@app/notify";
import { selectAutoFireCut, type AutoFireRound } from "./selectors";
import { selectRoundDataComplete } from "./completeness";
import type { AutoFireStore } from "./store";

/** The audit context an auto-fire APPLY store is built with (FIX 2) — captures the reason + names so the
 *  durable `auto_advance` row commits inside the cut transaction. */
export interface AutoFireAuditContext {
  reason: string;
  nameOf: Readonly<Record<string, string>>;
}

/** The SYSTEM commissioner identity for the automated cut. `isCommissioner: true` satisfies the
 *  `runRoundAdvance` gate (a pure predicate on the passed actor); the `email` marks the `round_advance`
 *  audit as auto (vs a human commissioner's real email). No DB user is looked up. */
const SYSTEM_ACTOR = { email: "system:auto-fire", isCommissioner: true } as const;

/** Structured logger surface (the worker `log`). */
export interface AutoFireLog {
  debug: (event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
}

export interface AutoFireDeps {
  now: Date;
  enabled: boolean;
  settleMs: number;
  /** Worker-local reads (rounds / names / commissioners / league / round completeness). */
  store: AutoFireStore;
  /** Build the playoff cut store `runRoundAdvance` consumes for THIS run — the dry-run reads through it and
   *  the apply writes the durable `auto_advance` audit row via it (FIX 2). Built per-run so the audit row
   *  carries this run's reason + names. */
  makeAdvanceStore: (audit: AutoFireAuditContext) => PlayoffAdvanceStore;
  /** The push transport + ledger for the tie-hold commissioner alert. */
  notify: NotifyStore;
  log: AutoFireLog;
  /** Test seams — default to the real implementations. */
  advance?: typeof runRoundAdvance;
  alert?: typeof dispatchCommissionerAlert;
}

export type AutoFireOutcome =
  | { action: "none"; reason: string }
  | { action: "holding"; label: string; reason: string }
  | { action: "fired"; label: string; status: AdvanceResult["status"] }
  | { action: "alerted"; label: string; recipients: number; sent: number }
  | { action: "skipped"; label: string; reason: string };

/** The tie-hold push the commissioner receives — built inline so `@app/notify/payload` stays untouched. */
function buildCutReviewPayload(label: string): PushPayload {
  return {
    title: "Playoff cut needs review",
    body: `${label}: a boundary tie can't be auto-cut — run commish:advance --break-tie to adjudicate.`,
    url: "/commish",
    tag: `cut_needs_review:${label}`,
  };
}

export async function dispatchAutoFireCut(deps: AutoFireDeps): Promise<AutoFireOutcome> {
  const { now, enabled, settleMs, store, makeAdvanceStore, notify, log } = deps;
  const advance = deps.advance ?? runRoundAdvance;
  const alert = deps.alert ?? dispatchCommissionerAlert;

  // Cheap short-circuit BEFORE any IO when disabled — the byte-identical no-op default.
  if (!enabled) return { action: "none", reason: "disabled" };

  const leagueId = await store.loadLeagueId();
  if (!leagueId) return { action: "none", reason: "no league" };

  const rows = await store.loadKnockoutRounds(leagueId);

  // Pass 1 — the earliest eligible round on the cheap gates (enabled + closed + settle + not-cut + earliest);
  // resolution unknown, so an eligible round comes back as `resolve` (or `none`).
  const pass1 = selectAutoFireCut({
    now,
    enabled,
    settleMs,
    rounds: rows.map((r): AutoFireRound => ({ ...r, resolutionKind: null })),
  });
  if (pass1.action === "none") return { action: "none", reason: pass1.reason };
  if (pass1.action !== "resolve") {
    // Unreachable (all resolutionKind are null in pass 1) — fail safe: never cut on an unexpected shape.
    return { action: "skipped", label: pass1.label, reason: "unexpected pre-pass action" };
  }
  const { periodId, label } = pass1;

  // FIX 1 — the PRIMARY safety gate: data-completeness. Fire only when every fixture is completed + fully
  // rated + swept. A hold is VISIBLE (log.warn) so a stuck round (e.g. an appeared player who never gets a
  // rating) is never silent; the fallback is always manual `commish:advance --allow-incomplete`.
  const completeness = selectRoundDataComplete(await store.loadRoundCompleteness(periodId));
  if (!completeness.complete) {
    log.warn("autofire.cut.incomplete", { round: label, reason: completeness.reason });
    return { action: "holding", label, reason: completeness.reason };
  }

  // Resolve the target via a DRY-RUN (mutates nothing). allowIncomplete:true is REQUIRED — at fire time the
  // round is closed + data-complete but NOT frozen (the deliberate provisional-score path). SYSTEM actor +
  // a clear auto reason. The store is built per-run so a DETERMINED apply writes the durable `auto_advance`
  // audit row (FIX 2) with this reason + names, atomically inside the cut+release transaction.
  const nameOf = await store.loadTeamNames(leagueId);
  const reason = `auto-fire: ${label} closed & settle-elapsed — automated guillotine cut`;
  const advanceStore = makeAdvanceStore({ reason, nameOf });
  const baseInput: Omit<AdvanceInput, "apply"> = {
    actor: { ...SYSTEM_ACTOR },
    leagueId,
    roundLabel: label,
    reason,
    breakTie: null,
    allowIncomplete: true,
    nameOf,
    timestamp: now.toISOString(),
  };
  const dry = await advance(
    { now, store: advanceStore, log: (l) => log.debug("autofire.advance.dry", { line: l }) },
    { ...baseInput, apply: false },
  );
  const resolutionKind = dry.plan?.resolution?.kind ?? null;

  // Pass 2 — the SAME pure decision, now with the resolution injected on the target round.
  const pass2 = selectAutoFireCut({
    now,
    enabled,
    settleMs,
    rounds: rows.map(
      (r): AutoFireRound => ({
        ...r,
        resolutionKind: r.periodId === periodId ? resolutionKind : null,
      }),
    ),
  });

  if (pass2.action === "fire") {
    // APPLY — the irreversible cut + release + audit, all inside `runRoundAdvance`'s own $transaction.
    const res = await advance(
      { now, store: advanceStore, log: (l) => log.info("autofire.advance", { line: l }) },
      { ...baseInput, apply: true },
    );
    log.info("autofire.cut.fired", { round: label, status: res.status });
    return { action: "fired", label, status: res.status };
  }

  if (pass2.action === "alert") {
    // Boundary tie / invalid tiebreak — NEVER auto-cut. Alert the commissioner(s), ledgered at-most-once
    // per round, and leave the round for manual commish:advance.
    const commissioners = await store.loadCommissionerManagerIds(leagueId);
    const payload = buildCutReviewPayload(label);
    let sent = 0;
    for (const managerId of commissioners) {
      const r = await alert(notify, managerId, "cut_needs_review", label, payload);
      sent += r.sent;
    }
    log.warn("autofire.cut.needs_review", {
      round: label,
      resolution: pass2.resolution,
      recipients: commissioners.length,
      sent,
    });
    return { action: "alerted", label, recipients: commissioners.length, sent };
  }

  // pass2 `resolve` (still null after the dry-run: refused out-of-order / no cut_count) or `none` — leave
  // the round untouched. Never cut, never alert.
  log.debug("autofire.cut.skipped", { round: label, dryRunStatus: dry.status });
  return { action: "skipped", label, reason: `not determined (dry-run: ${dry.status})` };
}
