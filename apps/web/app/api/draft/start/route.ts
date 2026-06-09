/**
 * POST /api/draft/start — commissioner-only route that starts the pending draft.
 * Mirrors the auth pattern of `api/draft/timer/route.ts` exactly.
 * On success, the `postgres_changes` Realtime subscription on `draft` delivers the
 * `status: pending → active` change to all connected clients automatically.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { createPrismaDraftStore } from "@app/draft/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleStartDraft } from "../../../../src/draft/handleStartDraft";

export const dynamic = "force-dynamic";

export async function POST() {
  const { status, body } = await handleStartDraft({
    resolveManager: getSessionManager,
    store: createPrismaDraftStore(prisma),
    findDraft: () => prisma.draft.findFirst({ select: { id: true, status: true } }),
    now: new Date(),
  });
  return NextResponse.json(body, { status });
}
