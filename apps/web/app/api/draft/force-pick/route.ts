/**
 * POST /api/draft/force-pick — commissioner-only route that immediately autopicks for the manager
 * currently on the clock, bypassing all deadline checks. Used when the draft runs with no timer
 * (timer_enabled = false) and the commissioner wants to force a pick for an idle manager.
 * The existing `postgres_changes` Realtime subscription on `draft` and `draft_pick` delivers
 * the pick advance to all connected clients automatically — no explicit broadcast needed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { createPrismaDraftStore } from "@app/draft/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleForcePick } from "../../../../src/draft/handleForcePick";

export const dynamic = "force-dynamic";

export async function POST() {
  const { status, body } = await handleForcePick({
    resolveManager: getSessionManager,
    store: createPrismaDraftStore(prisma),
    findActiveDraft: () =>
      prisma.draft.findFirst({ where: { status: "active" }, select: { id: true } }),
    now: new Date(),
  });
  return NextResponse.json(body, { status });
}
