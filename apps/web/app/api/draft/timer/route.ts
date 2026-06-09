/**
 * POST /api/draft/timer — commissioner-only toggle for the pick countdown.
 * Flips `timer_enabled` on the draft row and immediately updates `pick_deadline_at`
 * for the current pick (enabling → fresh deadline from now; disabling → null).
 * A single Prisma $transaction keeps both writes atomic. The existing
 * `postgres_changes` Realtime subscription on `draft` delivers both column changes
 * to every connected client automatically — no explicit broadcast needed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): { enabled: boolean } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return null;
  return { enabled: b.enabled };
}

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const outcome = await getSessionManager();
  if (outcome.kind === "no-session")
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  if (outcome.kind !== "ok") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!outcome.isCommissioner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const draft = await prisma.draft.findFirst({
    select: {
      id: true,
      status: true,
      currentPickNo: true,
      league: { select: { draftPickSeconds: true } },
    },
    where: { status: { not: "complete" } },
  });
  if (!draft) return NextResponse.json({ error: "no active draft" }, { status: 409 });

  const { enabled } = body;
  const isActive = draft.status === "active" && draft.currentPickNo !== null;

  await prisma.$transaction(async (tx) => {
    await tx.draft.update({
      where: { id: draft.id },
      data: {
        timerEnabled: enabled,
        // Only update the deadline when there is a current pick in flight.
        // Pending draft has no pick yet; the schema default (true) governs the first start.
        ...(isActive
          ? {
              pickDeadlineAt: enabled
                ? new Date(Date.now() + draft.league.draftPickSeconds * 1000)
                : null,
            }
          : {}),
      },
    });
  });

  return NextResponse.json({ timerEnabled: enabled });
}
