/**
 * The thin set-lineup client: the ONE write path from the screen. It POSTs the chosen XI to the gated
 * `POST /api/lineup` with the session manager id in the body (the server re-asserts ownership), and maps
 * the HTTP status + error code to a typed, user-surfaceable result. `fetch` is injected so the logic is
 * unit-testable with no real network (mirrors `@/src/draft/pickClient`).
 */
export interface LineupSubmitBody {
  managerId: string;
  periodId: string;
  starterIds: string[];
}

export interface LineupSubmitError {
  /** The server error code (`locked-player-moved`, `illegal-formation`, `no_session`, …) or `network`. */
  code: string;
  status: number;
  /** A message safe to show the manager (server-provided where available, else a friendly default). */
  message: string;
}

export type SubmitLineupResult = { ok: true } | { ok: false; error: LineupSubmitError };

const MESSAGES: Record<string, string> = {
  no_session: "Your session expired — please sign in again.",
  not_allowlisted: "You're not on this league's invite list.",
  no_manager: "Your account isn't linked to a manager in this league.",
  not_your_manager: "You can only set your own lineup.",
  network: "Network error — check your connection and try again.",
};

function readString(payload: unknown, key: string): string | undefined {
  if (typeof payload === "object" && payload !== null) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function errorFor(status: number, payload: unknown): LineupSubmitError {
  const code = readString(payload, "error") ?? "error";
  const message =
    readString(payload, "message") ??
    MESSAGES[code] ??
    "Couldn't save your lineup — please try again.";
  return { code, status, message };
}

export async function submitLineup(
  body: LineupSubmitBody,
  deps: { fetch: typeof fetch },
): Promise<SubmitLineupResult> {
  let response: Response;
  try {
    response = await deps.fetch("/api/lineup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "network", status: 0, message: MESSAGES.network! } };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true };
  return { ok: false, error: errorFor(response.status, payload) };
}
