/**
 * PURE access gate for the `/commish` console — the first commissioner-only PAGE in the app. Extracted from
 * page.tsx so the gate decision is unit-testable with an injected session outcome (no Supabase, no Prisma),
 * mirroring the injected-outcome route-handler tests (handleStartDraft).
 *
 * Decision (matches the codebase's uniform redirect convention — no page uses notFound()):
 *   • no session            → redirect /sign-in
 *   • any other non-`ok`    → redirect /auth/denied  (not-allowlisted / no-manager collapse here)
 *   • logged-in NON-commish → redirect /auth/denied
 *   • commissioner          → ok (carry the manager id + name for the loader)
 *
 * "Commissioner" is `resolveCommissioner` (the SAME predicate the worker CLI uses): the `is_commissioner`
 * flag OR the known commissioner email. Using the shared predicate keeps the web gate and the CLI gate from
 * ever drifting.
 */
import { resolveCommissioner } from "@app/shared";
import type { SessionManagerOutcome } from "@app/auth";

export type CommishAccess =
  | { kind: "ok"; managerId: string; displayName: string }
  | { kind: "redirect"; to: "/sign-in" | "/auth/denied" };

export function resolveCommishAccess(outcome: SessionManagerOutcome): CommishAccess {
  if (outcome.kind === "no-session") return { kind: "redirect", to: "/sign-in" };
  if (outcome.kind !== "ok") return { kind: "redirect", to: "/auth/denied" };
  const isCommish = resolveCommissioner({
    isCommissioner: outcome.isCommissioner,
    email: outcome.manager.email,
  });
  if (!isCommish) return { kind: "redirect", to: "/auth/denied" };
  return { kind: "ok", managerId: outcome.manager.id, displayName: outcome.manager.displayName };
}
