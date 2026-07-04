/**
 * The PURE auto-fire decision for the unattended playoff round cut (feat/autofire-round-cut). No IO, no
 * clock (all injected), so the "should the resident tick cut this round now?" logic is exhaustively
 * unit-testable — the same pure-selector idiom as `@app/recompute` {@link selectPeriodStatusTransitions}
 * and the worker's notify/faab selectors. This module DECIDES; the IO orchestrator ({@link ./dispatch})
 * loads the facts, resolves the cut via the untouched `runRoundAdvance`, and applies/alerts.
 *
 * It fires a cut ONLY when EVERY guard holds — the master kill-switch is on, the round's period is CLOSED
 * (all fixtures completed — the reused status-close output), the settle window has elapsed, the round is
 * not already cut, and the pure `resolveRoundCut` fully DETERMINED the cut. A boundary tie
 * (`needsCommissioner`) or a malformed tiebreak (`invalid-tiebreak`) is NEVER auto-cut — it is surfaced as
 * an `alert` so the commissioner adjudicates manually via `commish:advance`. This mirrors
 * `runRoundAdvance`, which itself refuses to auto-cut a tie; the pre-check here means the irreversible
 * apply is never even attempted on an unresolved round.
 */
import { comparePeriodLabels, KNOCKOUT_ROUNDS, type PeriodStatus } from "@app/shared";
import type { RoundCutResolution } from "@app/recompute";

/** The three outcomes the pure `resolveRoundCut` can produce for a round. */
export type AutoFireResolutionKind = RoundCutResolution["kind"];

/** One knockout round, reduced to exactly the facts the auto-fire decision needs. */
export interface AutoFireRound {
  periodId: string;
  /** Canonical bracket label — R32 | R16 | QF | SF | Final ({@link KNOCKOUT_ROUNDS}). */
  label: string;
  /** Lifecycle status. `closed` == every fixture completed — the REUSED status-close output
   *  (`selectPeriodStatusTransitions`), NOT re-derived from fixtures here (no new match-status math). */
  status: PeriodStatus;
  /** `max(kickoffAt)` among the round's fixtures — the freeze-proxy last-FT (`@app/recompute/freeze`,
   *  Chat-confirmed P45: `fifa_match` stores no completed-at instant, so kickoff is the FT proxy). null
   *  when the round has no fixtures (no anchor for the settle window). */
  lastFtMs: number | null;
  /** True iff this round was already cut (≥1 `playoff_entry` stamped `eliminated_round == label`). */
  alreadyCut: boolean;
  /** The dry-run `resolveRoundCut` outcome for THIS round, or null when the worker has not resolved it
   *  yet. Only the earliest eligible round is ever resolved (ordering makes later rounds' resolutions
   *  meaningless), so every other round carries null. */
  resolutionKind: AutoFireResolutionKind | null;
}

/** The auto-fire decision. `resolve` = eligible on the cheap gates but the resolution is not yet known
 *  (the caller must dry-run, then re-evaluate). */
export type AutoFireDecision =
  | { action: "none"; reason: string }
  | { action: "resolve"; periodId: string; label: string }
  | { action: "fire"; periodId: string; label: string }
  | {
      action: "alert";
      periodId: string;
      label: string;
      resolution: Exclude<AutoFireResolutionKind, "determined">;
    };

const KNOCKOUT_LABELS: ReadonlySet<string> = new Set(KNOCKOUT_ROUNDS);

/**
 * Decide whether the resident tick should auto-fire the next playoff round cut. Pure — `now`, the enable
 * flag, the settle window, and the round facts (incl. the injected resolution) are all parameters.
 */
export function selectAutoFireCut(input: {
  now: Date;
  enabled: boolean;
  settleMs: number;
  rounds: readonly AutoFireRound[];
}): AutoFireDecision {
  const { now, enabled, settleMs, rounds } = input;

  // (0) Master kill-switch. Unset/false ⇒ the whole step is a no-op — the byte-identical default.
  if (!enabled) return { action: "none", reason: "disabled" };

  // (1) The EARLIEST uncut, CLOSED knockout round in canonical bracket order. `closed` reuses the
  //     status-close output (period.status); we never re-derive "all fixtures completed" here. An earlier
  //     round that is not yet closed simply isn't a candidate — and `runRoundAdvance`'s ordering guard is
  //     the authority that keeps the ladder in sequence (a later round out of order dry-runs to null).
  const target = [...rounds]
    .filter((r) => KNOCKOUT_LABELS.has(r.label) && r.status === "closed" && !r.alreadyCut)
    .sort((a, b) => comparePeriodLabels(a.label, b.label))[0];
  if (!target) return { action: "none", reason: "no closed, uncut knockout round" };

  // (2) Settle window — anchored to the freeze-proxy last-FT (max kickoff; freeze.ts P45). A round with no
  //     fixtures has no anchor. Because (1) already requires every fixture completed, for real matches this
  //     floor is effectively "the first tick after the round closes" (kickoff is ~2h+ before completion).
  if (target.lastFtMs === null) {
    return { action: "none", reason: "no fixtures to anchor the settle window" };
  }
  if (now.getTime() < target.lastFtMs + settleMs) {
    return { action: "none", reason: "settle window not elapsed" };
  }

  // (3) Branch on the injected resolution. A cut fires ONLY when fully DETERMINED; a boundary tie / invalid
  //     tiebreak is NEVER auto-cut — it is surfaced for manual commish:advance adjudication.
  switch (target.resolutionKind) {
    case "determined":
      return { action: "fire", periodId: target.periodId, label: target.label };
    case "needsCommissioner":
    case "invalid-tiebreak":
      return {
        action: "alert",
        periodId: target.periodId,
        label: target.label,
        resolution: target.resolutionKind,
      };
    case null:
      // Eligible on the cheap gates, resolution not yet computed → the caller dry-runs, then re-evaluates.
      return { action: "resolve", periodId: target.periodId, label: target.label };
  }
}
