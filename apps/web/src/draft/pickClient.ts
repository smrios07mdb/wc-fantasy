/**
 * The thin AUTHED pick client (ARCHITECTURE.md §5/§6). The ONLY write path from the draft room is the
 * existing, UNCHANGED `POST /api/draft/pick` — this just builds the request with the session manager's
 * id and maps the response (the auth 401/403 gate + the typed `DraftError` family) to a discriminated
 * result the UI can render. No controller change; presentation + the call, nothing more. `fetch` is
 * injected so it is unit-testable without a network.
 */
import type { PickResult } from "@app/draft";

export interface PickRequestBody {
  draftId: string;
  managerId: string;
  playerId: string;
}

/** The typed failure the UI surfaces. `code` is the server's `error` string (auth gate or DraftError
 *  class name); `status` is the HTTP status; `message` is a friendly, human-readable line. */
export interface DraftPickError {
  code: string;
  status: number;
  message: string;
}

export type SubmitPickResult =
  | { ok: true; pick: PickResult }
  | { ok: false; error: DraftPickError };

/** Friendly copy per server error code (auth gate codes + Prompt-06 DraftError class names). */
const MESSAGES: Record<string, string> = {
  // auth gate (handlePick.ts)
  no_session: "Your session expired — please sign in again.",
  not_allowlisted: "This account isn't on the league allowlist.",
  no_manager: "No manager is linked to your account.",
  not_your_manager: "You can only draft for your own team.",
  bad_request: "That pick was malformed — please try again.",
  // controller DraftError family
  NotYourTurnError: "It's not your turn to pick.",
  PlayerUnavailableError: "That player has already been drafted.",
  PositionFullError: "That position is already full on your roster.",
  DraftNotActiveError: "The draft isn't active right now.",
  DraftNotReadyError: "The draft isn't ready to start.",
  PickConflictError: "Someone just picked — the board moved on. Try again.",
  DraftNotFoundError: "Draft not found.",
  UnknownPlayerError: "That player couldn't be found.",
  // client-side
  network: "Network error — check your connection and try again.",
  unknown: "Couldn't make that pick. Please try again.",
};

function errorFor(status: number, raw: unknown): DraftPickError {
  const code =
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { error?: unknown }).error === "string"
      ? (raw as { error: string }).error
      : "unknown";
  const serverMessage =
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { message?: unknown }).message === "string"
      ? (raw as { message: string }).message
      : undefined;
  return { code, status, message: MESSAGES[code] ?? serverMessage ?? MESSAGES.unknown! };
}

export async function submitDraftPick(
  body: PickRequestBody,
  deps: { fetch: typeof fetch },
): Promise<SubmitPickResult> {
  let response: Response;
  try {
    response = await deps.fetch("/api/draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "network", status: 0, message: MESSAGES.network! } };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, pick: payload as PickResult };
  }
  return { ok: false, error: errorFor(response.status, payload) };
}
