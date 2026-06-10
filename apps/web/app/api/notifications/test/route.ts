/**
 * POST /api/notifications/test — send a test push to the caller's own subscriptions (Prompt 41a),
 * via `sendPush` directly, DELIBERATELY bypassing the `notification_sent` ledger. Proves SW +
 * subscription + VAPID end-to-end. Thin wrapper around `handleTest`. Self-only; no body.
 * Status map: 401 no session · 403 not allowlisted / no manager · 200 { sent }.
 */
import { NextResponse } from "next/server";
import { handleTest } from "@/src/notifications/handlers";
import { notifyDeps } from "@/src/notifications/deps";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await handleTest(notifyDeps());
  return NextResponse.json(result.body, { status: result.status });
}
