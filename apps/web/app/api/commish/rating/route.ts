/**
 * POST /api/commish/rating — Thread 2 · B2. Commissioner-only manual rating override (0–10) for one (match,
 * player), or CLEAR (delete the manual row → the resolver falls back to balldontlie). Adds ONLY body parsing +
 * real deps: `handleCommishRating` (unit-tested) gates 401/403, validates the body + (match, player), UPSERTs
 * `rating_player_match` source='manual' (or DELETEs it) + a `commish_audit` row in one transaction, and fires
 * the sync re-score (frozen-override). ENGINE byte-untouched — the resolver already prefers the manual source.
 *
 * Body: { matchId, playerId, reason, rating }  where `rating` is a 0–10 number to set, OR `rating: null` /
 * `clear: true` to clear the override.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleCommishRating, type RatingBody } from "@/src/commish/handleStatCorrection";
import { createCommishStatStore, createCommishRescore } from "@/src/commish/commishStatStore";

export const dynamic = "force-dynamic";

function parseRating(raw: unknown): RatingBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.matchId !== "string" || typeof b.playerId !== "string") return null;
  if (typeof b.reason !== "string") return null;
  // Clear = explicit `clear: true` OR `rating: null`. Otherwise a numeric rating is required (range is
  // validated by the handler → rating_out_of_range).
  let rating: number | null;
  if (b.clear === true || b.rating === null) rating = null;
  else if (typeof b.rating === "number") rating = b.rating;
  else return null;
  return { matchId: b.matchId, playerId: b.playerId, rating, reason: b.reason };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createCommishStatStore(prisma),
    rescore: createCommishRescore(prisma),
  };
}

export async function POST(request: Request) {
  const body = parseRating(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleCommishRating(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
