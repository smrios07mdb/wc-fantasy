/**
 * PATCH /api/draft/clock — commissioner-only route that updates the pick-clock duration.
 * Updates `league.draft_pick_seconds` for all future picks. If the timer is currently enabled
 * and the draft is active, also resets `pick_deadline_at` so the new duration takes effect
 * immediately for the current pick. The `draft` row update broadcasts via the existing
 * `postgres_changes` Realtime subscription, resetting all clients' countdown rings.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleClockUpdate } from "../../../../src/draft/handleClockUpdate";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const rawBody = await request.json().catch(() => null);

  const { status, body } = await handleClockUpdate(rawBody, {
    resolveManager: getSessionManager,
    updateLeagueClock: (seconds) =>
      prisma.league.updateMany({ data: { draftPickSeconds: seconds } }).then(() => undefined),
    findDraft: () =>
      prisma.draft.findFirst({
        select: { id: true, status: true, timerEnabled: true },
      }),
    updateDraftDeadline: (draftId, deadline) =>
      prisma.draft
        .update({ where: { id: draftId }, data: { pickDeadlineAt: deadline } })
        .then(() => undefined),
    now: new Date(),
  });
  return NextResponse.json(body, { status });
}
