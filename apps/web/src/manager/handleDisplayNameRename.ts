/**
 * Framework-agnostic handler for `POST /api/manager/display-name`. Mirrors the `handleDraftPick`
 * pattern: IO injected, returns a plain `{ status, body }`, no NextResponse / Supabase / Prisma
 * imports. This is the ONLY place identity + validation + rename are orchestrated; the thin
 * Next.js route wires real deps and maps the result to a NextResponse.
 *
 *   1. resolve session → manager (injected edge);
 *   2. reject 401/403 BEFORE any mutation;
 *   3. assert self (scope "self") — the target is always the session manager;
 *   4. validate the new name;
 *   5. call `deps.update` → on NameTakenError → 409.
 */
import { canActAsManager, type SessionManagerOutcome } from "@app/auth";
import { validateDisplayName } from "./displayName";

/** Thrown by deps.update when the DB rejects the name as already taken in the league. */
export class NameTakenError extends Error {
  override readonly name = "NameTakenError" as const;
  constructor() {
    super("name_taken");
  }
}

export interface RenameRequestBody {
  name: string;
}

export interface RenameHandlerResult {
  status: number;
  body: unknown;
}

export interface RenameHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  /**
   * Write `display_name` for the given manager. Throws `NameTakenError` if the new name
   * conflicts with another manager's name in the same league (case-insensitive). Throws any
   * other error up for the caller to propagate.
   */
  update: (managerId: string, displayName: string) => Promise<void>;
}

export async function handleDisplayNameRename(
  deps: RenameHandlerDeps,
  body: RenameRequestBody,
): Promise<RenameHandlerResult> {
  // (1) Identity, resolved at the edge. Reject 401/403 BEFORE any mutation.
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // (2) Self-only authz: the target is always the session manager (no commissioner-renames path).
  if (
    !canActAsManager({
      sessionManagerId: outcome.manager.id,
      targetManagerId: outcome.manager.id,
      isCommissioner: outcome.isCommissioner,
      scope: "self",
    })
  ) {
    return { status: 403, body: { error: "not_your_manager" } };
  }

  // (3) Validate the new name (pure, no IO).
  const validated = validateDisplayName(body.name);
  if (!validated.ok) return { status: 400, body: { error: validated.reason } };

  // (4) Write — the update dep maps the DB unique-violation → NameTakenError.
  try {
    await deps.update(outcome.manager.id, validated.value);
    return { status: 200, body: { displayName: validated.value } };
  } catch (error) {
    if (error instanceof NameTakenError) return { status: 409, body: { error: "name_taken" } };
    throw error;
  }
}
