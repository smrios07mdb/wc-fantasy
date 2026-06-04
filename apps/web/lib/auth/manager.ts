/**
 * `getSessionManager` / `requireManager` — the reusable session→manager primitives EVERY authenticated
 * route uses (the draft pick is the first caller; lineup-set / FAAB / admin will reuse them). They are
 * the thin IO edge: read the Supabase session (validated via `getUser()`), fetch the allowlist + the
 * managers via Prisma, then defer the decision to the pure `@app/auth` core.
 */
import { prisma } from "@app/db";
import {
  assertSessionManager,
  resolveSessionManager,
  type ResolvedManager,
  type SessionManagerOutcome,
} from "@app/auth";
import { createClient } from "@/lib/supabase/server";

export async function getSessionManager(): Promise<SessionManagerOutcome> {
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
}

/** Fail-fast variant: the resolved manager, or a typed `AuthError` the caller maps to 401/403. */
export async function requireManager(): Promise<ResolvedManager> {
  return assertSessionManager(await getSessionManager());
}
