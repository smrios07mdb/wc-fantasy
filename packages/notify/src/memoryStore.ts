/**
 * In-memory {@link NotifyStore} double — the test substitute the dispatcher + route handlers run
 * against, so the routing/idempotency flow is exercised with no database and no network. It mirrors
 * the production Prisma+web-push adapter's SEMANTICS:
 *  - `getPreference` lazily materializes all-`true` defaults on first read;
 *  - `claimLedger` is a set keyed on `managerId|kind|subjectId` — the FIRST claim wins, repeats lose;
 *  - `addSubscription` is idempotent on the endpoint;
 *  - `send` records the attempt and returns a scriptable outcome (default ok) so tests can assert what
 *    WOULD be delivered, and simulate an expired (404/410) endpoint to exercise pruning.
 *
 * NOT exported from the package root used by production — it lives here only for the tests (the same
 * arrangement as @app/faab's Memory doubles).
 */
import type { NotifyStore } from "./store";
import type {
  LedgerKind,
  NotificationPreference,
  PushPayload,
  PushSubscriptionRecord,
  SendOutcome,
} from "./types";

const DEFAULT_PREF: NotificationPreference = {
  draftTurn: true,
  playerNotStarting: true,
  matchStarting: true,
};

export interface RecordedSend {
  endpoint: string;
  payload: PushPayload;
}

export class MemoryNotifyStore implements NotifyStore {
  private readonly prefs = new Map<string, NotificationPreference>();
  private readonly subs = new Map<string, PushSubscriptionRecord[]>();
  private readonly ledger = new Set<string>();
  /** Every send the dispatcher/handlers attempted, in order — for assertions. */
  readonly sends: RecordedSend[] = [];
  /** Endpoints that should fail with a given status (simulating an expired subscription). */
  readonly failingEndpoints = new Map<string, number>();

  async getPreference(managerId: string): Promise<NotificationPreference> {
    const existing = this.prefs.get(managerId);
    if (existing) return { ...existing };
    const seeded = { ...DEFAULT_PREF };
    this.prefs.set(managerId, seeded);
    return { ...seeded };
  }

  async upsertPreferences(
    managerId: string,
    prefs: NotificationPreference,
  ): Promise<NotificationPreference> {
    this.prefs.set(managerId, { ...prefs });
    return { ...prefs };
  }

  async listSubscriptions(managerId: string): Promise<PushSubscriptionRecord[]> {
    return (this.subs.get(managerId) ?? []).map((s) => ({ ...s }));
  }

  async addSubscription(managerId: string, sub: PushSubscriptionRecord): Promise<void> {
    const list = this.subs.get(managerId) ?? [];
    const next = list.filter((s) => s.endpoint !== sub.endpoint); // idempotent on endpoint
    next.push({ ...sub });
    this.subs.set(managerId, next);
  }

  async removeSubscription(managerId: string, endpoint: string): Promise<void> {
    const list = this.subs.get(managerId) ?? [];
    this.subs.set(
      managerId,
      list.filter((s) => s.endpoint !== endpoint),
    );
  }

  async claimLedger(managerId: string, kind: LedgerKind, subjectId: string): Promise<boolean> {
    const key = `${managerId}|${kind}|${subjectId}`;
    if (this.ledger.has(key)) return false; // a prior claim won
    this.ledger.add(key);
    return true;
  }

  async send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendOutcome> {
    this.sends.push({ endpoint: subscription.endpoint, payload });
    const failStatus = this.failingEndpoints.get(subscription.endpoint);
    if (failStatus !== undefined) return { ok: false, statusCode: failStatus };
    return { ok: true };
  }

  // ── read helpers for assertions ──────────────────────────────────────────────
  hasLedger(managerId: string, kind: LedgerKind, subjectId: string): boolean {
    return this.ledger.has(`${managerId}|${kind}|${subjectId}`);
  }
  subscriptionCount(managerId: string): number {
    return this.subs.get(managerId)?.length ?? 0;
  }
}
