/**
 * @app/feed — BALLDONTLIE FIFA World Cup client.
 *
 * STUB: typed signatures for the six endpoints the worker polls (ARCHITECTURE.md §3). No HTTP
 * yet — every method throws NotImplemented. Implementing it must NOT change these signatures
 * (polling, cursor pagination, idempotent upserts land in a later prompt).
 */
import { NotImplementedError } from "@app/shared";
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

export * from "./types";

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
  /** Defaults to https://api.balldontlie.io when implemented. */
  baseUrl?: string;
}

/**
 * Build a BALLDONTLIE FIFA WC client. Stub: methods throw until polling is implemented.
 */
export function createBalldontlieClient(_config: FeedClientConfig): FeedClient {
  const notImplemented = (endpoint: string): never => {
    throw new NotImplementedError(
      `feed.${endpoint}`,
      "TODO(prompt-NN): BALLDONTLIE polling + cursor pagination (ARCHITECTURE.md §3)",
    );
  };

  return {
    matches: () => notImplemented("matches"),
    matchLineups: () => notImplemented("matchLineups"),
    matchEvents: () => notImplemented("matchEvents"),
    playerMatchStats: () => notImplemented("playerMatchStats"),
    teamMatchStats: () => notImplemented("teamMatchStats"),
    matchShots: () => notImplemented("matchShots"),
  };
}
