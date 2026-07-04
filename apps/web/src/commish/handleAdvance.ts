/**
 * Thread 5 — testable orchestration behind `POST /api/commish/advance` (the playoff round-cut surface).
 * Framework-agnostic `{ status, body }` handler in the Thread-4 `handleFreeze` mold; the thin route wires
 * the real deps. The handler is a CALLER of the relocated `runRoundAdvance` orchestrator — every guard
 * (commissioner actor, seeded cut_count, ordering, frozen precondition, tie adjudication, idempotent
 * apply) lives in `@app/commish-core` byte-verbatim; nothing is re-derived here.
 *
 * WEB-SURFACE HARDENING (mirrors the 3a repair routes):
 *   • `allowIncomplete` is HARDCODED false — the CLI's `--allow-incomplete` emergency override never
 *     rides the web surface; a smuggled body flag is dropped by `parseAdvanceBody` (never parsed).
 *   • The apply path inserts exactly ONE `round_advance` audit row (reversible:false) INSIDE the store's
 *     `applyRoundCut` transaction (the freeze-store atomicity precedent) — the audit-input builder is
 *     handed to the store via `forAdvance`, so the effect and its ledger row commit together and a lost
 *     idempotency race ("already-cut") writes NO ledger row.
 *
 * DRY-RUN REASON (design call, per the thread spec): the orchestrator front-guards on a non-empty reason
 * even for a dry-run (the CLI requires `--reason` up front). The console's initial plan render shouldn't
 * demand prose for a read that persists nothing, so apply:false synthesizes the fixed
 * {@link ADVANCE_PREVIEW_REASON}; the REAL reason is required (400 `reason_required`) only on apply:true —
 * the boundary where anything persists. The orchestrator stays byte-verbatim.
 *
 * STATUS → HTTP: planned/applied → 200; skipped/needs-commissioner/refused → 409. Every non-2xx from the
 * orchestrator is a CURRENT-STATE conflict (already cut, tie awaiting adjudication, precondition unmet),
 * so 409 is the honest class — never a silent 200 masking a refusal on apply (the Thread-4 typed-409
 * idempotency rule). 400 stays reserved for malformed input (bad shape, unknown round label, missing
 * reason on apply). The body always carries the discriminated `status` (+ `plan` when the orchestrator
 * produced one) so the console renders the blocked ladder instead of a bare error.
 */
import type { SessionManagerOutcome } from "@app/auth";
import { KNOCKOUT_ROUNDS, type KnockoutRound, type CommishAuditTargetRef } from "@app/shared";
import { runRoundAdvance, type AdvanceResult } from "@app/commish-core";
import { buildAdvanceAuditRow } from "@app/commish-core/advanceAudit";
import type { ApplyRoundCut, PlayoffAdvanceStore } from "@app/commish-core/advanceStore";
import type { RecordCommishAuditInput } from "./recordCommishAudit";
import { gate, type HandlerResult } from "./handleStatCorrection";
import { mapAdvanceRefusal } from "./advanceRefusalCopy";

// ── ports ──────────────────────────────────────────────────────────────────────────────────────────

/** The web-side store port. `forAdvance` yields the orchestrator's {@link PlayoffAdvanceStore} for ONE
 *  request: its `applyRoundCut` must run the cut AND insert the single audit row (built by `buildAudit`
 *  from the resolved cut) in ONE transaction, surfacing the inserted id via `auditId()`. */
export interface CommishAdvanceStore {
  getManagerLeagueId(managerId: string): Promise<string | null>;
  /** managerId → display name for every league manager (the orchestrator's `nameOf` + audit labels). */
  getLeagueManagerNames(leagueId: string): Promise<Record<string, string>>;
  forAdvance(
    buildAudit: (cut: ApplyRoundCut, released: Record<string, string[]>) => RecordCommishAuditInput,
  ): {
    store: PlayoffAdvanceStore;
    auditId: () => string | null;
  };
}

export interface CommishAdvanceDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  now: () => Date;
  store: CommishAdvanceStore;
}

// ── body ───────────────────────────────────────────────────────────────────────────────────────────

export interface AdvanceBody {
  roundLabel: string;
  reason: string;
  /** managerIds chosen to be cut from a residual boundary tie (the console's chip picker). */
  breakTie: string[] | null;
  apply: boolean;
}

/** Shape-parse for the thin route. `allowIncomplete` is DELIBERATELY not read — the web surface pins the
 *  frozen precondition on (see the module doc); a smuggled flag is simply dropped here. */
export function parseAdvanceBody(raw: unknown): AdvanceBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.roundLabel !== "string") return null;
  if (b.apply !== undefined && typeof b.apply !== "boolean") return null;
  if (b.reason !== undefined && typeof b.reason !== "string") return null;
  let breakTie: string[] | null = null;
  if (b.breakTie !== undefined && b.breakTie !== null) {
    if (!Array.isArray(b.breakTie)) return null;
    if (!b.breakTie.every((x): x is string => typeof x === "string" && x !== "")) return null;
    breakTie = b.breakTie.length > 0 ? [...b.breakTie] : null;
  }
  return {
    roundLabel: b.roundLabel,
    reason: (b.reason as string | undefined) ?? "",
    breakTie,
    apply: (b.apply as boolean | undefined) ?? false,
  };
}

// ── handler ────────────────────────────────────────────────────────────────────────────────────────

const err = (status: number, error: string): HandlerResult => ({ status, body: { error } });

/** The fixed reason threaded through the orchestrator's front-guard on a dry-run — nothing persists on
 *  apply:false, so no operator prose is demanded; the REAL reason is enforced on apply:true. */
export const ADVANCE_PREVIEW_REASON = "(dry-run preview — nothing persisted)";

/** Build the single `round_advance` ledger row for an applied cut. `released` is the per-manager roster
 *  shed to the wire (`managerId → playerId[]`), recorded in the `target_ref` JSON (no migration — the
 *  column is JSONB). The derived summary / detail / delta / target_ref come from the SHARED
 *  `buildAdvanceAuditRow` — the ONE owner of the round-cut audit shape, byte-identical for `round_advance`
 *  (here) and the worker's `auto_advance` (pinned by advanceAudit.test.ts); this only re-shapes that row
 *  into the web store's injected-insert `RecordCommishAuditInput` contract. Exported for the store's tests. */
export function buildAdvanceAudit(
  cut: ApplyRoundCut,
  ctx: {
    leagueId: string;
    actorUserId: string | null;
    reason: string;
    nameOf: Readonly<Record<string, string>>;
    tieAdjudicated: boolean;
    released: Record<string, string[]>;
  },
): RecordCommishAuditInput {
  const row = buildAdvanceAuditRow({
    leagueId: ctx.leagueId,
    actorUserId: ctx.actorUserId,
    actionType: "round_advance",
    roundLabel: cut.roundLabel,
    eliminated: cut.eliminated,
    champion: cut.champion,
    released: ctx.released,
    reason: ctx.reason,
    tieAdjudicated: ctx.tieAdjudicated,
    nameOf: ctx.nameOf,
  });
  return {
    leagueId: ctx.leagueId,
    actorUserId: ctx.actorUserId,
    actionType: "round_advance",
    summary: row.summary,
    detail: row.detail,
    reason: ctx.reason,
    targetRef: row.targetRef as unknown as CommishAuditTargetRef,
    delta: row.delta,
    reversible: false,
  };
}

/** Map the orchestrator's discriminated result to `{ status, body }` — see the module doc for the table. */
function toHttp(result: AdvanceResult, auditId: string | null): HandlerResult {
  switch (result.status) {
    case "planned":
      return { status: 200, body: { status: "planned", plan: result.plan } };
    case "applied":
      return { status: 200, body: { status: "applied", plan: result.plan, auditId } };
    case "skipped":
      return {
        status: 409,
        body: { status: "skipped", reason: mapAdvanceRefusal(result.reason), plan: result.plan },
      };
    case "needs-commissioner":
      return {
        status: 409,
        body: {
          status: "needs-commissioner",
          reason: mapAdvanceRefusal(result.reason),
          plan: result.plan,
        },
      };
    case "refused":
      return {
        status: 409,
        body: { status: "refused", reason: mapAdvanceRefusal(result.reason), plan: result.plan },
      };
  }
}

export async function handleAdvance(
  deps: CommishAdvanceDeps,
  body: AdvanceBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  // Input validation BEFORE any store read: 400s are for malformed requests, 409s for state conflicts.
  if (!KNOCKOUT_ROUNDS.includes(body.roundLabel as KnockoutRound)) {
    return err(400, "unknown_round");
  }
  const reason = body.reason.trim();
  if (body.apply && reason === "") return err(400, "reason_required");

  const leagueId = await deps.store.getManagerLeagueId(g.managerId);
  if (!leagueId) return err(500, "no_league");
  const nameOf = await deps.store.getLeagueManagerNames(leagueId);

  const now = deps.now();
  const effectiveReason = body.apply ? reason : reason || ADVANCE_PREVIEW_REASON;
  const { store, auditId } = deps.store.forAdvance((cut, released) =>
    buildAdvanceAudit(cut, {
      leagueId,
      actorUserId: g.userId,
      reason: effectiveReason,
      nameOf,
      tieAdjudicated: (body.breakTie?.length ?? 0) > 0,
      released,
    }),
  );

  const result = await runRoundAdvance(
    { now, store, log: () => {} },
    {
      actor: { email: g.email, isCommissioner: true },
      leagueId,
      roundLabel: body.roundLabel,
      reason: effectiveReason,
      breakTie: body.breakTie,
      // HARDCODED — the web surface never overrides the frozen-round precondition (3a precedent);
      // the CLI's --allow-incomplete stays the only emergency path. parseAdvanceBody drops the flag.
      allowIncomplete: false,
      apply: body.apply,
      nameOf,
      timestamp: now.toISOString(),
    },
  );

  return toHttp(result, auditId());
}
