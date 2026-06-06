/**
 * GET /api/draft/state — the AUTHORITATIVE draft pointer/status, read-only. The draft room's Realtime
 * re-sync calls this when a broadcast payload is partial (pointer re-synced but `status` dropped), so the
 * lobby↔active view always re-derives from the authoritative `draft.status` — server stays authoritative.
 *
 * Identity is the SAME gate as `POST /api/draft/pick` (`getSessionManager` → 401/403 before any read);
 * the read itself is the Prisma owner (RLS-bypassing), so a thin/blocked browser broadcast can't strand a
 * lobby client. There is one private league (ARCHITECTURE §4), so it reads the single draft like the loader.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session")
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  if (outcome.kind === "not-allowlisted")
    return NextResponse.json({ error: "not_allowlisted" }, { status: 403 });
  if (outcome.kind === "no-manager")
    return NextResponse.json({ error: "no_manager" }, { status: 403 });

  const draft = await prisma.draft.findFirst({
    select: { status: true, currentPickNo: true, currentManagerId: true, pickDeadlineAt: true },
  });
  if (!draft) return NextResponse.json({ error: "no_draft" }, { status: 404 });

  // snake_case, reducer-shaped (`DraftRowChange`): the client folds it straight in via applyDraftRowChange.
  return NextResponse.json({
    status: draft.status,
    current_pick_no: draft.currentPickNo,
    current_manager_id: draft.currentManagerId,
    pick_deadline_at: draft.pickDeadlineAt ? draft.pickDeadlineAt.toISOString() : null,
  });
}
