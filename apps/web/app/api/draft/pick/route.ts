/**
 * POST /api/draft/pick — the first authenticated entry point. It adds ONLY identity: resolve the
 * session manager, reject 401/403 BEFORE the controller, then call the unchanged `submitPick`. All the
 * orchestration + status mapping is the framework-agnostic `handleDraftPick` (unit-tested); this thin
 * wrapper just parses the body, builds the real deps, and maps the result to a NextResponse.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@app/db";
import { createPrismaDraftStore } from "@app/draft/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleDraftPick, type PickRequestBody } from "@/src/draft/handlePick";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): PickRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (
    typeof b.draftId !== "string" ||
    typeof b.managerId !== "string" ||
    typeof b.playerId !== "string"
  ) {
    return null;
  }
  return { draftId: b.draftId, managerId: b.managerId, playerId: b.playerId };
}

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const store = createPrismaDraftStore(prisma);
    const result = await handleDraftPick(
      { resolveManager: getSessionManager, store, now: new Date() },
      body,
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    // HARD-1 F-A01: capture + structured log, then RETHROW — the opaque 500 the client saw before is
    // byte-identical; it just stops being unrecorded. Sentry marks the captured Error, so the
    // instrumentation-level `onRequestError` does not report it a second time.
    Sentry.captureException(err, { tags: { route: "api/draft/pick", method: "POST" } });
    console.error("[api.draft.pick] POST handler threw:", err);
    throw err;
  }
}
