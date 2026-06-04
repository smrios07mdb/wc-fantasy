/**
 * @app/feed — BALLDONTLIE FIFA World Cup client. Real HTTP over the six polled endpoints
 * (ARCHITECTURE.md §3): cursor pagination + a configurable rate limit. The transport is injected so
 * tests drive it with recorded fixtures (no network). No DB here — pure transport + parse.
 */
import type {
  Paginated,
  FIFAMatch,
  FIFAMatchLineup,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  MatchListParams,
  MatchScopedParams,
} from "./types";
import type { FetchLike } from "./http";
import { buildClient } from "./client";

export * from "./types";
export * from "./http";
export * from "./rateLimiter";

/** The polling surface, one method per endpoint we consume. */
export interface FeedClient {
  matches(params?: MatchListParams): Promise<Paginated<FIFAMatch>>;
  matchLineups(params: MatchScopedParams): Promise<Paginated<FIFAMatchLineup>>;
  matchEvents(params: MatchScopedParams): Promise<Paginated<FIFAMatchEvent>>;
  playerMatchStats(params: MatchScopedParams): Promise<Paginated<FIFAPlayerMatchStats>>;
  teamMatchStats(params: MatchScopedParams): Promise<Paginated<FIFATeamMatchStats>>;
  matchShots(params: MatchScopedParams): Promise<Paginated<FIFAShot>>;
}

export interface FeedClientConfig {
  apiKey: string;
  /** Defaults to https://api.balldontlie.io. */
  baseUrl?: string;
  /** Injected transport (defaults to the global `fetch`). Tests pass a fixture-backed transport. */
  transport?: FetchLike;
  /** Rate cap (req/min). Default 5 = the 48h dev trial; a paid GOAT key is 600. */
  requestsPerMinute?: number;
}

/** Build a BALLDONTLIE FIFA WC client (real HTTP + cursor pagination + rate limit). */
export function createBalldontlieClient(config: FeedClientConfig): FeedClient {
  return buildClient(config);
}
