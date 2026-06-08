/**
 * Typed auth errors. Mirrors the Prompt-06 `DraftError` family (subclass Error, carry `readonly`
 * fields, set `this.name`, share a base so a caller can catch the whole family). These let the
 * throw-style edge ({@link ./resolve.assertSessionManager} / {@link ./authz.assertCanActAsManager})
 * surface a SPECIFIC failure the route maps to a status: no session → 401; the rest → 403.
 */

/** Base class for every auth rejection. */
export class AuthError extends Error {}

/** No authenticated Supabase session on the request (→ 401). */
export class NoSessionError extends AuthError {
  constructor() {
    super("no authenticated session");
    this.name = "NoSessionError";
  }
}

/** Authenticated, but the email is not on the league allowlist (→ 403). Never silently admitted. */
export class NotAllowlistedError extends AuthError {
  constructor(readonly email: string) {
    super(`email ${email} is not on the league allowlist`);
    this.name = "NotAllowlistedError";
  }
}

/** Allowlisted + authenticated, but no `manager` row is linked to this user (→ 403). */
export class NoManagerLinkedError extends AuthError {
  constructor(readonly userId: string) {
    super(`no manager is linked to user ${userId}`);
    this.name = "NoManagerLinkedError";
  }
}

/**
 * Allowlisted + authenticated, but the user resolves to TWO DIFFERENT managers — one by the Supabase
 * uid, a different one by the email key. A should-never-happen data-integrity breach (a corrupt/stale
 * link). The resolver THROWS this rather than silently binding the first match, because binding the
 * wrong manager is a correctness + privacy bug (one member acting on another's row). Loud by design — it
 * surfaces as a 500 for the commissioner to repair the link, NOT a graceful 401/403 user flow.
 */
export class AmbiguousManagerLinkError extends AuthError {
  constructor(
    readonly userId: string,
    readonly uidManagerId: string,
    readonly emailManagerId: string,
  ) {
    super(
      `user ${userId} resolves to two managers: ${uidManagerId} by uid, ${emailManagerId} by email`,
    );
    this.name = "AmbiguousManagerLinkError";
  }
}

/** The session manager may not act as the target manager (→ 403). The identity gate Prompt 06
 *  deferred: the controller still owns turn/ownership/legality; this only asserts "is it you?". */
export class NotYourManagerError extends AuthError {
  constructor(
    readonly sessionManagerId: string,
    readonly targetManagerId: string,
  ) {
    super(`manager ${sessionManagerId} may not act as manager ${targetManagerId}`);
    this.name = "NotYourManagerError";
  }
}
