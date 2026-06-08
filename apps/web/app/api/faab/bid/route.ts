/**
 * /api/faab/bid — the authenticated FAAB bid entry point (blind waiver claims). Like
 * `app/api/draft/pick/route.ts` it adds ONLY identity: the framework-agnostic `handleSubmitBid` /
 * `handleEditBid` / `handleCancelBid` (unit-tested) resolve the session manager, reject 401/403 BEFORE
 * any write, then validate + persist a `pending` `FaabBid`. This thin wrapper parses the body, builds
 * the real deps (the Prisma bid store + the session resolver), and maps the result to a NextResponse.
 *
 *   POST   — submit a new pending bid (add / drop / amount / note)
 *   PATCH  — edit a still-pending bid's amount / drop / note (the add target is fixed)
 *   DELETE — cancel a still-pending bid
 *
 * Reorder of pending claims is intentionally NOT exposed here — it depends on the unresolved
 * priority-vs-amount confirm + a missing `faab_bid.priority` column (see the prompt's TODO(confirm)).
 *
 * RLS (confirmed present, NOT a gap): the `faab_bid` policies were migrated in
 * `20260603223500_invariants` — own-pending SELECT/INSERT/UPDATE/DELETE keyed on auth.uid() =
 * manager.user_id, plus a public SELECT once a bid is settled. These routes run through the Prisma
 * OWNER role (which bypasses RLS), so they ALSO self-scope at the query layer (the bid's manager must
 * equal the session manager) — RLS is the defence-in-depth backstop for any future JWT-scoped reads.
 */
import { NextResponse } from "next/server";
import { prisma } from "@app/db";
import { createPrismaFaabBidStore } from "@app/faab/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import {
  handleSubmitBid,
  handleEditBid,
  handleCancelBid,
  type SubmitBidBody,
  type EditBidBody,
  type CancelBidBody,
} from "@/src/faab/handleBid";

export const dynamic = "force-dynamic";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function nullableStr(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  return { ok: false };
}

function parseSubmit(raw: unknown): SubmitBidBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = str(b.managerId);
  const playerAddId = str(b.playerAddId);
  const drop = nullableStr(b.playerDropId);
  const note = nullableStr(b.note);
  if (!managerId || !playerAddId || !drop.ok || !note.ok) return null;
  if (typeof b.amount !== "number" || !Number.isInteger(b.amount)) return null;
  return {
    managerId,
    playerAddId,
    playerDropId: drop.value,
    amount: b.amount,
    note: note.value,
  };
}

function parseEdit(raw: unknown): EditBidBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = str(b.managerId);
  const bidId = str(b.bidId);
  const drop = nullableStr(b.playerDropId);
  const note = nullableStr(b.note);
  if (!managerId || !bidId || !drop.ok || !note.ok) return null;
  if (typeof b.amount !== "number" || !Number.isInteger(b.amount)) return null;
  return { managerId, bidId, amount: b.amount, playerDropId: drop.value, note: note.value };
}

function parseCancel(raw: unknown): CancelBidBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const managerId = str(b.managerId);
  const bidId = str(b.bidId);
  if (!managerId || !bidId) return null;
  return { managerId, bidId };
}

function deps() {
  return {
    resolveManager: getSessionManager,
    store: createPrismaFaabBidStore(prisma),
    now: new Date(),
  };
}

export async function POST(request: Request) {
  const body = parseSubmit(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleSubmitBid(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(request: Request) {
  const body = parseEdit(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleEditBid(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(request: Request) {
  const body = parseCancel(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await handleCancelBid(deps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
