/**
 * /api/pool/pick — the authenticated pick'em-pool entry point (Prompt 40 §3). Like
 * `app/api/faab/bid/route.ts` it adds ONLY identity: the framework-agnostic, unit-tested
 * `handleSubmitPick` / `handleReadPicks` resolve the session manager, reject 401/403 BEFORE any write,
 * then validate (the pure @app/pool guard) + upsert / read. This thin wrapper parses the body, builds
 * the real deps (the Prisma pool store + the session resolver + server `now`), and maps the result to a
 * NextResponse.
 *
 *   POST — submit / UPSERT this manager's prediction for a match (managerId / matchId / prediction)
 *   GET  — read the caller's VISIBLE picks (own always; others' only post-kickoff — anti-copying)
 *
 * RLS (confirmed present, NOT a gap): the `pool_pick` policies were migrated in
 * `20260610130000_pool_pick` — league-scoped SELECT + own-manager INSERT/UPDATE keyed on auth.uid() =
 * manager.user_id. This route runs through the Prisma OWNER role (which bypasses RLS) and self-scopes at
 * the handler/query layer; RLS is the defence-in-depth backstop for the Prompt-41 JWT-scoped reads.
 * Prompt 41 owns the UI + the Realtime subscription (the publication entry is already added).
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { POOL_PREDICTIONS, type PoolPrediction } from "@app/shared";
import { getSessionManager } from "@/lib/auth/manager";
import { createPrismaPoolPickStore } from "@/src/pool/prismaStore";
import { handleSubmitPick, handleReadPicks, type SubmitPickBody } from "@/src/pool/handlePick";

export const dynamic = "force-dynamic";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asPrediction(v: unknown): PoolPrediction | null {
  return typeof v === "string" && (POOL_PREDICTIONS as readonly string[]).includes(v)
    ? (v as PoolPrediction)
    : null;
}

function parseSubmit(raw: unknown): SubmitPickBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = str(b.managerId);
  const matchId = str(b.matchId);
  const prediction = asPrediction(b.prediction);
  if (!managerId || !matchId || !prediction) return null;
  return { managerId, matchId, prediction };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createPrismaPoolPickStore(prisma),
    now: new Date(),
  };
}

export async function POST(request: Request) {
  const body = parseSubmit(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleSubmitPick(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  const result = await handleReadPicks(deps());
  return NextResponse.json(result.body, { status: result.status });
}
