/**
 * Testable orchestration behind the two Thread-2 commissioner writes — `POST /api/commish/penalty` (B1) and
 * `POST /api/commish/rating` (B2). Framework-agnostic: each returns a plain `{ status, body }` (no
 * NextResponse, no Supabase, no Prisma). The thin routes wire the real deps and map to NextResponse.
 *
 * Both handlers share the gate → validate → write+audit(atomic) → re-score shape:
 *   1. resolve session → manager outcome; reject 401 (no session) / 403 (not allowlisted / no manager / not
 *      commissioner) BEFORE any read or write;
 *   2. validate the body semantically (reason required; penalty counts ≥ 0 integers; rating 0–10) — BEFORE
 *      any DB read, with a specific error code per failure;
 *   3. resolve + validate the (match, player): the row must exist AND the player's team must be one of the
 *      match's two teams (`invalid_match_player` otherwise);
 *   4. `store.applyPenalty` / `store.applyRating` persist the manual row AND the `commish_audit` row in ONE
 *      transaction (the store owns it) — exactly one audit row per write;
 *   5. fire the injected `rescore(matchId, playerId)` — the sync re-score trigger. It runs the manager-period
 *      rollup with the commissioner FROZEN-override, so a correction on a frozen period is NEVER silently
 *      swallowed by the freeze gate (surfaced via `frozenOverride` + the audit `detail`).
 *
 * The ENGINE is byte-untouched: these handlers only WRITE the two feed-gap rows (`manual_stat_player_match`,
 * `rating_player_match` source='manual') the existing adapter + resolver already consume.
 */
import type { SessionManagerOutcome } from "@app/auth";
import type { CommishAuditTargetRef } from "@app/shared";
import type { StatOverrides } from "@app/recompute";
import type { RecordCommishAuditInput } from "./recordCommishAudit";
import { formatStatOverrideDelta, validateStatOverrides } from "./statOverrideExtra";

/** Minimal (match, player) context the write path validates + surfaces (frozen period → override note). */
export interface MatchPlayerContext {
  playerTeamId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  periodId: string | null;
  /** The match's fantasy period is frozen (`period.frozen_at` set) → the correction is a commissioner override. */
  periodFrozen: boolean;
}

/** B1: absolute, idempotent penalty counts for one (match, player). "Clear" is simply 0/0. */
export interface PenaltyWrite {
  matchId: string;
  playerId: string;
  penaltyWon: number;
  penaltyCommitted: number;
  reason: string;
  enteredByUserId: string | null;
}

/** B2: set a manual rating, or clear (DELETE) the manual override row. */
export type RatingWrite =
  | { kind: "set"; matchId: string; playerId: string; rating: number }
  | { kind: "clear"; matchId: string; playerId: string };

/** 2b: absolute sparse stat overlay for one (match, player). An EMPTY `overrides` map is "clear all". */
export interface StatCorrectionWrite {
  matchId: string;
  playerId: string;
  overrides: StatOverrides;
  reason: string;
  enteredByUserId: string | null;
}

/** The write port. Each `apply*` method persists the manual row + the audit row atomically (store-owned tx). */
export interface CommishStatStore {
  getManagerLeagueId(managerId: string): Promise<string | null>;
  getMatchPlayer(matchId: string, playerId: string): Promise<MatchPlayerContext | null>;
  applyPenalty(input: {
    write: PenaltyWrite;
    audit: RecordCommishAuditInput;
  }): Promise<{ auditId: string }>;
  applyRating(input: {
    write: RatingWrite;
    audit: RecordCommishAuditInput;
  }): Promise<{ auditId: string }>;
  /** 2b: the CURRENT stored overlay for a (match, player) — read to compute the audit's field-change delta. */
  getStatOverrides(matchId: string, playerId: string): Promise<StatOverrides>;
  applyStatCorrection(input: {
    write: StatCorrectionWrite;
    audit: RecordCommishAuditInput;
  }): Promise<{ auditId: string }>;
}

export interface CommishStatDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: CommishStatStore;
  /** The sync re-score trigger — recomputes the (match, player) score + the affected rollups (frozen-override).
   *  `scored` is false when the adapter's participant gate rejects the player (no feed footprint yet) — the write
   *  is stored + dirty but not yet reflected in the score; surfaced to the commissioner as `pending`. */
  rescore: (matchId: string, playerId: string) => Promise<{ scored: boolean }>;
}

export interface PenaltyBody {
  matchId: string;
  playerId: string;
  penaltyWon: number;
  penaltyCommitted: number;
  reason: string;
}

export interface RatingBody {
  matchId: string;
  playerId: string;
  /** A 0–10 value to set, or `null` to CLEAR (delete) the manual override row. */
  rating: number | null;
  reason: string;
}

export interface StatBody {
  matchId: string;
  playerId: string;
  /** The complete, absolute set of field overrides (bounded server-side to the 23-key allowlist + Int≥0).
   *  An EMPTY object clears all overrides; omitting a field the operator blanked clears just that field. */
  overrides: Record<string, number>;
  reason: string;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

const err = (status: number, error: string): HandlerResult => ({ status, body: { error } });
const MINUS = "−"; // − : matches the engine's breakdown strings (never ASCII '-')

/** The frozen-override note stamped on the audit `detail` + surfaced to the UI when the period is frozen. */
const FROZEN_NOTE =
  "Applied to a FROZEN period — commissioner override re-scored the result past the freeze gate.";

/**
 * Post-commit signal. The write + the `commish_audit` row have ALREADY committed (the store's `$transaction`
 * returned) by the time the synchronous re-score fires — so if that re-score THROWS, the correction is durable
 * but the leaderboard has not yet been restated. We must NOT let the throw become a bare 500: that would hide
 * the persisted write and read as "nothing happened", tempting a duplicate re-entry. Instead the handler catches
 * it and returns a distinguishable 200 partial-success (mirroring the existing `no_match_participation` shape),
 * carrying `restatePending: true`.
 *
 * Remedy = re-submit the identical correction. The writes are ABSOLUTE + idempotent (a penalty/rating is SET to
 * the same value, never accumulated — see the idempotent-SET proof), so a repeat is safe. For a FROZEN period it
 * is the ONLY restate path: the worker sweep runs WITHOUT the freeze override, so `dirty=true` alone will re-score
 * `score_player_match` but leave the frozen manager-period rollup (the leaderboard) stale until the write path
 * itself restates again with `allowFrozen`. This stays DISTINCT from a pre-write validation reject, which
 * persists nothing and returns a clean 4xx `{ error }`.
 */
const RESTATE_PENDING_WARNING = "restate_pending";
const RESTATE_PENDING_MESSAGE =
  "Correction saved and recorded in the audit log, but the automatic re-score failed — the leaderboard is not " +
  "yet restated. Re-submit the identical correction to restate; the write is absolute and idempotent, so " +
  "re-submitting is safe.";

/** Fire the post-commit sync re-score, converting a throw into the durable saved-but-restate-pending signal. */
async function fireRescore(
  rescore: CommishStatDeps["rescore"],
  matchId: string,
  playerId: string,
): Promise<{ scored: boolean; restatePending: boolean }> {
  try {
    const { scored } = await rescore(matchId, playerId);
    return { scored, restatePending: false };
  } catch (err) {
    // The row + audit already committed above; only the derived re-score failed. Surface it, don't 500.
    // HARD-1 F-A05: also record the swallowed error server-side — for a FROZEN period this re-score is
    // the ONLY restate path, so a repeated silent failure leaves the leaderboard stale with zero
    // operator signal. console.error reaches Render logs AND Sentry (the web instrumentation captures
    // console errors); this module stays framework-agnostic (no Sentry import) by design.
    console.error(
      `[commish.statCorrection] post-commit re-score failed for match=${matchId} player=${playerId}` +
        " — returning restatePending:",
      err,
    );
    return { scored: false, restatePending: true };
  }
}

/** Extra outcome fields for a 200 write response. restate-pending (re-score threw) takes precedence over the
 *  pending-feed-participation warning; a fully-scored write adds nothing. */
function outcomeFields(scored: boolean, restatePending: boolean): Record<string, unknown> {
  if (restatePending) {
    return {
      restatePending: true,
      warning: RESTATE_PENDING_WARNING,
      message: RESTATE_PENDING_MESSAGE,
    };
  }
  return scored ? {} : { warning: "no_match_participation" };
}

/** A commissioner or a rejection. Shared by both handlers, run BEFORE any body read/validation.
 *  Exported for the Thread-3a repair handlers (handleRosterRepair.ts) — one gate, one ordering. */
export type GatePass = { ok: true; managerId: string; userId: string | null; email: string | null };
export function gate(
  outcome: SessionManagerOutcome,
): GatePass | { ok: false; result: HandlerResult } {
  if (outcome.kind === "no-session") return { ok: false, result: err(401, "no_session") };
  if (outcome.kind !== "ok") return { ok: false, result: err(403, "forbidden") };
  if (!outcome.isCommissioner) return { ok: false, result: err(403, "forbidden") };
  return {
    ok: true,
    managerId: outcome.manager.id,
    userId: outcome.manager.userId,
    email: outcome.manager.email,
  };
}

/** The player's team must be one of the match's two teams — the "bad (match, player)" guard (mirrors the
 *  adapter's `teamInMatch` participant gate: a player paired with a match their team wasn't in is invalid). */
function playerInMatch(ctx: MatchPlayerContext): boolean {
  return (
    ctx.playerTeamId != null &&
    (ctx.playerTeamId === ctx.homeTeamId || ctx.playerTeamId === ctx.awayTeamId)
  );
}

/** Resolve + validate the (match, player) and the commissioner's league, or a typed rejection. */
async function resolveTarget(
  deps: CommishStatDeps,
  managerId: string,
  matchId: string,
  playerId: string,
): Promise<
  { ok: true; ctx: MatchPlayerContext; leagueId: string } | { ok: false; result: HandlerResult }
> {
  const ctx = await deps.store.getMatchPlayer(matchId, playerId);
  if (!ctx || !playerInMatch(ctx)) return { ok: false, result: err(404, "invalid_match_player") };
  const leagueId = await deps.store.getManagerLeagueId(managerId);
  if (!leagueId) return { ok: false, result: err(500, "no_league") };
  return { ok: true, ctx, leagueId };
}

function penaltyDelta(penaltyWon: number, penaltyCommitted: number): string {
  const net = penaltyWon * 2 - penaltyCommitted * 2;
  if (net === 0) return "0 pts";
  return net > 0 ? `+${net} pts` : `${MINUS}${Math.abs(net)} pts`;
}

// ── B1 — penalty entry ──────────────────────────────────────────────────────────────────────────
export async function handleCommishPenalty(
  deps: CommishStatDeps,
  body: PenaltyBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  const { matchId, playerId, penaltyWon, penaltyCommitted } = body;
  if (!matchId || !playerId) return err(400, "bad_request");
  if (body.reason.trim() === "") return err(400, "reason_required");
  const okCount = (n: number) => Number.isInteger(n) && n >= 0;
  if (!okCount(penaltyWon) || !okCount(penaltyCommitted)) return err(400, "bad_request");

  const t = await resolveTarget(deps, g.managerId, matchId, playerId);
  if (!t.ok) return t.result;

  const cleared = penaltyWon === 0 && penaltyCommitted === 0;
  const delta = penaltyDelta(penaltyWon, penaltyCommitted);
  const reason = body.reason.trim();
  const targetRef: CommishAuditTargetRef = { matchId, playerId };

  const { auditId } = await deps.store.applyPenalty({
    write: { matchId, playerId, penaltyWon, penaltyCommitted, reason, enteredByUserId: g.userId },
    audit: {
      leagueId: t.leagueId,
      actorUserId: g.userId,
      actionType: "penalty_applied",
      summary: cleared
        ? "Penalty entry cleared"
        : `Penalty entry: ${penaltyWon} won / ${penaltyCommitted} committed`,
      detail: t.ctx.periodFrozen ? FROZEN_NOTE : null,
      reason,
      targetRef,
      delta,
      reversible: true,
    },
  });

  // The write + audit have committed. Fire the sync re-score; a throw here becomes restate-pending, never a 500.
  const { scored, restatePending } = await fireRescore(deps.rescore, matchId, playerId);

  return {
    status: 200,
    body: {
      ok: true,
      penaltyWon,
      penaltyCommitted,
      delta,
      frozenOverride: t.ctx.periodFrozen,
      // scored=false ⇒ the player has no feed participation yet; the write is stored + dirty and will apply once
      // the feed records them. Surfaced (not hidden) so the 200 isn't read as "already reflected in the score".
      scored,
      ...outcomeFields(scored, restatePending),
      auditId,
    },
  };
}

// ── B2 — rating override ────────────────────────────────────────────────────────────────────────
export async function handleCommishRating(
  deps: CommishStatDeps,
  body: RatingBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  const { matchId, playerId, rating } = body;
  if (!matchId || !playerId) return err(400, "bad_request");
  if (body.reason.trim() === "") return err(400, "reason_required");
  const clearing = rating === null;
  if (!clearing && (typeof rating !== "number" || !Number.isFinite(rating))) {
    return err(400, "bad_request");
  }
  if (!clearing && (rating < 0 || rating > 10)) return err(400, "rating_out_of_range");

  const t = await resolveTarget(deps, g.managerId, matchId, playerId);
  if (!t.ok) return t.result;

  const reason = body.reason.trim();
  const targetRef: CommishAuditTargetRef = { matchId, playerId };
  const write: RatingWrite = clearing
    ? { kind: "clear", matchId, playerId }
    : { kind: "set", matchId, playerId, rating };

  const { auditId } = await deps.store.applyRating({
    write,
    audit: {
      leagueId: t.leagueId,
      actorUserId: g.userId,
      actionType: "rating_override",
      summary: clearing ? "Rating override cleared" : `Rating override → ${rating}`,
      detail: t.ctx.periodFrozen ? FROZEN_NOTE : null,
      reason,
      targetRef,
      delta: clearing ? "cleared" : `rating ${rating}`,
      reversible: true,
    },
  });

  // The write + audit have committed. Fire the sync re-score; a throw here becomes restate-pending, never a 500.
  const { scored, restatePending } = await fireRescore(deps.rescore, matchId, playerId);

  return {
    status: 200,
    body: {
      ok: true,
      rating: clearing ? null : rating,
      source: clearing ? null : "manual",
      frozenOverride: t.ctx.periodFrozen,
      scored,
      ...outcomeFields(scored, restatePending),
      auditId,
    },
  };
}

// ── 2b — general stat-line correction ─────────────────────────────────────────────────────────────
/**
 * Generalizes the Thread-2 write shape to N raw feed fields in ONE save: gate → validate (allowlist + Int≥0 +
 * reason) BEFORE any read → resolve+validate (match, player) → SET the absolute sparse overlay into
 * `manual_stat_player_match.extra.statOverrides` (read-modify-write, preserving `rolePlayed`; penalty columns
 * untouched) + exactly ONE `commish_audit` row in one transaction → the SAME synchronous re-score with the
 * FROZEN-period `allowFrozen` override + `restate_pending` post-commit-throw handling that Thread 2 uses.
 *
 * ENGINE byte-untouched: the write only lands the overlay the adapter already reads. The audit `delta` is the
 * raw field-change list (e.g. "goals feed→2 · assists 1→feed"), NOT a points total.
 */
export async function handleCommishStatCorrection(
  deps: CommishStatDeps,
  body: StatBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  const { matchId, playerId } = body;
  if (!matchId || !playerId) return err(400, "bad_request");
  if (body.reason.trim() === "") return err(400, "reason_required");
  if (typeof body.overrides !== "object" || body.overrides === null) return err(400, "bad_request");
  const v = validateStatOverrides(body.overrides);
  if (!v.ok) return err(400, v.error); // unknown_stat_key (typo/phantom) | bad_request (non-Int / negative)

  const t = await resolveTarget(deps, g.managerId, matchId, playerId);
  if (!t.ok) return t.result;

  const reason = body.reason.trim();
  const targetRef: CommishAuditTargetRef = { matchId, playerId };
  // The prior overlay drives the field-change delta only (cosmetic/audit). The write itself is absolute + does
  // its own in-tx read-modify-write, so a benign race on this read never affects the persisted state or points.
  const prior = await deps.store.getStatOverrides(matchId, playerId);
  const { delta, summary } = formatStatOverrideDelta(prior, v.overrides);

  const { auditId } = await deps.store.applyStatCorrection({
    write: { matchId, playerId, overrides: v.overrides, reason, enteredByUserId: g.userId },
    audit: {
      leagueId: t.leagueId,
      actorUserId: g.userId,
      actionType: "stat_correction",
      summary,
      detail: t.ctx.periodFrozen ? FROZEN_NOTE : null,
      reason,
      targetRef,
      delta,
      reversible: true,
    },
  });

  // The write + audit have committed. Fire the sync re-score; a throw here becomes restate-pending, never a 500.
  const { scored, restatePending } = await fireRescore(deps.rescore, matchId, playerId);

  return {
    status: 200,
    body: {
      ok: true,
      overrides: v.overrides,
      delta,
      frozenOverride: t.ctx.periodFrozen,
      scored,
      ...outcomeFields(scored, restatePending),
      auditId,
    },
  };
}
