/**
 * HTTP transport seam for the feed client. The transport is a `fetch`-shaped function so tests drive
 * the client with recorded payloads (no network) and production passes the global `fetch`.
 */
export interface HttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<HttpResponse>;

export class BalldontlieHttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`BALLDONTLIE ${endpoint} → HTTP ${status}`);
    this.name = "BalldontlieHttpError";
  }
}
