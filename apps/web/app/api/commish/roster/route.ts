/**
 * POST /api/commish/roster — Thread 3a. Commissioner-only SAFE roster repair: add / add-drop (window +
 * eligibility + drop-lock bypass) and trim (drop-only release of UNLOCKED players). Like the other
 * commissioner routes this adds ONLY body shape-parsing + real deps: the framework-agnostic
 * `handleCommishRosterRepair` (unit-tested) gates 401/403 BEFORE any read, validates semantics, runs the
 * VERBATIM `@app/commish-core` runner over the live `@app/faab` prisma store, writes the post-mutation
 * `commish_audit` row (audit_pending on failure — never silent), and fires the A6 restate
 * (`allowFrozen`; restate_pending on throw — never a bare 500).
 *
 * 3a SAFETY: `allowPostKickoff` / `allowLocked` are HARDCODED false inside the handler — they are not
 * body fields and a smuggled flag is ignored. The `app.commish_override` GUC is unreachable from here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { getSessionManager } from "@/lib/auth/manager";
import { handleCommishRosterRepair, type RosterRepairBody } from "@/src/commish/handleRosterRepair";
import { createCommishRepairStore, createCommishRestate } from "@/src/commish/commishRepairStore";

export const dynamic = "force-dynamic";

function parseRoster(raw: unknown): RosterRepairBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.managerId !== "string" || typeof b.reason !== "string") return null;
  if (typeof b.apply !== "boolean") return null;
  if (b.kind === "add") {
    if (typeof b.addPlayerId !== "string") return null;
    if (b.dropPlayerId !== null && typeof b.dropPlayerId !== "string") return null;
    if (b.periodId !== null && typeof b.periodId !== "string") return null;
    return {
      kind: "add",
      managerId: b.managerId,
      addPlayerId: b.addPlayerId,
      dropPlayerId: b.dropPlayerId,
      periodId: b.periodId,
      reason: b.reason,
      apply: b.apply,
    };
  }
  if (b.kind === "trim") {
    if (!Array.isArray(b.dropPlayerIds) || !b.dropPlayerIds.every((x) => typeof x === "string")) {
      return null;
    }
    return {
      kind: "trim",
      managerId: b.managerId,
      dropPlayerIds: b.dropPlayerIds,
      reason: b.reason,
      apply: b.apply,
    };
  }
  return null;
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
  const body = parseRoster(raw);
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { status, body: out } = await handleCommishRosterRepair(deps(), body);
  return NextResponse.json(out, { status });
}
