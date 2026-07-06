/**
 * POST /api/lineup — the authenticated, server-authoritative set-lineup entry point. It adds ONLY
 * identity (resolve the session manager, reject 401/403 BEFORE the controller), then calls the unchanged
 * `@app/lineup` controller, which re-reads the authoritative lock state and validates the XI on the
 * server. All orchestration + status mapping is the framework-agnostic `handleSetLineup` (unit-tested);
 * this thin wrapper just parses the body, builds the real deps, and maps the result to a NextResponse.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@app/db";
import { createPrismaLineupStore } from "@app/lineup/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleSetLineup, type LineupRequestBody } from "@/src/lineup/handleLineup";

export const dynamic = "force-dynamic";

function parseBody(raw: unknown): LineupRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.managerId !== "string" || typeof b.periodId !== "string") return null;
  if (!Array.isArray(b.starterIds) || !b.starterIds.every((x) => typeof x === "string"))
    return null;
  let forfeitConfirmedPlayerIds: string[] | undefined;
  if (b.forfeitConfirmedPlayerIds !== undefined) {
    if (
      !Array.isArray(b.forfeitConfirmedPlayerIds) ||
      !b.forfeitConfirmedPlayerIds.every((x) => typeof x === "string")
    )
      return null;
    forfeitConfirmedPlayerIds = b.forfeitConfirmedPlayerIds as string[];
  }
  return {
    managerId: b.managerId,
    periodId: b.periodId,
    starterIds: b.starterIds as string[],
    forfeitConfirmedPlayerIds,
  };
}

export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const store = createPrismaLineupStore(prisma);
    const result = await handleSetLineup(
      { resolveManager: getSessionManager, store, now: new Date() },
      body,
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    // HARD-1 F-A01: capture + structured log, then RETHROW — the opaque 500 the client saw before is
    // byte-identical; it just stops being unrecorded. Sentry marks the captured Error, so the
    // instrumentation-level `onRequestError` does not report it a second time.
    Sentry.captureException(err, { tags: { route: "api/lineup", method: "POST" } });
    console.error("[api.lineup] POST handler threw:", err);
    throw err;
  }
}
