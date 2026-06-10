/**
 * Framework-agnostic handlers for the four `POST /api/notifications/*` routes. Mirror the
 * `handleDisplayNameRename` pattern exactly: IO injected (the session→manager edge + the
 * {@link NotifyStore} port), each returns a plain `{ status, body }` — no NextResponse / Supabase /
 * Prisma import. The thin Next.js routes wire real deps and map the result to a NextResponse.
 *
 * Every route is SELF-ONLY: the target is always the session manager (there is no `managerId` in any
 * body), so the auth gate that resolves the session manager IS the authorization — a resolved manager
 * may only ever act on their own rows. Status map per route: 401 no session · 403 not allowlisted /
 * no manager · 400 malformed body · 200 ok.
 *
 * `handleTest` is the transport probe: it sends `buildTestPayload()` to the caller's own subscriptions
 * via the store's send, DELIBERATELY bypassing the ledger (`claimLedger`) — it proves SW + subscription
 * + VAPID end-to-end without consuming an idempotency slot.
 */
import type { SessionManagerOutcome } from "@app/auth";
import { buildTestPayload, validatePreferenceInput, type NotifyStore } from "@app/notify";
import { parseEndpointBody, parseSubscriptionBody } from "./parse";

export interface NotifyHandlerDeps {
  resolveManager: () => Promise<SessionManagerOutcome>;
  store: NotifyStore;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

type Gate = { ok: true; managerId: string } | { ok: false; result: HandlerResult };

/** Resolve the session manager, mapping the non-ok outcomes to 401/403 BEFORE any mutation. */
async function gateSelf(deps: NotifyHandlerDeps): Promise<Gate> {
  const outcome = await deps.resolveManager();
  if (outcome.kind === "no-session")
    return { ok: false, result: { status: 401, body: { error: "no_session" } } };
  if (outcome.kind === "not-allowlisted")
    return { ok: false, result: { status: 403, body: { error: "not_allowlisted" } } };
  if (outcome.kind === "no-manager")
    return { ok: false, result: { status: 403, body: { error: "no_manager" } } };
  return { ok: true, managerId: outcome.manager.id };
}

export async function handleSubscribe(
  deps: NotifyHandlerDeps,
  rawBody: unknown,
): Promise<HandlerResult> {
  const gate = await gateSelf(deps);
  if (!gate.ok) return gate.result;

  const sub = parseSubscriptionBody(rawBody);
  if (!sub) return { status: 400, body: { error: "bad_request" } };

  await deps.store.addSubscription(gate.managerId, sub);
  return { status: 200, body: { ok: true } };
}

export async function handleUnsubscribe(
  deps: NotifyHandlerDeps,
  rawBody: unknown,
): Promise<HandlerResult> {
  const gate = await gateSelf(deps);
  if (!gate.ok) return gate.result;

  const parsed = parseEndpointBody(rawBody);
  if (!parsed) return { status: 400, body: { error: "bad_request" } };

  await deps.store.removeSubscription(gate.managerId, parsed.endpoint);
  return { status: 200, body: { ok: true } };
}

export async function handlePreferences(
  deps: NotifyHandlerDeps,
  rawBody: unknown,
): Promise<HandlerResult> {
  const gate = await gateSelf(deps);
  if (!gate.ok) return gate.result;

  const validated = validatePreferenceInput(rawBody);
  if (!validated.ok) return { status: 400, body: { error: validated.reason } };

  const preferences = await deps.store.upsertPreferences(gate.managerId, validated.value);
  return { status: 200, body: { preferences } };
}

export async function handleTest(deps: NotifyHandlerDeps): Promise<HandlerResult> {
  const gate = await gateSelf(deps);
  if (!gate.ok) return gate.result;

  // Transport probe: send to every device, BYPASSING the ledger (no claimLedger).
  const subs = await deps.store.listSubscriptions(gate.managerId);
  const payload = buildTestPayload();
  let sent = 0;
  for (const sub of subs) {
    const outcome = await deps.store.send(sub, payload);
    if (outcome.ok) sent++;
  }
  return { status: 200, body: { sent } };
}
