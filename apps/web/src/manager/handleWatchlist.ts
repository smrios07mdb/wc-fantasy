/**
 * Framework-agnostic handler for `POST /api/manager/watchlist` (T2 — Waiver Watchlist). Mirrors
 * `handleDisplayNameRename`: IO injected, returns a plain `{ status, body }`, no NextResponse / Supabase /
 * Prisma imports. This is the ONLY place identity + the star toggle are orchestrated; the thin Next.js
 * route wires real deps and maps the result to a NextResponse.
 *
 *   1. resolve session → manager (injected edge);
 *   2. reject 401/403 BEFORE any DB access;
 *   3. the star is ALWAYS for the session manager's own id — the client never supplies a managerId;
 *   4. watched:true → idempotent set (upsert); watched:false → idempotent clear (delete) → 200.
 *
 * SCOPE-AGNOSTIC by design (the locked DESIGN decision a): this accepts ANY valid playerId and adds NO
 * free-agent / roster / phase check — a star is a personal bookmark, fully DECOUPLED from the budget,
 * squad, bids, and scoring. The handler reads/mutates ONLY the injected watchlist store; it has no other
 * IO dependency, so it structurally cannot touch any other table.
 */
import type { SessionManagerOutcome } from "@app/auth";

/** The DB edge the handler drives. Injected so the handler stays pure + unit-testable. */
export interface WatchlistStore {
  /** Idempotent: ensure a (managerId, playerId) star exists. Resolves the row's league_id server-side. */
  setWatched(managerId: string, playerId: string): Promise<void>;
  /** Idempotent: ensure no (managerId, playerId) star exists (a missing row is a no-op). */
  clearWatched(managerId: string, playerId: string): Promise<void>;
}

export interface WatchlistRequestBody {
  playerId: string;
  watched: boolean;
}

export interface WatchlistHandlerResult {
  status: number;
  body: unknown;
}

export interface WatchlistHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: WatchlistStore;
}

/** Total body parser — returns null on any malformed shape (the route maps null → 400 bad_request). */
export function parseWatchlistBody(raw: unknown): WatchlistRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.playerId !== "string" || b.playerId.length === 0) return null;
  if (typeof b.watched !== "boolean") return null;
  return { playerId: b.playerId, watched: b.watched };
}

export async function handleToggleWatch(
  deps: WatchlistHandlerDeps,
  body: WatchlistRequestBody,
): Promise<WatchlistHandlerResult> {
  // (1) Identity, resolved at the edge. Reject 401/403 BEFORE any DB access.
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session") return { status: 401, body: { error: "no_session" } };
  if (outcome.kind === "not-allowlisted")
    return { status: 403, body: { error: "not_allowlisted" } };
  if (outcome.kind === "no-manager") return { status: 403, body: { error: "no_manager" } };

  // (2) Self-only: the star is ALWAYS for the session manager's own id (the body carries no managerId).
  const managerId = outcome.manager.id;

  // (3) Idempotent toggle. No budget / cap / phase / free-agent checks — a star costs and claims nothing.
  if (body.watched) {
    await deps.store.setWatched(managerId, body.playerId);
  } else {
    await deps.store.clearWatched(managerId, body.playerId);
  }
  return { status: 200, body: { ok: true, watched: body.watched } };
}
