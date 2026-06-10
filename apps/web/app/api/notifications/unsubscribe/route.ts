/**
 * POST /api/notifications/unsubscribe — remove the caller's push subscription by endpoint (Prompt 41a).
 * Thin wrapper around `handleUnsubscribe`. Self-only.
 * Status map: 401 no session · 403 not allowlisted / no manager · 400 missing endpoint · 200 ok.
 */
import { NextResponse } from "next/server";
import { handleUnsubscribe } from "@/src/notifications/handlers";
import { notifyDeps } from "@/src/notifications/deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const result = await handleUnsubscribe(notifyDeps(), raw);
  return NextResponse.json(result.body, { status: result.status });
}
