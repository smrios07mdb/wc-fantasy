/**
 * POST /api/commish/lineup — Thread 3a. Commissioner-only SAFE lineup repair: set a team's XI for a
 * period past its edit window (the in-memory `relaxPeriodLock` bypass), with formation / ownership /
 * XI-size / lock-on-play ALL kept. Thin route: shape-parse → the framework-agnostic
 * `handleCommishLineupRepair` (unit-tested) over the VERBATIM `@app/commish-core` runner + live
 * `@app/lineup` prisma store; post-mutation audit (audit_pending on failure) + the A6 single-period
 * restate (`allowFrozen`; restate_pending on throw).
 *
 * 3a SAFETY: `allowLockedSlot` is HARDCODED false inside the handler — not a body field. The store's
 * `SET LOCAL app.commish_override` line never executes; the DB latch stays fully armed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleCommishLineupRepair, type LineupRepairBody } from "@/src/commish/handleRosterRepair";
import { createCommishRepairStore, createCommishRestate } from "@/src/commish/commishRepairStore";

export const dynamic = "force-dynamic";

function parseLineup(raw: unknown): LineupRepairBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.managerId !== "string" || typeof b.periodId !== "string") return null;
  if (typeof b.reason !== "string" || typeof b.apply !== "boolean") return null;
  if (!Array.isArray(b.starterIds) || !b.starterIds.every((x) => typeof x === "string")) return null;
  return {
    managerId: b.managerId,
    periodId: b.periodId,
    starterIds: b.starterIds,
    reason: b.reason,
    apply: b.apply,
  };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    now: () => new Date(),
    store: createCommishRepairStore(prisma),
    restate: createCommishRestate(prisma),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const body = parseLineup(raw);
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { status, body: out } = await handleCommishLineupRepair(deps(), body);
  return NextResponse.json(out, { status });
}
