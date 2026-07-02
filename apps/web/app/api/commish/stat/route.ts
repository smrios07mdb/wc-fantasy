/**
 * POST /api/commish/stat — Thread 2b. Commissioner-only GENERAL stat-line correction for one (match, player):
 * a sparse, absolute overlay of raw feed stats (goals, assists, saves, …) stored in
 * `manual_stat_player_match.extra.statOverrides`. Like the other write routes it adds ONLY body parsing +
 * real deps: the framework-agnostic `handleCommishStatCorrection` (unit-tested) gates 401/403 BEFORE any
 * write, validates the body + the allowlist + (match, player), UPSERTs the overlay + a `commish_audit` row in
 * one transaction, and fires the sync re-score (frozen-override). ENGINE byte-untouched — the write only lands
 * the overlay the adapter already reads.
 *
 * Body: { matchId, playerId, reason, overrides: { <statKey>: <int≥0>, … } }  — an EMPTY `overrides` clears all.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleCommishStatCorrection, type StatBody } from "@/src/commish/handleStatCorrection";
import { createCommishStatStore, createCommishRescore } from "@/src/commish/commishStatStore";

export const dynamic = "force-dynamic";

function parseStat(raw: unknown): StatBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.matchId !== "string" || typeof b.playerId !== "string") return null;
  if (typeof b.reason !== "string") return null;
  const o = b.overrides;
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  // Shape guard only — every value must be a number. The handler enforces the allowlist + Int≥0 semantics.
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v !== "number") return null;
    overrides[k] = v;
  }
  return { matchId: b.matchId, playerId: b.playerId, overrides, reason: b.reason };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createCommishStatStore(prisma),
    rescore: createCommishRescore(prisma),
  };
}

export async function POST(request: Request) {
  const body = parseStat(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleCommishStatCorrection(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
