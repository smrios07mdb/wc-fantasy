/**
 * Pure landing-view selector (ARCHITECTURE §6) — the branch logic behind the auth-aware `/` front door,
 * kept DB/Supabase-free and unit-tested like the rest of the @app/auth-consuming edge (handlePick /
 * handleVsField). The page reads the Supabase session via `getSessionManager()` (the thin IO edge) and
 * hands the typed {@link SessionManagerOutcome} here to pick which of the four landing states to render.
 *
 * The load-bearing call: `no-manager` (allowlisted + valid session, but `manager.user_id` not yet
 * linked — the Prompt-07 provisioning seam) is its OWN state, NOT a denial. It points the member at the
 * commissioner, never at `/auth/denied`. Only `not-allowlisted` is a denial.
 */
import type { SessionManagerOutcome } from "@app/auth";

export type LandingView = "signin" | "hub" | "unlinked" | "denied";

export function selectLandingView(outcome: SessionManagerOutcome): LandingView {
  switch (outcome.kind) {
    case "no-session":
      return "signin";
    case "ok":
      return "hub";
    case "no-manager":
      return "unlinked";
    case "not-allowlisted":
      return "denied";
    default: {
      // Exhaustiveness guard: a new SessionManagerOutcome kind becomes a compile error here, so the
      // landing can never silently fall through to a wrong (e.g. denial) view.
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}
