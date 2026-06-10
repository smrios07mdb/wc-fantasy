/**
 * PURE selection cores for the three Prompt-41b notification triggers (ARCHITECTURE.md §3/§5). Each is
 * an IO-free function from already-fetched state → the (manager, subjectId) dispatches to emit on ONE
 * firing. No clock is read, no DB/web-push is touched — `now` is injected where a window is involved.
 *
 * Idempotency across re-fires is NOT modelled here: it is the `notification_sent(manager, kind,
 * subject)` UNIQUE ledger inside `dispatchToManager` (the worker IO layer). These selectors therefore
 * stay stateless and re-emit the same set every tick; the ledger collapses the repeats to one send.
 *
 * The three `subjectId` keys (the ledger's idempotency key) — see DECISIONS.md → Notifications:
 *   draft_turn          → `${draftId}:${pickNo}`   (one alert per turn; re-fires per 2s tick are no-ops)
 *   player_not_starting → `${matchId}:${playerId}` (built by the IO caller from the match it pulled)
 *   match_starting      → `${matchId}`             (one alert per fixture; re-fires per 60s tick are no-ops)
 */
import type { DraftStatus } from "@app/shared";

// ── draft_turn ────────────────────────────────────────────────────────────────

/** The slice of a draft snapshot the draft-turn selector reads. */
export interface DraftTurnInput {
  draftId: string;
  status: DraftStatus;
  currentManagerId: string | null;
  currentPickNo: number | null;
}

export interface DraftTurnNotification {
  managerId: string;
  /** `${draftId}:${pickNo}` — the ledger key. The pickNo makes EACH turn a distinct row, so the 2s
   *  ticker re-fires safely (one alert per turn) and a human pick or autopick that advances the pointer
   *  produces a fresh subject the next tick. */
  subjectId: string;
}

/**
 * The on-the-clock manager for every ACTIVE draft. Skips drafts that are not active and active drafts
 * with no pointer (a draft mid-advance or not yet started). One notification per active draft per call.
 */
export function selectDraftTurnNotifications(
  drafts: readonly DraftTurnInput[],
): DraftTurnNotification[] {
  const out: DraftTurnNotification[] = [];
  for (const d of drafts) {
    if (d.status !== "active") continue;
    if (d.currentManagerId === null || d.currentPickNo === null) continue;
    out.push({ managerId: d.currentManagerId, subjectId: `${d.draftId}:${d.currentPickNo}` });
  }
  return out;
}

// ── player_not_starting ─────────────────────────────────────────────────────────

/** A manager's fantasy STARTER slot for the match being pulled (the store returns only is_starter rows). */
export interface FantasyStarterSlot {
  managerId: string;
  /** Internal player UUID — used to build `${matchId}:${playerId}` and target the lineup screen. */
  playerId: string;
  /** BALLDONTLIE player id — compared against the official-XI ids the feed just delivered. */
  playerBdlId: number;
  playerName: string;
  /** NULL = still swappable; non-null = the swap window already closed (no point alerting). */
  lockedAt: Date | null;
}

export interface NotStartingNotification {
  managerId: string;
  playerId: string;
  playerName: string;
}

/**
 * Owners to alert: every fantasy STARTER whose player is NOT in the official XI and whose slot is still
 * unlocked (the swap window is open). `officialXiBdlIds` is the set of starter player ids the
 * `match_lineups` pull delivered; a player benched, omitted, or absent from the feed is "not starting".
 */
export function selectPlayersNotStarting(
  officialXiBdlIds: readonly number[],
  starters: readonly FantasyStarterSlot[],
): NotStartingNotification[] {
  const xi = new Set(officialXiBdlIds);
  return starters
    .filter((s) => s.lockedAt === null && !xi.has(s.playerBdlId))
    .map((s) => ({ managerId: s.managerId, playerId: s.playerId, playerName: s.playerName }));
}

// ── match_starting ──────────────────────────────────────────────────────────────

/** An upcoming fixture with the managers who own ≥1 rostered player on EITHER team (owners-only). */
export interface UpcomingMatch {
  matchId: string;
  kickoffMs: number;
  /** "{Home} vs {Away}" — the push body. */
  label: string;
  ownerManagerIds: readonly string[];
}

export interface MatchStartingNotification {
  managerId: string;
  matchId: string;
  matchLabel: string;
  /** `${matchId}` — one alert per fixture; the lead window + ledger collapse the 60s re-fires. */
  subjectId: string;
}

/**
 * Fan a fixture out to its owners IFF kickoff is within `[now, now + leadMs]` — i.e. the match is about
 * to start (default lead 15 min, config knob NOTIFY_MATCH_LEAD_MIN). A match already underway (kickoff
 * in the past) is excluded; a match further out than the lead is excluded. "Owns a player" = the whole
 * roster (not just starters), so the owner list is supplied by the store already widened to both teams.
 */
export function selectMatchStartingNotifications(
  matches: readonly UpcomingMatch[],
  now: Date,
  leadMs: number,
): MatchStartingNotification[] {
  const nowMs = now.getTime();
  const out: MatchStartingNotification[] = [];
  for (const m of matches) {
    const untilKickoff = m.kickoffMs - nowMs;
    if (untilKickoff < 0 || untilKickoff > leadMs) continue;
    for (const managerId of m.ownerManagerIds) {
      out.push({ managerId, matchId: m.matchId, matchLabel: m.label, subjectId: m.matchId });
    }
  }
  return out;
}
