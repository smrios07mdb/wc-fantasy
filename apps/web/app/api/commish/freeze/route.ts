/**
 * POST /api/commish/freeze — Thread 4. Commissioner-only: stamp `period.frozen_at = now` on a settled
 * period (early-finalize before the 6h window, or re-freeze after a manual unfreeze). Freeze gates
 * AUTO-RESTATEMENT ONLY — the worker sweep skips the period unless the commissioner override; it does
 * NOT lock lineups and does NOT pause scoring. Thin route: shape-parse → the framework-agnostic
 * `handleFreeze` (unit-tested) over the real Prisma store; write + audit commit in one transaction.
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handleFreeze, parseFreezeBody } from "@/src/commish/handleFreeze";
import { createCommishFreezeStore } from "@/src/commish/commishFreezeStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const body = parseFreezeBody(raw);
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { status, body: out } = await handleFreeze(
    { resolveManager: getSessionManager, now: () => new Date(), store: createCommishFreezeStore() },
    body,
  );
  return NextResponse.json(out, { status });
}
