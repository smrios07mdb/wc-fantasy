/**
 * The plain data the pure auth-decision core operates on. NONE of these touch Supabase, Prisma, the
 * clock, or env — the edge (apps/web) reads the Supabase session + the DB rows and hands them in here,
 * mirroring the pure-core pattern of @app/scoring / @app/draft. See {@link ./resolve} / {@link ./authz}.
 */

/** The authenticated identity, normalized from the Supabase session at the edge. `userId` is the
 *  Supabase auth user id (`auth.users.id`); `email` is the verified magic-link / OAuth email. */
export interface SessionIdentity {
  userId: string;
  email: string;
}

/** One row of the league allowlist (ARCHITECTURE §4 `allowlist_email` — the "private by allowlist"
 *  gate of §6). Only the email is load-bearing for the gate; the rest of the row is edge concern. */
export interface AllowlistEntry {
  email: string;
}

/**
 * A league manager as the resolver needs it. `userId` is `manager.user_id` (→ `app_user.id`); `email`
 * is the LINKED `app_user`'s email, carried so the resolver can match on the stable email key as well
 * as the id (the robust fallback for the unpinned link ceremony — see {@link ./resolve}).
 */
export interface ManagerRecord {
  id: string;
  userId: string | null;
  email: string | null;
  isCommissioner: boolean;
  displayName: string;
}

/** The resolved manager (the success payload of {@link ./resolve.resolveSessionManager}). */
export interface ResolvedManager {
  manager: ManagerRecord;
  isCommissioner: boolean;
}

/**
 * The typed outcome of resolving a request's session to a league manager — a discriminated union so
 * the edge can map each case to a distinct HTTP status (no session → 401; the rest → 403), mirroring
 * the Prompt-06 `DraftError` family. The `ok` case carries the manager + the commissioner flag.
 */
export type SessionManagerOutcome =
  | ({ kind: "ok" } & ResolvedManager)
  | { kind: "no-session" }
  | { kind: "not-allowlisted"; email: string }
  | { kind: "no-manager"; userId: string };
