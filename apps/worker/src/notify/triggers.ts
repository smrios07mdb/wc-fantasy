/**
 * The worker IO orchestration for the three Prompt-41b notification triggers. Each function loads state
 * through a store, runs its PURE selector ({@link ./selectors}), and dispatches each result via
 * `dispatchToManager` — the one place delivery policy (preference gate → subscription check → ledger
 * claim → fan-out) lives. This is the ONLY notify layer that touches the DB/transport; the selectors
 * stay IO-free and @app/draft / @app/ingest stay untouched.
 *
 * `dispatchToManager` is injected (default: the real one) so tests can spy the wiring; idempotency is
 * NOT re-implemented here — the `notification_sent(manager, kind, subject)` UNIQUE ledger inside
 * dispatch collapses every re-fire of these triggers (the 2s draft tick, the re-pulled XI, the 60s
 * scheduler tick) to a single delivery.
 */
import {
  dispatchToManager,
  buildPushPayload,
  type NotifyStore,
  type DispatchResult,
  type NotificationKind,
  type PushPayload,
} from "@app/notify";
import type { DraftStore } from "@app/draft";
import type { NotifyTriggerStore } from "./store";
import {
  selectDraftTurnNotifications,
  selectPlayersNotStarting,
  selectMatchStartingNotifications,
} from "./selectors";

/** The dispatch seam — `dispatchToManager`'s signature. Injected so tests can assert the wiring. */
export type DispatchFn = (
  store: NotifyStore,
  managerId: string,
  kind: NotificationKind,
  subjectId: string,
  payload: PushPayload,
) => Promise<DispatchResult>;

/** Aggregate outcome of a trigger firing — for the worker's structured logs. */
export interface TriggerSummary {
  /** How many `dispatchToManager` calls were made (one per selected manager). */
  attempts: number;
  /** Total devices delivered to across all attempts (0 when the ledger collapsed a re-fire). */
  sent: number;
}

function summarize(results: DispatchResult[]): TriggerSummary {
  return { attempts: results.length, sent: results.reduce((n, r) => n + r.sent, 0) };
}

/**
 * draft_turn — the on-the-clock manager of every active draft. Piggybacks the existing 2s draft ticker
 * (called from its post-tick hook), so it catches a turn advanced by EITHER a human pick (web route) or
 * an autopick (worker tick) without touching the @app/draft controller. The `${draftId}:${pickNo}`
 * ledger key makes the per-tick re-fire a no-op after the first send (one alert per turn, no on-deck).
 */
export async function dispatchDraftTurns(
  notify: NotifyStore,
  draftStore: DraftStore,
  dispatch: DispatchFn = dispatchToManager,
): Promise<TriggerSummary> {
  const ids = await draftStore.listActiveDraftIds();
  const snapshots = await Promise.all(ids.map((id) => draftStore.loadDraft(id)));
  const inputs = snapshots
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => ({
      draftId: s.draftId,
      status: s.status,
      currentManagerId: s.currentManagerId,
      currentPickNo: s.currentPickNo,
    }));

  const results: DispatchResult[] = [];
  for (const n of selectDraftTurnNotifications(inputs)) {
    results.push(
      await dispatch(
        notify,
        n.managerId,
        "draft_turn",
        n.subjectId,
        buildPushPayload({ kind: "draft_turn" }),
      ),
    );
  }
  return summarize(results);
}

/**
 * player_not_starting — the high-value, time-sensitive swap alert. Called from the worker IO around the
 * pre-match `match_lineups` pull with the official-XI starter BDL ids the pull delivered: any fantasy
 * STARTER not in that XI and still unlocked gets their owner alerted (subject `${matchId}:${playerId}`),
 * leaving them the window to swap before the reserve's own kickoff. The who-to-notify decision is the
 * pure `selectPlayersNotStarting`; this only resolves the match id, reads the slots, and dispatches.
 */
export async function dispatchPlayersNotStarting(
  notify: NotifyStore,
  store: NotifyTriggerStore,
  matchBdlId: number,
  officialXiBdlIds: readonly number[],
  dispatch: DispatchFn = dispatchToManager,
): Promise<TriggerSummary> {
  const matchId = await store.resolveMatchId(matchBdlId);
  if (matchId === null) return { attempts: 0, sent: 0 }; // no seeded period → nothing to key a subject on

  const starters = await store.listFantasyStartersForMatch(matchBdlId);
  const results: DispatchResult[] = [];
  for (const n of selectPlayersNotStarting(officialXiBdlIds, starters)) {
    const payload = buildPushPayload({
      kind: "player_not_starting",
      playerId: n.playerId,
      playerName: n.playerName,
    });
    results.push(
      await dispatch(
        notify,
        n.managerId,
        "player_not_starting",
        `${matchId}:${n.playerId}`,
        payload,
      ),
    );
  }
  return summarize(results);
}

/**
 * match_starting (owners-only) — on each ingestion-scheduler tick, alert every manager who owns ≥1
 * rostered player on EITHER team of a fixture kicking off within the lead window (default 15 min,
 * NOTIFY_MATCH_LEAD_MIN). Subject `${matchId}`: the lead window + the ledger collapse the 60s re-fires
 * to one alert per manager per fixture. "Owns a player" = whole roster (the store widens to both teams).
 */
export async function dispatchMatchStarting(
  notify: NotifyStore,
  store: NotifyTriggerStore,
  now: Date,
  leadMs: number,
  dispatch: DispatchFn = dispatchToManager,
): Promise<TriggerSummary> {
  const matches = await store.listUpcomingMatchesWithOwners(now, leadMs);
  const results: DispatchResult[] = [];
  for (const n of selectMatchStartingNotifications(matches, now, leadMs)) {
    const payload = buildPushPayload({
      kind: "match_starting",
      matchId: n.matchId,
      matchLabel: n.matchLabel,
    });
    results.push(await dispatch(notify, n.managerId, "match_starting", n.subjectId, payload));
  }
  return summarize(results);
}
