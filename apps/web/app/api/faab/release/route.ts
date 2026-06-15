/**
 * POST /api/faab/release — the authenticated playoff trim-down release (drop-only net-shed to the 9-cap,
 * DECISIONS §D trim-down). Like `/api/faab/bid` it adds ONLY identity + body parsing: the unit-tested
 * `handleRelease` resolves the session manager, rejects 401/403 before any write, gates on D4 participation
 * + the playoff phase, validates via the pure `@app/faab` `validateRelease`, then applies `releaseRoster`.
 *
 * A `release-unfillable` 409 carries `needsConfirm`; the client confirms and re-POSTs with
 * `confirmedUnfillable: true`. No commissioner path here — that is the `commish:trim` CLI backstop.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { createPrismaFaabReleaseStore } from "@app/faab/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { handleRelease, type ReleaseBody } from "@/src/faab/handleRelease";

export const dynamic = "force-dynamic";

function parseRelease(raw: unknown): ReleaseBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = typeof b.managerId === "string" ? b.managerId : null;
  if (!managerId) return null;
  if (!Array.isArray(b.dropIds) || !b.dropIds.every((d) => typeof d === "string")) return null;
  const confirmedUnfillable = b.confirmedUnfillable === true;
  return { managerId, dropIds: b.dropIds as string[], confirmedUnfillable };
}

export async function POST(request: Request) {
  const body = parseRelease(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleRelease(
    {
      resolveManager: getSessionManager,
      store: createPrismaFaabReleaseStore(prisma),
      now: new Date(),
    },
    body,
  );
  return NextResponse.json(result.body, { status: result.status });
}
