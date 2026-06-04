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
  FIFAMatchLineup,
  FIFAMatchEvent,
  FIFAPlayerMatchStats,
  FIFATeamMatchStats,
  FIFAShot,
  MatchListParams,
  MatchScopedParams,
  ListParams,
} from "./types";
import type { FeedClient, FeedClientConfig } from "./index";

// TODO(confirm): verify the API base path + auth scheme against live GOAT docs.
const API_PREFIX = "/fifa/v1";

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
  return {
    matches: (p?: MatchListParams) =>
      getAll<FIFAMatch>(b, "matches", snakeParams({ ...(p ?? {}) })),
    matchLineups: (p: MatchScopedParams) => getAll<FIFAMatchLineup>(b, "match_lineups", scoped(p)),
    matchEvents: (p: MatchScopedParams) => getAll<FIFAMatchEvent>(b, "match_events", scoped(p)),
    playerMatchStats: (p: MatchScopedParams) =>
      getAll<FIFAPlayerMatchStats>(b, "player_match_stats", scoped(p)),
    teamMatchStats: (p: MatchScopedParams) =>
      getAll<FIFATeamMatchStats>(b, "team_match_stats", scoped(p)),
    matchShots: (p: MatchScopedParams) => getAll<FIFAShot>(b, "match_shots", scoped(p)),
  };
}
