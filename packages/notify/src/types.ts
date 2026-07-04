/**
 * @app/notify shared vocabulary. NO IO — these types are the contract the pure pieces (payload
 * builder, preference validator, dispatcher) and the store port all speak in.
 */

/**
 * The notification CHANNELS. Each maps 1:1 to a `notification_preference` boolean column and is the
 * `kind` written into the `notification_sent` idempotency ledger. The triggers that emit each kind are
 * built in Prompt 41b — this package only routes them.
 */
export type NotificationKind = "draft_turn" | "player_not_starting" | "match_starting";

/**
 * Governance / system ALERT kinds — NOT preference-gated channels. A commissioner adjudication nudge (e.g.
 * a playoff round cut that hit a boundary tie and cannot be auto-cut) is not something a manager opts out
 * of, so it is deliberately kept OUT of {@link NotificationKind} + `KIND_TO_PREF` (which stay a closed
 * union of the three opt-in channels). It is written to the SAME `notification_sent.kind` ledger column,
 * which is free TEXT (not a Prisma enum), so a new governance kind needs NO migration.
 */
export type AlertKind = "cut_needs_review";

/**
 * Any value the `notification_sent` idempotency ledger accepts — a preference-gated {@link NotificationKind}
 * OR a governance {@link AlertKind}. The DB column is free TEXT, so this superset needs no migration. Only
 * the ledger port ({@link NotifyStore.claimLedger}) speaks it; the preference gate is `NotificationKind`-only.
 */
export type LedgerKind = NotificationKind | AlertKind;

/** A manager's per-channel opt-in state (all default `true`; see the migration). */
export interface NotificationPreference {
  draftTurn: boolean;
  playerNotStarting: boolean;
  matchStarting: boolean;
}

/** Maps a delivery `kind` to the preference flag that gates it. */
export const KIND_TO_PREF: Record<NotificationKind, keyof NotificationPreference> = {
  draft_turn: "draftTurn",
  player_not_starting: "playerNotStarting",
  match_starting: "matchStarting",
};

/** The browser PushSubscription fields we persist (one row per device/endpoint). */
export interface PushSubscriptionRecord {
  endpoint: string;
  /** Base64url client public key (ECDH P-256) used to encrypt the payload. */
  p256dh: string;
  /** Base64url client auth secret. */
  auth: string;
}

/**
 * The JSON the service worker renders in its `push` handler. Kept deliberately flat + serializable —
 * `sw.js` reads exactly these fields (`title`, `body`, `url`, `tag`).
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Where `notificationclick` focuses/opens (same-origin path). */
  url: string;
  /** Optional collapse key so re-sends for the same subject replace rather than stack. */
  tag?: string;
}

/** The outcome of a single push send (the transport result, not the ledger). */
export interface SendOutcome {
  ok: boolean;
  /**
   * Present on failure: the push service's HTTP status. 404/410 mean the subscription is gone
   * (the device unsubscribed / re-keyed) — the caller prunes it.
   */
  statusCode?: number;
}
