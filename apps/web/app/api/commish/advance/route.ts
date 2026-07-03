/**
 * POST /api/commish/advance — Thread 5. Commissioner-only: the playoff round-cut surface over the
 * relocated `runRoundAdvance` orchestrator (dry-run plan by default; `apply: true` performs the
 * IRREVERSIBLE cut + ONE `round_advance` audit row in one transaction). `allowIncomplete` is pinned
 * false on this surface — the CLI keeps the emergency override. Thin route: shape-parse → the
 * framework-agnostic `handleAdvance` (unit-tested) over the real Prisma store.
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handleAdvance, parseAdvanceBody } from "@/src/commish/handleAdvance";
import { createCommishAdvanceStore } from "@/src/commish/commishAdvanceStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const body = parseAdvanceBody(raw);
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { status, body: out } = await handleAdvance(
    {
      resolveManager: getSessionManager,
      now: () => new Date(),
      store: createCommishAdvanceStore(),
    },
    body,
  );
  return NextResponse.json(out, { status });
}
