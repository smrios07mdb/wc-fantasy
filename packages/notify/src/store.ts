/**
 * The notify IO PORT. Every database read/write AND the push-transport send the callers need is
 * expressed here, so {@link dispatchToManager} and the route handlers are pure functions of this
 * interface — unit-testable against the in-memory double ({@link ./memoryStore}). The production
 * implementation is the thin Prisma+web-push adapter ({@link ./prismaStore}), reachable only via
 * `@app/notify/prisma`, keeping this package's `.` surface free of `@app/db` and `web-push`.
 *
 * Mirrors `FaabBidStore` / `DraftStore`: one coherent port, one Memory double, one Prisma adapter.
 */
import type {
  NotificationKind,
  NotificationPreference,
  PushPayload,
  PushSubscriptionRecord,
  SendOutcome,
} from "./types";

export interface NotifyStore {
  /**
   * The manager's per-channel preference, LAZILY upserted with all-`true` defaults on first read (no
   * provisioning step writes these). Never returns null — an unseen manager gets the defaults.
   */
  getPreference(managerId: string): Promise<NotificationPreference>;

  /** Overwrite the manager's three channel flags (full replace). Returns the persisted state. */
  upsertPreferences(
    managerId: string,
    prefs: NotificationPreference,
  ): Promise<NotificationPreference>;

  /** Every push subscription (device) the manager has registered. */
  listSubscriptions(managerId: string): Promise<PushSubscriptionRecord[]>;

  /** Register/refresh a device subscription (idempotent on the globally-unique endpoint). */
  addSubscription(managerId: string, sub: PushSubscriptionRecord): Promise<void>;

  /** Remove a device subscription by endpoint (self-scoped; a no-op if it is already gone). */
  removeSubscription(managerId: string, endpoint: string): Promise<void>;

  /**
   * Idempotency ledger claim. Inserts the unique `(managerId, kind, subjectId)` row and returns
   * `true` iff THIS call inserted it (won the race). A second identical call returns `false` — the
   * load-bearing guard that keeps 41b's polling triggers from re-sending.
   */
  claimLedger(managerId: string, kind: NotificationKind, subjectId: string): Promise<boolean>;

  /** Encrypt + POST one push to the subscription's endpoint (the transport; never touches the DB). */
  send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendOutcome>;
}
