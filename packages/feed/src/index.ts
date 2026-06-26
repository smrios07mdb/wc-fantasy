/**
 * @app/feed — BALLDONTLIE FIFA World Cup client. Real HTTP over the six polled endpoints
 * (ARCHITECTURE.md §3): cursor pagination + a configurable rate limit. The transport is injected so
 * tests drive it with recorded fixtures (no network). No DB here — pure transport + parse.
 */
import type {
  Paginated,
  FIFAMatch,
  FIFAMatchLineupEntry,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  FIFARoster,
  FIFAPlayerProp,
  FIFAFuturesOdd,
  FIFAStanding,
  MatchListParams,
  MatchScopedParams,
  RostersParams,
  FuturesParams,
  StandingsParams,
} from "./types";
import type { FetchLike } from "./http";
import { buildClient } from "./client";

export * from "./types";
export * from "./http";
export * from "./rateLimiter";

/** The polling surface, one method per endpoint we consume. */
export interface FeedClient {
  matches(params?: MatchListParams): Promise<Paginated<FIFAMatch>>;
  matchLineups(params: MatchScopedParams): Promise<Paginated<FIFAMatchLineupEntry>>;
  matchEvents(params: MatchScopedParams): Promise<Paginated<FIFAMatchEvent>>;
  playerMatchStats(params: MatchScopedParams): Promise<Paginated<FIFAPlayerMatchStats>>;
  teamMatchStats(params: MatchScopedParams): Promise<Paginated<FIFATeamMatchStats>>;
  matchShots(params: MatchScopedParams): Promise<Paginated<FIFAShot>>;
  /** Per-edition squads (the source of `player` + `fifa_team`). Defaults to season 2026. */
  rosters(params?: RostersParams): Promise<Paginated<FIFARoster>>;
  /** Pre-match player props for one match (anytime_goal/assists/shots/…). Confirmed available pre-kickoff. */
  playerProps(params: MatchScopedParams): Promise<Paginated<FIFAPlayerProp>>;
  /** Futures odds (tournament winner + others). Defaults to season 2026. */
  futures(params?: FuturesParams): Promise<Paginated<FIFAFuturesOdd>>;
  /**
   * WC group-stage standings, one row per team (the new game-detail Standings tab's only feed source).
   * Season-scoped + NON-paginated — a single request returns all groups. Defaults to season 2026.
   */
  groupStandings(params?: StandingsParams): Promise<Paginated<FIFAStanding>>;
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
