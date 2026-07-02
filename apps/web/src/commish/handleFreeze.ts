/**
 * Thread 4 — testable orchestration behind `POST /api/commish/freeze` + `/api/commish/unfreeze`.
 * Framework-agnostic `{ status, body }` handlers (the Thread-2 `handleStatCorrection` shape); the thin
 * routes wire the real deps.
 *
 * WHAT FREEZE MEANS (Step-0 discovery — do NOT copy the design prototype's wording): `period.frozen_at`
 * gates AUTO-RESTATEMENT ONLY. The worker recompute sweep skips a frozen period unless the commissioner
 * override (`allowFrozen`) is passed — it does NOT lock lineups and does NOT pause live scoring (those
 * are the lock-on-play latch and `period.status`, separate machinery). So:
 *   FREEZE   = results are final NOW — late feed / rating corrections stop auto-restating this period.
 *   UNFREEZE = re-open auto-restatement — pending dirty markers (left unprocessed by the freeze skip,
 *              recompute.ts Phase 2) restate on the worker's next sweep. The hourly period-close cron
 *              queries `frozenAt: null` with no manual-unfreeze exclusion, so it RE-STAMPS the period on
 *              its next pass (~1h window for corrections to restate) — surfaced in the response.
 *
 * These handlers are new CALLERS of the existing gate: packages/scoring + packages/recompute and the
 * periodClose cron are byte-untouched.
 *
 * Guard: a period may be frozen only when it is status-closed OR every fixture is completed (with ≥1
 * fixture) — never a live/future wave. Anomalous waves (a postponed/abandoned fixture, never all-FT,
 * never status-closed) remain unfreezable here, same as the cron.
 *
 * Idempotency = typed 409 (`already_frozen` / `not_frozen`), never a silent 200: a 200 without an audit
 * row would break "every action is logged", and writing an audit row for a no-op would log an action
 * that never happened. The store's conditional update (`WHERE frozen_at IS NULL` / `IS NOT NULL`)
 * returns null on a lost race (e.g. the hourly cron stamping concurrently) → the same typed 409, with
 * no write and no audit row.
 */
import type { SessionManagerOutcome } from "@app/auth";
import type { MatchStatus, PeriodStatus } from "@app/shared";
import type { RecordCommishAuditInput } from "./recordCommishAudit";
import { gate, type HandlerResult } from "./handleStatCorrection";

// ── pure guard predicates (shared with the loader's `freezable` / `live` view flags) ──────────────

/** Freezable = status-closed, OR ≥1 fixture and every fixture completed (early-finalize / re-freeze). */
export function periodFreezable(status: PeriodStatus | string, fixtureStatuses: string[]): boolean {
  if (status === "closed") return true;
  return fixtureStatuses.length > 0 && fixtureStatuses.every((s) => s === "completed");
}

/** Live = any fixture currently in progress (the console's live pill). */
export function periodLive(fixtureStatuses: string[]): boolean {
  return fixtureStatuses.includes("in_progress");
}

// ── ports ──────────────────────────────────────────────────────────────────────────────────────────

/** The minimal period context the handlers validate + guard on. */
export interface FreezePeriodContext {
  leagueId: string;
  label: string;
  status: PeriodStatus | string;
  frozenAt: Date | null;
  fixtureStatuses: MatchStatus[] | string[];
}

/** The write port. `freeze`/`unfreeze` run the conditional `frozen_at` update AND the `commish_audit`
 *  insert in ONE transaction (store-owned); a conditional update that matches 0 rows (lost race) aborts
 *  the transaction and returns null — no write, no audit row. */
export interface CommishFreezeStore {
  getManagerLeagueId(managerId: string): Promise<string | null>;
  getPeriod(periodId: string): Promise<FreezePeriodContext | null>;
  freeze(input: {
    periodId: string;
    now: Date;
    audit: RecordCommishAuditInput;
  }): Promise<{ auditId: string } | null>;
  unfreeze(input: {
    periodId: string;
    audit: RecordCommishAuditInput;
  }): Promise<{ auditId: string } | null>;
  /** Unprocessed `manager_period` dirty markers pointing at the period — the corrections a post-unfreeze
   *  sweep will restate (recompute.ts Phase 2 left them unprocessed while frozen). */
  countPendingDirty(periodId: string): Promise<number>;
}

export interface CommishFreezeDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  now: () => Date;
  store: CommishFreezeStore;
}

export interface FreezeBody {
  periodId: string;
  reason: string;
}
export type UnfreezeBody = FreezeBody;

/** Shape-parse for BOTH thin routes (a route module may export only handlers, so this lives here). */
export function parseFreezeBody(raw: unknown): FreezeBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.periodId !== "string" || typeof b.reason !== "string") return null;
  return { periodId: b.periodId, reason: b.reason };
}

// ── shared plumbing ────────────────────────────────────────────────────────────────────────────────

const err = (status: number, error: string): HandlerResult => ({ status, body: { error } });
const errMsg = (status: number, error: string, message: string): HandlerResult => ({
  status,
  body: { error, message },
});

const NOT_FREEZABLE_MESSAGE =
  "This period still has live or unplayed fixtures — a period can be frozen only after every fixture " +
  "has finished (or once the hourly close job has closed it).";

/** Surfaced verbatim on every successful unfreeze — the cron re-stamp is unconditional (Step-0 §2). */
export const UNFREEZE_REFREEZE_WARNING =
  "This period re-freezes automatically on the close job's next hourly pass (up to ~1h window to let " +
  "corrections restate).";

/** Resolve the period and confine the write to the commissioner's OWN league. Cross-league (or unknown)
 *  targets are the SAME 404 — no existence leak. */
async function resolvePeriod(
  deps: CommishFreezeDeps,
  managerId: string,
  periodId: string,
): Promise<{ ok: true; period: FreezePeriodContext } | { ok: false; result: HandlerResult }> {
  const period = await deps.store.getPeriod(periodId);
  if (!period) return { ok: false, result: err(404, "invalid_period") };
  const leagueId = await deps.store.getManagerLeagueId(managerId);
  if (!leagueId || period.leagueId !== leagueId) {
    return { ok: false, result: err(404, "invalid_period") };
  }
  return { ok: true, period };
}

function validate(
  body: FreezeBody,
): { ok: true; reason: string } | { ok: false; result: HandlerResult } {
  if (typeof body.reason !== "string" || body.reason.trim() === "") {
    return { ok: false, result: err(400, "reason_required") };
  }
  if (typeof body.periodId !== "string" || body.periodId === "") {
    return { ok: false, result: err(400, "bad_request") };
  }
  return { ok: true, reason: body.reason.trim() };
}

// ── POST /api/commish/freeze ───────────────────────────────────────────────────────────────────────

export async function handleFreeze(
  deps: CommishFreezeDeps,
  body: FreezeBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  const v = validate(body);
  if (!v.ok) return v.result;

  const r = await resolvePeriod(deps, g.managerId, body.periodId);
  if (!r.ok) return r.result;
  const { period } = r;

  if (period.frozenAt !== null) return err(409, "already_frozen");
  if (!periodFreezable(period.status, period.fixtureStatuses as string[])) {
    return errMsg(409, "not_freezable", NOT_FREEZABLE_MESSAGE);
  }

  const now = deps.now();
  const res = await deps.store.freeze({
    periodId: body.periodId,
    now,
    audit: {
      leagueId: period.leagueId,
      actorUserId: g.userId,
      actionType: "period_freeze",
      summary: `Period frozen: ${period.label}`,
      detail:
        "Results final — the recompute sweep now skips this period; restatement is commissioner-only " +
        "(allowFrozen). Lineups and live scoring are unaffected.",
      reason: v.reason,
      targetRef: { periodId: body.periodId },
      reversible: true,
    },
  });
  if (res === null) return err(409, "already_frozen"); // lost the race (e.g. the hourly cron stamped first)

  return {
    status: 200,
    body: {
      ok: true,
      periodLabel: period.label,
      frozenAt: now.toISOString(),
      auditId: res.auditId,
    },
  };
}

// ── POST /api/commish/unfreeze ─────────────────────────────────────────────────────────────────────

export async function handleUnfreeze(
  deps: CommishFreezeDeps,
  body: UnfreezeBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  const v = validate(body);
  if (!v.ok) return v.result;

  const r = await resolvePeriod(deps, g.managerId, body.periodId);
  if (!r.ok) return r.result;
  const { period } = r;

  if (period.frozenAt === null) return err(409, "not_frozen");

  // Counted BEFORE the write so the audit detail can carry it; the worker only restates AFTER the
  // unfreeze commits, so the count cannot shrink in between.
  const pendingDirty = await deps.store.countPendingDirty(body.periodId);

  const res = await deps.store.unfreeze({
    periodId: body.periodId,
    audit: {
      leagueId: period.leagueId,
      actorUserId: g.userId,
      actionType: "period_unfreeze",
      summary: `Period unfrozen: ${period.label}`,
      detail:
        `Auto-restatement re-opened — ${pendingDirty} pending correction marker(s) will restate on the ` +
        "worker's next sweep. The hourly close job re-freezes this period on its next pass.",
      reason: v.reason,
      targetRef: { periodId: body.periodId },
      reversible: true,
    },
  });
  if (res === null) return err(409, "not_frozen"); // lost the race (already unfrozen)

  return {
    status: 200,
    body: {
      ok: true,
      periodLabel: period.label,
      auditId: res.auditId,
      pendingDirty,
      refreezeWarning: UNFREEZE_REFREEZE_WARNING,
    },
  };
}
