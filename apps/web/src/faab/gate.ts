/**
 * The shared FAAB identity gate (the `/api/draft/pick` template): resolve the session → manager and
 * reject 401 (no session) / 403 (not allowlisted / no manager / not your manager) BEFORE any DB access.
 * Every FAAB write is a strict SELF op (scope "self") — a commissioner may NOT act on another manager's
 * waivers. Extracted (Prompt 48) so the bid route and the $0 free-agency route share ONE gate.
 */
import { canActAsManager, type SessionManagerOutcome } from "@app/auth";

export type FaabGateResult =
  | { ok: true; managerId: string }
  | { ok: false; status: number; error: string };

export async function faabGate(
  resolveManager: () => Promise<SessionManagerOutcome>,
  targetManagerId: string,
): Promise<FaabGateResult> {
  const outcome = await resolveManager();
  if (outcome.kind === "no-session") return { ok: false, status: 401, error: "no_session" };
  if (outcome.kind === "not-allowlisted")
    return { ok: false, status: 403, error: "not_allowlisted" };
  if (outcome.kind === "no-manager") return { ok: false, status: 403, error: "no_manager" };
  if (
    !canActAsManager({
      sessionManagerId: outcome.manager.id,
      targetManagerId,
      isCommissioner: outcome.isCommissioner,
      scope: "self",
    })
  ) {
    return { ok: false, status: 403, error: "not_your_manager" };
  }
  return { ok: true, managerId: outcome.manager.id };
}
