/**
 * /api/faab/free-agent — the authenticated INSTANT $0 free-agency pickup (DECISIONS.md → Theme D
 * "per-matchday acquisition window" amendment, Prompt 48). Like `app/api/faab/bid/route.ts` it adds
 * ONLY identity: the framework-agnostic, unit-tested `handleFaGrant` resolves the session manager,
 * rejects 401/403 BEFORE any write, then gates on the free-agency window + snapshot eligibility and
 * applies an atomic add/drop. This thin wrapper parses the body, builds the deps (the Prisma FA store +
 * the session resolver), and maps the result to a NextResponse.
 *
 *   POST — grab an unclaimed player for $0 (add / optional drop), applied immediately, first-come.
 *
 * RLS / ownership: the route runs through the Prisma OWNER role (bypasses RLS) and self-scopes at the
 * gate (scope "self"); the no-double-grant guarantee is the `roster_player_active_ownership_uq` partial
 * unique enforced inside the claim transaction.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { createPrismaFaGrantStore } from "@app/faab/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleFaGrant, type FaGrantBody } from "@/src/faab/handleFaGrant";

export const dynamic = "force-dynamic";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function nullableStr(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  return { ok: false };
}

function parse(raw: unknown): FaGrantBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = str(b.managerId);
  const playerAddId = str(b.playerAddId);
  const drop = nullableStr(b.playerDropId);
  if (!managerId || !playerAddId || !drop.ok) return null;
  return { managerId, playerAddId, playerDropId: drop.value };
}

export async function POST(request: Request) {
  const body = parse(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleFaGrant(
    { resolveManager: getSessionManager, store: createPrismaFaGrantStore(prisma), now: new Date() },
    body,
  );
  return NextResponse.json(result.body, { status: result.status });
}
