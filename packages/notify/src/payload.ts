/**
 * Pure push-payload builders. Given a notification's dynamic context, produce the flat
 * {@link PushPayload} JSON the service worker renders. No IO — the 41b triggers (and the /test route)
 * call these to construct what `dispatchToManager` / `sendPush` ships.
 *
 * The `tag` is the SW notification collapse key: a per-subject tag means a re-send for the same
 * player/match REPLACES the prior banner rather than stacking a duplicate (belt-and-braces with the
 * `notification_sent` ledger, which prevents the re-send in the first place).
 */
import type { PushPayload } from "./types";

export type PushPayloadContext =
  | { kind: "draft_turn" }
  | { kind: "player_not_starting"; playerId: string; playerName: string }
  | { kind: "match_starting"; matchId: string; matchLabel: string };

export function buildPushPayload(ctx: PushPayloadContext): PushPayload {
  switch (ctx.kind) {
    case "draft_turn":
      return {
        title: "You're on the clock",
        body: "It's your turn to draft — make your pick.",
        url: "/draft",
        tag: "draft_turn",
      };
    case "player_not_starting":
      return {
        title: "Lineup alert",
        body: `${ctx.playerName} is not in the starting XI — check your lineup.`,
        url: "/lineup",
        tag: `player_not_starting:${ctx.playerId}`,
      };
    case "match_starting":
      return {
        title: "Kickoff",
        body: `${ctx.matchLabel} is starting.`,
        url: "/vsfield",
        tag: `match_starting:${ctx.matchId}`,
      };
  }
}

/** The /test transport probe — bypasses the ledger; proves SW + subscription + VAPID end-to-end. */
export function buildTestPayload(): PushPayload {
  return {
    title: "WC Fantasy",
    body: "Push notifications are working ✅",
    url: "/settings",
    tag: "test",
  };
}
