/**
 * `getSessionManager` / `requireManager` — the reusable session→manager primitives EVERY authenticated
 * route uses (the draft pick is the first caller; lineup-set / FAAB / admin will reuse them). They are
 * the thin IO edge: read the Supabase session (validated via `getUser()`), fetch the allowlist + the
 * managers via Prisma, then defer the decision to the pure `@app/auth` core.
 *
 * `cache()`-wrapped (Thread 6): every feature layout now calls `getViewerIsCommissioner()` to gate the
 * shared shell's Commissioner nav entry, and the page body underneath typically calls `getSessionManager()`
 * again for its own auth gate — `cache()` collapses those to one Supabase + Prisma round-trip per request
 * (React's per-request memoization), not one per caller.
 */
import { cache } from "react";
import { prisma } from "@app/db";
import {
  assertSessionManager,
  resolveSessionManager,
  type ResolvedManager,
  type SessionManagerOutcome,
} from "@app/auth";
import { createClient } from "@/lib/supabase/server";
import { deriveIsCommissioner } from "@/lib/auth/deriveIsCommissioner";

export { deriveIsCommissioner };

export const getSessionManager = cache(async (): Promise<SessionManagerOutcome> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { kind: "no-session" };

  // Single private league (ARCHITECTURE §4, permanent): the league's managers fit in one cheap read,
  // and a user maps to at most one of them. The pure resolver matches by Supabase uid OR email.
  const [allowlist, managers] = await Promise.all([
    prisma.allowlistEmail.findMany({ select: { email: true } }),
    prisma.manager.findMany({
      select: {
        id: true,
        userId: true,
        isCommissioner: true,
        displayName: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  return resolveSessionManager({
    session: { userId: user.id, email: user.email },
    allowlist,
    managers: managers.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user?.email ?? null,
      isCommissioner: m.isCommissioner,
      displayName: m.displayName,
    })),
  });
});

/** Fail-fast variant: the resolved manager, or a typed `AuthError` the caller maps to 401/403. */
export async function requireManager(): Promise<ResolvedManager> {
  return assertSessionManager(await getSessionManager());
}

/** Thin IO edge for layouts: resolve the session (memoized) and gate the Commissioner nav entry. */
export async function getViewerIsCommissioner(): Promise<boolean> {
  return deriveIsCommissioner(await getSessionManager());
}
