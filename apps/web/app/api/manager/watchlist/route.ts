/**
 * POST /api/manager/watchlist — toggle a private "star" on a player (T2 — Waiver Watchlist). Like
 * `/api/manager/display-name` and `/api/pool/pick` it adds ONLY identity: the framework-agnostic,
 * unit-tested `handleToggleWatch` resolves the session manager, rejects 401/403 BEFORE any DB access, then
 * idempotently sets / clears the star. This thin wrapper parses the body, builds the real deps (the Prisma
 * watchlist store + the session resolver), and maps the result to a NextResponse.
 *
 *   POST { playerId, watched } — watched:true stars (idempotent upsert), watched:false unstars (delete) → 200
 *
 * Status map: 401 no session · 403 not allowlisted / no manager · 400 malformed body · 200 toggled.
 *
 * SCOPE-AGNOSTIC + DECOUPLED (locked DESIGN decision a): accepts ANY valid playerId — NO free-agent /
 * roster / phase / budget / cap check. A star never reads or mutates the bidding, squad, batch, or budget
 * data, and triggers NO engine / recompute / dirty-mark / realtime broadcast. The managerId is resolved
 * SERVER-SIDE from the session — a client-supplied managerId is never trusted (the body carries none).
 *
 * RLS (owner-only, defence-in-depth): the `watchlist` policies were migrated in 20260630120000_watchlist
 * (one SELECT + INSERT/UPDATE/DELETE, all own-manager, keyed on auth.uid() = manager.user_id). This route
 * runs through the Prisma OWNER role (which bypasses RLS) and self-scopes by the session managerId.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { createPrismaWatchlistStore } from "@/src/manager/watchlistStore";
import { handleToggleWatch, parseWatchlistBody } from "@/src/manager/handleWatchlist";

export const dynamic = "force-dynamic";

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createPrismaWatchlistStore(prisma),
  };
}

export async function POST(request: Request) {
  const body = parseWatchlistBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleToggleWatch(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
