/**
 * Thread 3a — SAFE roster/lineup repair handlers behind `POST /api/commish/roster` (add / add-drop / trim)
 * and `POST /api/commish/lineup`. Framework-agnostic (plain `{ status, body }`), mirroring
 * `handleStatCorrection.ts`; the thin routes wire the real deps.
 *
 * The handlers ORCHESTRATE ONLY — every decision is delegated VERBATIM to the `@app/commish-core` runners
 * (`runRosterOverride` / `runTrimOverride` / `runLineupOverride`), which reuse the `@app/faab` /
 * `@app/lineup` validators + mutation primitives. Nothing is re-derived here.
 *
 * THE 3a SAFETY CONTRACT (design/COMMISH_3_roster_lineup_repair.md, cleared):
 *   • the dangerous bypasses are HARDCODED OFF — `allowPostKickoff: false`, `allowLocked: false`,
 *     `allowLockedSlot: false` are literals in this file, NEVER read from the request body. A smuggled
 *     body flag is ignored by construction. The `app.commish_override` GUC is therefore never set on any
 *     path reachable from here (the GUC lines in the primitives are gated on those flags).
 *   • a locked-slot attempt FAILS CLOSED: a clean 409-class error, zero writes, and the message states
 *     the move needs the deferred dangerous path (3b / the CLI's --allow-locked-slot|--allow-post-kickoff).
 *   • audit is POST-MUTATION in its own transaction (B4 — the reused primitives own their `$transaction`
 *     and accept no injected audit insert; folding it in would mean editing a primitive). A failed audit
 *     write is surfaced LOUDLY as 200 `audit_pending` carrying the COMPLETE would-be payload for manual
 *     recovery — never a bare 500, never a silent unlogged mutation.
 *   • restate is POST-COMMIT (A6): `recomputeManagerPeriod(..., { allowFrozen: true })` +
 *     `markManagerPeriodProcessed` + `recomputeStanding` via the injected `restate`. A throw becomes
 *     `restate_pending` (Thread-2 `fireRescore` pattern), never a bare 500.
 */
import {
  runRosterOverride,
  runTrimOverride,
  runLineupOverride,
  type RosterDeps,
  type TrimDeps,
} from "@app/commish-core";
import type { LineupStore } from "@app/lineup";
import type { CommishAuditTargetRef } from "@app/shared";
import type { RecordCommishAuditInput } from "./recordCommishAudit";
import { gate, type CommishStatDeps, type HandlerResult } from "./handleStatCorrection";

// ── ports ─────────────────────────────────────────────────────────────────────────────

/** The repair store port: name/target resolution + the VERBATIM runner store ports + the post-mutation
 *  audit writer + the conservative restate scope read. IO only — the handlers stay pure. */
export interface CommishRepairStore {
  /** The target manager's league + display name (the runner's team label), or null if unknown. */
  getManagerRef(managerId: string): Promise<{ leagueId: string; displayName: string } | null>;
  /** Display names for the given player ids (absent id = unknown player). */
  getPlayerNames(playerIds: readonly string[]): Promise<Record<string, string>>;
  /** A period's label for the pinned-period plan/audit trail, or null if unknown. */
  getPeriodRef(periodId: string): Promise<{ id: string; label: string } | null>;
  /** The runner store ports — the SAME prisma stores the live routes use, passed through verbatim. */
  faGrant: RosterDeps["store"];
  faabRelease: TrimDeps["store"];
  lineup: LineupStore;
  /** The add target's relevant fixture (per-player kickoff guard) — the CLI's makeGetAddMatch shape. */
  getAddMatch: RosterDeps["getAddMatch"];
  /** POST-MUTATION audit insert (its own transaction — see the module doc / B4). */
  recordAudit(input: RecordCommishAuditInput): Promise<{ id: string }>;
  /** The conservative B3 restate scope for roster ops: the league's not-closed period ids. */
  getNotClosedPeriodIds(leagueId: string): Promise<string[]>;
}

export interface CommishRepairDeps {
  resolveManager: CommishStatDeps["resolveManager"];
  now: () => Date;
  store: CommishRepairStore;
  /** Post-commit restate: `recomputeManagerPeriod({allowFrozen:true})` + `markManagerPeriodProcessed`
   *  per period, then `recomputeStanding` once — `createCommishRestate`. A throw ⇒ `restate_pending`. */
  restate: (managerId: string, periodIds: readonly string[]) => Promise<void>;
}

// ── bodies (shape-parsed by the route; semantics validated here) ──────────────────────

export type RosterRepairBody =
  | {
      kind: "add";
      managerId: string;
      addPlayerId: string;
      dropPlayerId: string | null;
      /** Optional commissioner period pin (SAFE — re-scopes only the snapshot/kickoff READ instant). */
      periodId: string | null;
      reason: string;
      /** false = dry-run (the runner's `planned` status); true = execute. */
      apply: boolean;
    }
  | {
      kind: "trim";
      managerId: string;
      dropPlayerIds: string[];
      reason: string;
      apply: boolean;
    };

export interface LineupRepairBody {
  managerId: string;
  periodId: string;
  starterIds: string[];
  reason: string;
  apply: boolean;
}

// ── shared plumbing ───────────────────────────────────────────────────────────────────

const err = (status: number, error: string): HandlerResult => ({ status, body: { error } });
const errMsg = (status: number, error: string, message: string): HandlerResult => ({
  status,
  body: { error, message },
});
const MINUS = "−"; // matches the engine's breakdown strings (never ASCII '-')

/** Appended to lock-class rejections so the operator knows the SAFE console cannot do this by design. */
const DEFERRED_NOTE =
  " — this move touches a locked-by-play slot (or a post-kickoff add) and requires the deferred " +
  "dangerous path (3b / the CLI's --allow-locked-slot / --allow-post-kickoff); the SAFE console never " +
  "performs it.";

/** Runner refusal codes that mean "the lock-on-play / played-state latch stopped you" — the 3a boundary. */
const LOCK_CLASS =
  /^(release-locked|forfeit-requires-confirm|played-player-started|voided-player-started)/;

const AUDIT_PENDING_MESSAGE =
  "Repair applied, but the audit-ledger write failed — the complete audit payload is attached; " +
  "re-record it manually (or re-run once the ledger is reachable). The mutation itself is durable.";
const RESTATE_PENDING_MESSAGE =
  "Repair applied and recorded, but the automatic restate failed — the leaderboard is not yet " +
  "restated. Re-submit the identical repair (it will skip idempotently) or run the recompute job.";

/** Post-mutation audit + post-commit restate, folded into the 200 body (never a bare 500). */
async function settleAppliedResponse(args: {
  deps: CommishRepairDeps;
  managerId: string;
  restatePeriodIds: readonly string[];
  audit: RecordCommishAuditInput;
  plan: unknown;
}): Promise<HandlerResult> {
  const { deps, audit } = args;
  let auditId: string | null = null;
  let auditPending = false;
  try {
    auditId = (await deps.store.recordAudit(audit)).id;
  } catch {
    auditPending = true; // the mutation is durable; surface the full payload below
  }
  let restatePending = false;
  try {
    await deps.restate(args.managerId, args.restatePeriodIds);
  } catch {
    restatePending = true;
  }
  return {
    status: 200,
    body: {
      ok: true,
      status: "applied",
      plan: args.plan,
      auditId,
      ...(auditPending
        ? { auditPending: true, warning: "audit_pending", message: AUDIT_PENDING_MESSAGE, audit }
        : {}),
      ...(restatePending
        ? {
            restatePending: true,
            ...(auditPending
              ? {}
              : { warning: "restate_pending", message: RESTATE_PENDING_MESSAGE }),
          }
        : {}),
    },
  };
}

// ── POST /api/commish/roster — add / add-drop / trim ──────────────────────────────────

export async function handleCommishRosterRepair(
  deps: CommishRepairDeps,
  body: RosterRepairBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  if (typeof body.reason !== "string" || body.reason.trim() === "") {
    return err(400, "reason_required");
  }
  const reason = body.reason.trim();

  if (body.kind === "add") {
    if (!body.managerId || !body.addPlayerId) return err(400, "bad_request");
  } else if (body.kind === "trim") {
    if (!body.managerId || body.dropPlayerIds.length === 0) return err(400, "bad_request");
  } else {
    return err(400, "bad_request");
  }

  const managerRef = await deps.store.getManagerRef(body.managerId);
  if (!managerRef) return err(404, "unknown_manager");

  const actor = { email: g.email, isCommissioner: true };
  const now = deps.now();

  if (body.kind === "add") {
    const ids = body.dropPlayerId ? [body.addPlayerId, body.dropPlayerId] : [body.addPlayerId];
    const names = await deps.store.getPlayerNames(ids);
    const addName = names[body.addPlayerId];
    const dropName = body.dropPlayerId ? names[body.dropPlayerId] : null;
    if (!addName || (body.dropPlayerId && !dropName)) return err(404, "invalid_player");

    let pinned: { id: string; label: string } | null = null;
    if (body.periodId !== null) {
      pinned = await deps.store.getPeriodRef(body.periodId);
      if (!pinned) return err(404, "invalid_period");
    }

    const res = await runRosterOverride(
      {
        now,
        store: deps.store.faGrant,
        getAddMatch: deps.store.getAddMatch,
        log: () => {}, // the persisted commish_audit row below is the web audit trail
      },
      {
        actor,
        managerId: body.managerId,
        teamLabel: managerRef.displayName,
        addId: body.addPlayerId,
        addName,
        dropId: body.dropPlayerId,
        dropName: dropName ?? null,
        reason,
        apply: body.apply,
        // 3a SAFE hardcode: the kickoff integrity guard stays armed. NEVER sourced from the body.
        allowPostKickoff: false,
        pinnedPeriodId: pinned?.id ?? null,
        pinnedPeriodLabel: pinned?.label ?? null,
        timestamp: now.toISOString(),
      },
    );

    switch (res.status) {
      case "not-found":
        return errMsg(404, "not_found", res.reason);
      case "refused":
        return errMsg(
          409,
          "repair_refused",
          LOCK_CLASS.test(res.reason) ? res.reason + DEFERRED_NOTE : res.reason,
        );
      case "blocked":
        return errMsg(409, "kickoff_blocked", res.reason + DEFERRED_NOTE);
      case "conflict":
        return errMsg(409, "conflict", res.reason);
      case "planned":
        return { status: 200, body: { ok: true, status: "planned", plan: res.plan } };
      case "skipped":
        return {
          status: 200,
          body: { ok: true, status: "skipped", reason: res.reason, plan: res.plan },
        };
      case "applied": {
        const delta = dropName ? `+${addName} / ${MINUS}${dropName}` : `+${addName}`;
        const targetRef: CommishAuditTargetRef = { managerId: body.managerId };
        const notClosed = await deps.store.getNotClosedPeriodIds(managerRef.leagueId);
        const restateIds =
          pinned && !notClosed.includes(pinned.id) ? [...notClosed, pinned.id] : notClosed;
        return settleAppliedResponse({
          deps,
          managerId: body.managerId,
          restatePeriodIds: restateIds,
          plan: res.plan,
          audit: {
            leagueId: managerRef.leagueId,
            actorUserId: g.userId,
            actionType: "roster_repair",
            summary: dropName
              ? `Roster repair: +${addName} / ${MINUS}${dropName} (${managerRef.displayName})`
              : `Roster repair: +${addName} (${managerRef.displayName})`,
            detail:
              "window+eligibility+drop-lock bypass" +
              (pinned ? ` · period pinned: ${pinned.label}` : ""),
            reason,
            targetRef,
            delta,
            reversible: true,
          },
        });
      }
    }
  }

  // kind === "trim" — drop-only release of UNLOCKED players (allowLocked hardcoded false).
  const names = await deps.store.getPlayerNames(body.dropPlayerIds);
  const res = await runTrimOverride(
    { now, store: deps.store.faabRelease, log: () => {} },
    {
      actor,
      managerId: body.managerId,
      teamLabel: managerRef.displayName,
      selection: { kind: "drop", ids: body.dropPlayerIds },
      nameOf: names,
      reason,
      apply: body.apply,
      // 3a SAFE hardcode: lock-on-play is NEVER relaxed here (the GUC path is unreachable).
      allowLocked: false,
      timestamp: now.toISOString(),
    },
  );

  switch (res.status) {
    case "not-found":
      return errMsg(404, "not_found", res.reason);
    case "refused":
      return errMsg(
        409,
        "repair_refused",
        LOCK_CLASS.test(res.reason) ? res.reason + DEFERRED_NOTE : res.reason,
      );
    case "planned":
      return { status: 200, body: { ok: true, status: "planned", plan: res.plan } };
    case "applied": {
      const dropNames = res.plan.dropNames;
      const targetRef: CommishAuditTargetRef = { managerId: body.managerId };
      return settleAppliedResponse({
        deps,
        managerId: body.managerId,
        restatePeriodIds: await deps.store.getNotClosedPeriodIds(managerRef.leagueId),
        plan: res.plan,
        audit: {
          leagueId: managerRef.leagueId,
          actorUserId: g.userId,
          actionType: "roster_repair", // reused for trim (cleared) — NO union edit, NO migration
          summary: `Roster trim: ${dropNames.length} released (${managerRef.displayName})`,
          detail: `trim:true · drop-lock bypass · ${dropNames.length} released`,
          reason,
          targetRef,
          delta: `trim: ${dropNames.map((n) => `${MINUS}${n}`).join(", ")}`,
          reversible: true,
        },
      });
    }
  }
}

// ── POST /api/commish/lineup — XI edit via the in-memory edit-window relax ────────────

export async function handleCommishLineupRepair(
  deps: CommishRepairDeps,
  body: LineupRepairBody,
): Promise<HandlerResult> {
  const g = gate(await deps.resolveManager());
  if (!g.ok) return g.result;

  if (typeof body.reason !== "string" || body.reason.trim() === "") {
    return err(400, "reason_required");
  }
  const reason = body.reason.trim();
  if (!body.managerId || !body.periodId || body.starterIds.length === 0) {
    return err(400, "bad_request");
  }

  const managerRef = await deps.store.getManagerRef(body.managerId);
  if (!managerRef) return err(404, "unknown_manager");
  const period = await deps.store.getPeriodRef(body.periodId);
  if (!period) return err(404, "invalid_period");

  const names = await deps.store.getPlayerNames(body.starterIds);
  const nameOf = (id: string) => names[id] ?? id;
  const now = deps.now();

  const res = await runLineupOverride(
    { now, store: deps.store.lineup, log: () => {} },
    {
      actor: { email: g.email, isCommissioner: true },
      managerId: body.managerId,
      teamLabel: managerRef.displayName,
      periodId: period.id,
      periodLabel: period.label,
      starterIds: body.starterIds,
      starterNames: body.starterIds.map(nameOf),
      reason,
      apply: body.apply,
      // 3a SAFE hardcode: the lock-on-play latch is NEVER relaxed — `saveLineup` runs its own latch
      // re-check and the `SET LOCAL app.commish_override` line in the store never executes.
      allowLockedSlot: false,
      timestamp: now.toISOString(),
    },
  );

  switch (res.status) {
    case "not-found":
      return errMsg(404, "not_found", res.reason);
    case "refused":
      return errMsg(
        409,
        "repair_refused",
        LOCK_CLASS.test(res.reason) ? res.reason + DEFERRED_NOTE : res.reason,
      );
    case "conflict":
      // the store's own latch re-check: a locked-by-play slot would change — fail closed, 3b territory.
      return errMsg(409, "conflict", res.reason + DEFERRED_NOTE);
    case "planned":
      return { status: 200, body: { ok: true, status: "planned", plan: res.plan } };
    case "skipped":
      return {
        status: 200,
        body: { ok: true, status: "skipped", reason: res.reason, plan: res.plan },
      };
    case "applied": {
      const beforeSet = new Set(res.plan.before);
      const afterSet = new Set(res.plan.after);
      const promoted = res.plan.after.filter((id) => !beforeSet.has(id));
      const benched = res.plan.before.filter((id) => !afterSet.has(id));
      const benchedNames = await deps.store.getPlayerNames(benched);
      const label = (id: string) => names[id] ?? benchedNames[id] ?? id;
      const delta =
        promoted.length === 0 && benched.length === 0
          ? "XI: unchanged set"
          : `XI: ${[
              ...promoted.map((id) => `+${label(id)}`),
              ...benched.map((id) => `${MINUS}${label(id)}`),
            ].join(", ")}`;
      const targetRef: CommishAuditTargetRef = { managerId: body.managerId, periodId: period.id };
      return settleAppliedResponse({
        deps,
        managerId: body.managerId,
        restatePeriodIds: [period.id], // B3: the lineup repair restates EXACTLY the edited period
        plan: res.plan,
        audit: {
          leagueId: managerRef.leagueId,
          actorUserId: g.userId,
          actionType: "lineup_repair",
          summary: `Lineup repair: ${period.label} XI set (${managerRef.displayName})`,
          detail: "edit-window bypass",
          reason,
          targetRef,
          delta,
          reversible: true,
        },
      });
    }
  }
}
