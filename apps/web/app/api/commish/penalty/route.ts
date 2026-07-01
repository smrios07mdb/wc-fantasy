/**
 * POST /api/commish/penalty — Thread 2 · B1. Commissioner-only manual penalty entry (won/committed) for one
 * (match, player). Like the other write routes it adds ONLY body parsing + real deps: the framework-agnostic
 * `handleCommishPenalty` (unit-tested) resolves the session manager, rejects 401/403 BEFORE any write,
 * validates the body + the (match, player), UPSERTs `manual_stat_player_match` + a `commish_audit` row in one
 * transaction, and fires the sync re-score (frozen-override). The ENGINE is byte-untouched — this only writes
 * the feed-gap row the adapter already reads.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleCommishPenalty, type PenaltyBody } from "@/src/commish/handleStatCorrection";
import { createCommishStatStore, createCommishRescore } from "@/src/commish/commishStatStore";

export const dynamic = "force-dynamic";

function parsePenalty(raw: unknown): PenaltyBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.matchId !== "string" || typeof b.playerId !== "string") return null;
  if (typeof b.penaltyWon !== "number" || typeof b.penaltyCommitted !== "number") return null;
  if (typeof b.reason !== "string") return null;
  return {
    matchId: b.matchId,
    playerId: b.playerId,
    penaltyWon: b.penaltyWon,
    penaltyCommitted: b.penaltyCommitted,
    reason: b.reason,
  };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createCommishStatStore(prisma),
    rescore: createCommishRescore(prisma),
  };
}

export async function POST(request: Request) {
  const body = parsePenalty(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleCommishPenalty(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
