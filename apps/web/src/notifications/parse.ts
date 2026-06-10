/**
 * Pure wire-shape parsers for the notification route bodies. The browser hands us a
 * `PushSubscription.toJSON()` shape (`{ endpoint, keys: { p256dh, auth } }`); we flatten it to the
 * `PushSubscriptionRecord` the store persists. No IO — the 400 path is fully unit-testable.
 */
import type { PushSubscriptionRecord } from "@app/notify";

export function parseSubscriptionBody(raw: unknown): PushSubscriptionRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.endpoint !== "string" || b.endpoint.length === 0) return null;
  const keys = b.keys;
  if (typeof keys !== "object" || keys === null) return null;
  const k = keys as Record<string, unknown>;
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return null;
  return { endpoint: b.endpoint, p256dh: k.p256dh, auth: k.auth };
}

export function parseEndpointBody(raw: unknown): { endpoint: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.endpoint !== "string" || b.endpoint.length === 0) return null;
  return { endpoint: b.endpoint };
}
