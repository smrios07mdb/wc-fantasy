/**
 * Browser-side push enrolment, with every browser primitive INJECTED ({@link PushBrowserEnv}) so the
 * permission→register→subscribe→POST flow is unit-testable in Node (no DOM). The `NotificationsClient`
 * island is the thin caller that passes the real `navigator.serviceWorker`, `Notification`, the
 * build-time VAPID public key, and `fetch`.
 *
 * Flow (the standard Web Push enrolment):
 *   1. request notification permission — stop if not granted;
 *   2. register the plain `/sw.js` service worker (served from the web root);
 *   3. subscribe via PushManager with `applicationServerKey` = the VAPID public key as bytes;
 *   4. POST the subscription JSON to `/api/notifications/subscribe` (self-only, server-persisted).
 */

export interface PushBrowserEnv {
  /** `Notification.requestPermission` (bound). */
  requestPermission: () => Promise<NotificationPermission>;
  /** `navigator.serviceWorker`. */
  serviceWorker: ServiceWorkerContainer;
  /** The build-time `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (base64url). Empty → unsupported/misconfigured. */
  vapidPublicKey: string;
  fetch: typeof fetch;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "subscribe_failed" };

/**
 * Decode a base64url VAPID key into the `Uint8Array` PushManager requires for applicationServerKey.
 * The `<ArrayBuffer>` annotation pins the backing buffer so the result satisfies `BufferSource`
 * (the lib's `applicationServerKey` type) under the generic-typed-array lib (TS 5.7+).
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function enableBrowserPush(env: PushBrowserEnv): Promise<EnableResult> {
  if (!env.vapidPublicKey) return { ok: false, reason: "unsupported" };

  const permission = await env.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = await env.serviceWorker.register("/sw.js");
  await env.serviceWorker.ready; // wait for an active worker before subscribing

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey),
  });

  const res = await env.fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  return res.ok ? { ok: true } : { ok: false, reason: "subscribe_failed" };
}
