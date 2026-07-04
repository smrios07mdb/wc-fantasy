/**
 * `dispatchToManager` — the one place a notification's "should I actually send this?" policy lives.
 * Pure function of the {@link NotifyStore} port (DB + transport injected), so it is unit-tested against
 * the Memory double here and called by NOTHING yet — Prompt 41b wires the three triggers that invoke
 * it. Mirrors the DraftStore-port idiom: no `@app/db` / `web-push` import.
 *
 * Order (deliberate — "boring and reliable", at-most-once delivery):
 *   1. preference gate — cheap; a muted channel never touches the ledger or the network;
 *   2. subscription read — if the manager has NO device, return early WITHOUT claiming the ledger, so a
 *      later subscribe is still notified (claiming here would silently burn the only chance);
 *   3. ledger claim — the idempotency guard: only the FIRST (manager, kind, subjectId) claim proceeds,
 *      so 41b's minute-by-minute pollers re-fire safely;
 *   4. send to every device; prune endpoints the push service reports as gone (404/410).
 *
 * Claiming BEFORE sending is intentional: if a send transiently fails we do NOT re-send on the next
 * poll (the ledger row already exists). At-most-once beats the risk of spamming a manager's lock
 * screen — the chosen trade for a low-stakes fantasy alert.
 */
import type { NotifyStore } from "./store";
import { KIND_TO_PREF, type LedgerKind, type NotificationKind, type PushPayload } from "./types";

export interface DispatchResult {
  /** How many devices the push was successfully delivered to. */
  sent: number;
  reason: "ok" | "pref_off" | "duplicate" | "no_subscriptions";
}

/** Push-service statuses that mean "this subscription is dead" — prune it. */
const GONE_STATUSES = new Set([404, 410]);

export async function dispatchToManager(
  store: NotifyStore,
  managerId: string,
  kind: NotificationKind,
  subjectId: string,
  payload: PushPayload,
): Promise<DispatchResult> {
  // (1) preference gate
  const pref = await store.getPreference(managerId);
  if (!pref[KIND_TO_PREF[kind]]) return { sent: 0, reason: "pref_off" };

  // (2) subscriptions — early-out without burning the ledger
  const subs = await store.listSubscriptions(managerId);
  if (subs.length === 0) return { sent: 0, reason: "no_subscriptions" };

  // (3) idempotency claim
  const won = await store.claimLedger(managerId, kind, subjectId);
  if (!won) return { sent: 0, reason: "duplicate" };

  // (4) fan out; prune dead endpoints
  let sent = 0;
  for (const sub of subs) {
    const outcome = await store.send(sub, payload);
    if (outcome.ok) {
      sent++;
    } else if (outcome.statusCode !== undefined && GONE_STATUSES.has(outcome.statusCode)) {
      await store.removeSubscription(managerId, sub.endpoint);
    }
  }
  return { sent, reason: "ok" };
}

/**
 * `dispatchCommissionerAlert` — the governance-alert sibling of {@link dispatchToManager}, for a
 * commissioner adjudication nudge (e.g. a playoff round cut that hit a boundary tie and cannot be
 * auto-cut; feat/autofire-round-cut). Same transport + at-most-once ledger, MINUS the preference gate: a
 * governance alert is not an opt-out channel, so it never consults `notification_preference`. `kind` is a
 * free-TEXT {@link LedgerKind} (the `notification_sent.kind` column is TEXT, not a pg enum), so a
 * governance kind like `cut_needs_review` needs no migration.
 *
 * Order mirrors the sibling exactly (minus step 1):
 *   1. subscription read — if the recipient has NO device, return early WITHOUT claiming the ledger, so a
 *      later subscribe is still alerted (claiming here would burn the only chance);
 *   2. ledger claim — at-most-once per (manager, kind, subjectId): only the FIRST claim proceeds, so the
 *      resident tick's re-fires are safe no-ops;
 *   3. send to every device; prune endpoints the push service reports as gone (404/410).
 *
 * Pure of IO (a function of the {@link NotifyStore} port), same as `dispatchToManager` — no `@app/db` /
 * web-push / clock import (proven by `purity.test.ts`).
 */
export async function dispatchCommissionerAlert(
  store: NotifyStore,
  managerId: string,
  kind: LedgerKind,
  subjectId: string,
  payload: PushPayload,
): Promise<DispatchResult> {
  // (1) subscriptions — early-out WITHOUT burning the ledger (a later subscribe is still alerted).
  const subs = await store.listSubscriptions(managerId);
  if (subs.length === 0) return { sent: 0, reason: "no_subscriptions" };

  // (2) idempotency claim — at-most-once per (manager, kind, subject); a re-tick loses the race.
  const won = await store.claimLedger(managerId, kind, subjectId);
  if (!won) return { sent: 0, reason: "duplicate" };

  // (3) fan out; prune dead endpoints (same as the sibling).
  let sent = 0;
  for (const sub of subs) {
    const outcome = await store.send(sub, payload);
    if (outcome.ok) {
      sent++;
    } else if (outcome.statusCode !== undefined && GONE_STATUSES.has(outcome.statusCode)) {
      await store.removeSubscription(managerId, sub.endpoint);
    }
  }
  return { sent, reason: "ok" };
}
