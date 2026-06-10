/**
 * POST /api/notifications/subscribe — register the caller's browser push subscription (Prompt 41a).
 * Thin wrapper: parse the JSON body, call the framework-agnostic `handleSubscribe` with real deps,
 * map `{ status, body }` to a NextResponse. Self-only (the manager is the session manager).
 * Status map: 401 no session · 403 not allowlisted / no manager · 400 malformed body · 200 ok.
 */
import { NextResponse } from "next/server";
import { handleSubscribe } from "@/src/notifications/handlers";
import { notifyDeps } from "@/src/notifications/deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const result = await handleSubscribe(notifyDeps(), raw);
  return NextResponse.json(result.body, { status: result.status });
}
