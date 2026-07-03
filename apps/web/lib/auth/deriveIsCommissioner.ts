/**
 * Pure nav-gate predicate, split out of manager.ts so it can be unit-tested without pulling in
 * `@/lib/supabase/server` (which imports the `server-only` guard — that throws unconditionally outside
 * Next.js's RSC transform, so a plain Vitest import of manager.ts crashes regardless of which export the
 * test actually exercises).
 */
import { resolveCommissioner } from "@app/shared";
import type { SessionManagerOutcome } from "@app/auth";

/** The shared shell's nav-gate predicate, given whatever `getSessionManager()` already resolved. */
export function deriveIsCommissioner(outcome: SessionManagerOutcome): boolean {
  if (outcome.kind !== "ok") return false;
  return resolveCommissioner({
    isCommissioner: outcome.isCommissioner,
    email: outcome.manager.email,
  });
}
