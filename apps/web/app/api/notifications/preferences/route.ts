/**
 * POST /api/notifications/preferences — write the caller's three channel flags (Prompt 41a). Thin
 * wrapper around `handlePreferences` (full replace; the body must carry all three booleans). Self-only.
 * Status map: 401 no session · 403 not allowlisted / no manager · 400 invalid body · 200 echoes prefs.
 */
import { NextResponse } from "next/server";
import { handlePreferences } from "@/src/notifications/handlers";
import { notifyDeps } from "@/src/notifications/deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const result = await handlePreferences(notifyDeps(), raw);
  return NextResponse.json(result.body, { status: result.status });
}
