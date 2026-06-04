/**
 * The authz assertion (the PURE identity gate Prompt 06 deferred). Given the session manager id, a
 * target manager id, and the commissioner flag → may the session act as the target?
 *
 * Scope-gated override (the chosen model): a "self" op is strict self-match (the session manager IS
 * the target); an "admin"-scoped op additionally lets a commissioner act on ANY manager. The draft
 * pick passes `scope: "self"` → no override (a commissioner may not pick for someone else); the future
 * admin surface (allowlist editor, manual corrections) passes `scope: "admin"`. Default is "self" —
 * the safe, least-authority default. The controller still owns turn/ownership/legality; this only
 * answers "is it you (or, for an admin op, the commissioner)?".
 */
import { NotYourManagerError } from "./errors";

export type AuthzScope = "self" | "admin";

export interface ActAsArgs {
  sessionManagerId: string;
  targetManagerId: string;
  isCommissioner: boolean;
  /** "self" (default): strict self-match. "admin": a commissioner may act on any manager. */
  scope?: AuthzScope;
}

export function canActAsManager(args: ActAsArgs): boolean {
  if (args.sessionManagerId === args.targetManagerId) return true;
  // Self-mismatch: only a commissioner, and only on an admin-scoped op, may override.
  return (args.scope ?? "self") === "admin" && args.isCommissioner;
}

/** Throw-style wrapper: void if allowed, else {@link NotYourManagerError}. */
export function assertCanActAsManager(args: ActAsArgs): void {
  if (!canActAsManager(args)) {
    throw new NotYourManagerError(args.sessionManagerId, args.targetManagerId);
  }
}
