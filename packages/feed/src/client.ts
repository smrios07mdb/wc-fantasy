/**
 * Real BALLDONTLIE FIFA WC client: per-request rate limiting, snake_case query building, and cursor
 * pagination (follow `meta.next_cursor` to exhaustion). Thin transport + parse — no DB. The transport
 * and rate are injected via {@link FeedClientConfig} so tests run with recorded fixtures + fake timers.
 */
import { createRateLimiter, type RateLimiter } from "./rateLimiter";
import { BalldontlieHttpError, type FetchLike } from "./http";
import type {
  Paginated,
  CursorMeta,
  FIFAMatch,
  FIFAMatchLineupEntry,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  FIFARoster,
  FIFAPlayerProp,
  FIFAFuturesOdd,
  MatchListParams,
  MatchScopedParams,
  RostersParams,
  FuturesParams,
  ListParams,
} from "./types";
import type { FeedClient, FeedClientConfig } from "./index";

// CONFIRMED against the official BALLDONTLIE OpenAPI spec (www.balldontlie.io/openapi/fifa.yml) + docs
// (fifa.balldontlie.io): the FIFA World Cup (GOAT) endpoints live under `/fifa/worldcup/v1`, the base is
// https://api.balldontlie.io, and auth is the RAW API key in the `Authorization` header (no "Bearer").
// e.g. GET https://api.balldontlie.io/fifa/worldcup/v1/matches  -H "Authorization: <key>".
const API_PREFIX = "/fifa/worldcup/v1";

interface Built {
  transport: FetchLike;
  baseUrl: string;
  apiKey: string;
  limiter: RateLimiter;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) q.append(`${k}[]`, String(item));
    else q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** snake_case the camelCase request params; drop the internal `matchId` (re-added as `match_id`). */
function snakeParams(p: ListParams & Record<string, unknown>): Record<string, unknown> {
  const { perPage, cursor, matchId: _matchId, ...rest } = p;
  return { ...rest, cursor, per_page: perPage };
}

async function getPage<T>(
  b: Built,
  endpoint: string,
  params: Record<string, unknown>,
): Promise<Paginated<T>> {
  await b.limiter.acquire();
  const url = `${b.baseUrl}${API_PREFIX}/${endpoint}${toQuery(params)}`;
  const res = await b.transport(url, { method: "GET", headers: { Authorization: b.apiKey } });
  if (!res.ok) throw new BalldontlieHttpError(endpoint, res.status);
  const body = (await res.json()) as Paginated<T>;
  return { data: body.data ?? [], meta: (body.meta ?? {}) as CursorMeta };
}

/** Follow `meta.next_cursor` to exhaustion, returning all rows. */
async function getAll<T>(
  b: Built,
  endpoint: string,
  params: Record<string, unknown>,
): Promise<Paginated<T>> {
  const all: T[] = [];
  let cursor: number | string | null | undefined = params.cursor as number | string | undefined;
  let lastMeta: CursorMeta = {};
  do {
    const page: Paginated<T> = await getPage<T>(b, endpoint, { ...params, cursor });
    all.push(...page.data);
    lastMeta = page.meta;
    cursor = page.meta.next_cursor ?? null;
  } while (cursor !== null && cursor !== undefined);
  return { data: all, meta: lastMeta };
}

/**
 * The Node ≥20 global `fetch` as a {@link FetchLike}. Accessed via `globalThis` (cast) so this package
 * needs no DOM lib / `@types/node`; a real `Response` is structurally a valid HttpResponse at runtime.
 */
const globalFetch = (globalThis as unknown as { fetch?: FetchLike }).fetch;

export function buildClient(config: FeedClientConfig): FeedClient {
  const transport =
    config.transport ??
    globalFetch ??
    (() => {
      throw new Error("@app/feed: no transport (global fetch unavailable; pass config.transport)");
    });
  const b: Built = {
    transport,
    baseUrl: config.baseUrl ?? "https://api.balldontlie.io",
    apiKey: config.apiKey,
    limiter: createRateLimiter({
      requestsPerMinute: config.requestsPerMinute ?? 5, // default = the 48h dev trial rate
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    }),
  };
  const scoped = (p: MatchScopedParams): Record<string, unknown> => ({
    ...snakeParams({ ...p }),
    match_id: p.matchId,
  });
  // Defence in depth (2026-06-12 cross-match lock leak): the server `match_id` filter is NOT reliably
  // honoured — a single scoped pull can return rows belonging to OTHER fixtures. Re-filter client-side so a
  // firehose response can never reach the ingest layer. (The ingest foreign-event guard + lockSlot's
  // team/status gate are the inner defences; this stops the contamination at the wire.)
  const matchScoped = async <T extends { match_id: number }>(
    endpoint: string,
    p: MatchScopedParams,
  ): Promise<Paginated<T>> => {
    const res = await getAll<T>(b, endpoint, scoped(p));
    return { data: res.data.filter((r) => r.match_id === p.matchId), meta: res.meta };
  };
  return {
    matches: (p?: MatchListParams) =>
      getAll<FIFAMatch>(b, "matches", snakeParams({ ...(p ?? {}) })),
    matchLineups: (p: MatchScopedParams) => matchScoped<FIFAMatchLineupEntry>("match_lineups", p),
    matchEvents: (p: MatchScopedParams) => matchScoped<FIFAMatchEvent>("match_events", p),
    playerMatchStats: (p: MatchScopedParams) =>
      matchScoped<FIFAPlayerMatchStats>("player_match_stats", p),
    teamMatchStats: (p: MatchScopedParams) =>
      matchScoped<FIFATeamMatchStats>("team_match_stats", p),
    matchShots: (p: MatchScopedParams) => matchScoped<FIFAShot>("match_shots", p),
    // Squads. `seasons[]`/`team_ids[]`/`player_ids[]` are snake_case array params (toQuery emits `[]`);
    // built explicitly here since snakeParams doesn't rename multi-word keys. Defaults to season 2026.
    rosters: (p?: RostersParams) =>
      getAll<FIFARoster>(b, "rosters", {
        cursor: p?.cursor,
        per_page: p?.perPage,
        seasons: p?.seasons ?? [2026],
        team_ids: p?.teamIds,
        player_ids: p?.playerIds,
      }),
    // Pre-match player props for one match. `match_id` is the only param (no pagination — getAll stops
    // when `meta.next_cursor` is absent, so a single page is returned unchanged).
    playerProps: (p: MatchScopedParams) =>
      getAll<FIFAPlayerProp>(b, "odds/player_props", scoped(p)),
    // Team tournament-winner (and other) futures odds. Defaults to season 2026.
    futures: (p?: FuturesParams) =>
      getAll<FIFAFuturesOdd>(b, "odds/futures", {
        cursor: p?.cursor,
        per_page: p?.perPage,
        seasons: p?.seasons ?? [2026],
      }),
  };
}
