/**
 * `sendPush` — the thin `web-push` (VAPID) transport wrapper. The ONLY file in @app/notify that does
 * network IO; reachable via `@app/notify/send`. Used directly by the `POST /api/notifications/test`
 * route (a ledger-bypassing transport probe) and delegated to by the Prisma store's `send` method.
 *
 * VAPID identifies THIS server to the push services (FCM/Mozilla/Apple) so they accept our pushes.
 * Keys are read lazily from the environment on first send (not at import) so the package can be
 * imported in contexts that never send — and so a missing key fails LOUDLY at call time, not silently:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — the application server public key (also handed to the browser to
 *                                   subscribe; the client copy is the NEXT_PUBLIC_ one);
 *   VAPID_PRIVATE_KEY             — server-only secret;
 *   VAPID_SUBJECT                 — a mailto: or https: contact URL (push-service contract).
 *
 * Operator key-gen (NOT committed): `npx web-push generate-vapid-keys`.
 */
import webpush from "web-push";
import type { PushPayload, PushSubscriptionRecord, SendOutcome } from "./types";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID not configured: set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<SendOutcome> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (error) {
    // WebPushError carries the push service's HTTP statusCode (e.g. 410 Gone for a dead endpoint).
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    return { ok: false, statusCode };
  }
}
