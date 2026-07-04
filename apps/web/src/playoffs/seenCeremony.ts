/**
 * The per-DEVICE "seen cut ceremonies" latch — the SINGLE source shared by BOTH knockout ceremony
 * surfaces (feat/cut-ceremony-first-open):
 *
 *   • /vsfield "The Cut"  — the `KOCeremony` full-frame takeover (KnockoutUI.tsx).
 *   • /playoffs "Theater" — the blade wind→drop→"CHOP!" choreography (PlayoffsClient.tsx).
 *
 * THE GAP THIS CLOSES. Both surfaces already fire their one-shot ceremony via a between-refetch
 * transition latch — ONLY when a client is actively watching a round flip live→past. A manager who
 * opens the tab AFTER the cut lands sees the settled aftermath and misses the reveal. This latch adds
 * a per-device record of which cut rounds have been WITNESSED (localStorage), so the ceremony plays
 * the FIRST time a device opens a ceremony surface after an unseen cut — exactly once — then settles
 * to aftermath on every later open. A live watcher still sees it in real time (the existing latch),
 * which ALSO records the round here so it never replays on that device's next open.
 *
 * PURITY / FENCES. This is CLIENT PRESENTATION STATE only. The clockless loader / view-model / engine
 * (loadPlayoffs / loadVsField / buildPlayoffsView / buildKnockoutContext / guillotine) stay
 * BYTE-UNTOUCHED — the STOP seam holds. Nothing here touches the DB, RLS, or Realtime.
 *
 * KEY SCHEME. `xi:seenCut:<leagueId>:<roundLabel>` — stable, league-scoped, ONE key per round. Both
 * surfaces import THIS module (single source, no divergence); the /vsfield and /playoffs latches read
 * and write the SAME key for a given (league, round), so a fire on one surface suppresses the replay
 * on the other. `seenCeremony.test.ts` pins the exact key string (the Playwright render proof hardcodes
 * the same scheme, so the pin keeps the browser harness from drifting).
 */

const KEY_PREFIX = "xi:seenCut";

/** Stable, league-scoped, per-round localStorage key (see KEY SCHEME above). */
export function seenCutKey(leagueId: string, roundLabel: string): string {
  return `${KEY_PREFIX}:${leagueId}:${roundLabel}`;
}

/**
 * Storage-safe read: has THIS device already witnessed the cut for `(leagueId, roundLabel)`?
 *
 * Returns TRUE ("treat as seen") when localStorage is unavailable — during SSR/render (there is no
 * `window`; this is a client-only latch), or when the store throws (private mode / disabled). A store
 * that can't persist can't honor "exactly once", so we suppress the full-screen takeover rather than
 * REPLAY it on every page load; the in-session live→past latch still covers a live watcher. Failing
 * toward "seen" (no-spam) is the boring, safe default for a takeover animation.
 */
export function hasSeenCut(leagueId: string, roundLabel: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(seenCutKey(leagueId, roundLabel)) !== null;
  } catch {
    return true;
  }
}

/** Storage-safe write: mark this device as having witnessed the cut. Best-effort (never throws). */
export function recordCutSeen(leagueId: string, roundLabel: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(seenCutKey(leagueId, roundLabel), "1");
  } catch {
    /* storage unavailable — best effort; the in-session live latch remains the fallback */
  }
}

/** A past (cut) round the view-model already exposes — label + idx-stable ladder position. */
export interface CutRoundRef {
  roundLabel: string;
  /** The round's ladder index (stable + monotonic — a later round always has a higher idx). */
  roundIdx: number;
}

export interface CeremonyLatchDecision {
  /**
   * The round whose one-time ceremony should fire NOW, or null (nothing new to reveal). This is the
   * MOST-RECENT past cut, and only when it is unseen — older unseen cuts never replay (they are
   * recorded but never fired). "Most-recent-only" keeps both surfaces coherent: /vsfield's KOCeremony
   * can render ONLY the most-recent settled round, so the fired round must be that one.
   */
  fire: CutRoundRef | null;
  /** ALL past cut-round labels to mark seen after this mount (a fresh device seeds its whole past). */
  record: string[];
}

/**
 * DEFAULT fresh-device behavior = fire-latest-once (the prompt's default): a device opening with cuts
 * already in the past animates the single most-recent cut, then records all past rounds so older cuts
 * never replay. Pass `{ seedSilent: true }` for the alternative — a COLD device records its whole past
 * silently and animates nothing; only FUTURE cuts (via the live latch or a later mount) then fire.
 */
export const SEED_SILENT_DEFAULT = false;

/**
 * The PURE latch decision (localStorage injected via `isSeen`, so it is trivially unit-testable):
 *
 *   fire   = the most-recent past cut, iff it is unseen (else null). Older unseen cuts are NEVER
 *            fired — only recorded — so a device can never chain-replay a backlog of old cuts.
 *   record = every past cut label (fire OR not), so the fired round can't re-fire and a fresh device
 *            seeds its whole past ("record-all-on-fresh").
 *
 * `seedSilent` (cold start only = no past round yet seen on this device) suppresses the fire while
 * still recording — the seed-silent variant.
 */
export function decideCeremonyLatch(
  pastCuts: readonly CutRoundRef[],
  isSeen: (roundLabel: string) => boolean,
  opts: { seedSilent?: boolean } = {},
): CeremonyLatchDecision {
  if (pastCuts.length === 0) return { fire: null, record: [] };
  const record = pastCuts.map((c) => c.roundLabel);
  // Most-recent past cut = highest idx (ladder idx is monotonic: a later round always sorts after).
  const mostRecent = pastCuts.reduce((a, b) => (b.roundIdx > a.roundIdx ? b : a));
  const coldStart = !pastCuts.some((c) => isSeen(c.roundLabel));
  let fire: CutRoundRef | null = isSeen(mostRecent.roundLabel) ? null : mostRecent;
  if ((opts.seedSilent ?? SEED_SILENT_DEFAULT) && coldStart) fire = null;
  return { fire, record };
}
