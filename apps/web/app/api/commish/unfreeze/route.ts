/**
 * POST /api/commish/unfreeze — Thread 4. Commissioner-only: set `period.frozen_at = NULL`, re-opening
 * auto-restatement (pending dirty markers — left unprocessed by the freeze skip — restate on the
 * worker's next sweep). Reason REQUIRED. The response surfaces `pendingDirty` and the re-freeze
 * warning: the hourly close job re-stamps the period on its next pass (~1h window).
 */
import { NextResponse } from "next/server";
import { getSessionManager } from "@/lib/auth/manager";
import { handleUnfreeze, parseFreezeBody } from "@/src/commish/handleFreeze";
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
  const { status, body: out } = await handleUnfreeze(
    { resolveManager: getSessionManager, now: () => new Date(), store: createCommishFreezeStore() },
    body,
  );
  return NextResponse.json(out, { status });
}
