/**
 * Session → manager resolution (the PURE core). Given the authenticated identity + the league's
 * allowlist + manager rows, decide the typed {@link SessionManagerOutcome}. The Supabase session read
 * and the Prisma fetch are the thin edges (apps/web); this function is a pure decision, unit-testable
 * with literals.
 *
 * Match order: allowlist FIRST (a non-allowlisted email is rejected regardless of any manager row),
 * then the manager link.
 *
 * The user_id ↔ manager LINK is matched on the Supabase auth uid (`manager.user_id === session.userId`)
 * OR — as a robust fallback for the UNPINNED provisioning ceremony — on the stable email key (the
 * linked `app_user.email === session.email`). Either key resolves the same manager — but if the two keys
 * resolve DIFFERENT managers, the resolver throws {@link AmbiguousManagerLinkError} rather than silently
 * binding the first match (a wrong bind is a correctness + privacy bug — one member acting on another's
 * row). The keys are therefore resolved INDEPENDENTLY so the conflict is detectable.
 *   TODO(confirm) §4/§6: pin the exact ceremony — does the commissioner pre-provision `manager` rows
 *   and link `user_id` on first allowlisted sign-in, or seed it directly; and is `app_user.id` set to
 *   the Supabase auth uid (so `manager.user_id` === the session uid) or an independent uuid (so only
 *   the email key matches)? Until pinned, BOTH keys are honored. Do NOT invent a self-serve wizard.
 *
 * Single-league assumption (ARCHITECTURE §4, permanent "one private league"): a user maps to at most
 * one manager, so the first match is THE manager — no league filter needed.
 */
import { isEmailAllowed, normalizeEmail } from "./allowlist";
import {
  AmbiguousManagerLinkError,
  NoManagerLinkedError,
  NoSessionError,
  NotAllowlistedError,
} from "./errors";
import type {
  AllowlistEntry,
  ManagerRecord,
  ResolvedManager,
  SessionIdentity,
  SessionManagerOutcome,
} from "./types";

export interface ResolveInput {
  session: SessionIdentity | null;
  allowlist: readonly AllowlistEntry[];
  managers: readonly ManagerRecord[];
}

export function resolveSessionManager(input: ResolveInput): SessionManagerOutcome {
  const { session, allowlist, managers } = input;
  if (!session) return { kind: "no-session" };

  // Allowlist gate FIRST — a non-allowlisted email is rejected regardless of any manager row.
  if (!isEmailAllowed(session.email, allowlist)) {
    return { kind: "not-allowlisted", email: session.email };
  }

  // Resolve EACH key independently so a cross-key conflict is DETECTABLE. (A single `.find` with an OR
  // predicate can't tell which key matched, so it would silently take whichever manager appears first.)
  // Link by Supabase uid, and by the stable email key (robust to the unpinned ceremony).
  const sessionEmail = normalizeEmail(session.email);
  const uidManager = managers.find((m) => m.userId !== null && m.userId === session.userId);
  const emailManager = managers.find(
    (m) => m.email !== null && normalizeEmail(m.email) === sessionEmail,
  );

  // FAIL LOUD on an ambiguous identity: the uid links one manager and the email links a DIFFERENT one.
  // Silently binding the first would bind one member to another's row (a correctness + privacy bug).
  // This is a data-integrity breach (a corrupt/stale link) for the commissioner to repair — not a
  // graceful user-facing outcome — so it throws (→ 500) rather than returning a typed outcome.
  if (uidManager && emailManager && uidManager.id !== emailManager.id) {
    throw new AmbiguousManagerLinkError(session.userId, uidManager.id, emailManager.id);
  }

  // Either key resolves the SAME manager (prefer the uid match; identical when both are present).
  const manager = uidManager ?? emailManager;
  if (!manager) return { kind: "no-manager", userId: session.userId };

  return { kind: "ok", manager, isCommissioner: manager.isCommissioner };
}

/** Throw-style wrapper for routes that prefer fail-fast: the resolved manager, or the typed error. */
export function assertSessionManager(outcome: SessionManagerOutcome): ResolvedManager {
  switch (outcome.kind) {
    case "ok":
      return { manager: outcome.manager, isCommissioner: outcome.isCommissioner };
    case "no-session":
      throw new NoSessionError();
    case "not-allowlisted":
      throw new NotAllowlistedError(outcome.email);
    case "no-manager":
      throw new NoManagerLinkedError(outcome.userId);
  }
}
