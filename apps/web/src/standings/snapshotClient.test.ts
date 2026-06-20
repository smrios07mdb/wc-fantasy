import { describe, it, expect, vi } from "vitest";
import type { StandingsView } from "@app/recompute";
import { fetchStandings } from "./snapshotClient";

const VIEW = { meId: "m1", cumulative: [] } as unknown as StandingsView;

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("fetchStandings — authed snapshot refetch (null-on-failure, never throws)", () => {
  it("GETs /api/standings and returns the parsed view on 200", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(true, VIEW));
    const out = await fetchStandings({ fetch: fetchSpy as unknown as typeof fetch });
    expect(fetchSpy).toHaveBeenCalledWith("/api/standings", { method: "GET" });
    expect(out).toBe(VIEW);
  });

  it("returns null on a non-ok response (e.g. 401/404), without throwing", async () => {
    const out = await fetchStandings({
      fetch: (async () => jsonResponse(false, { error: "no_session" })) as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });

  it("returns null when fetch rejects (network error)", async () => {
    const out = await fetchStandings({
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });

  it("returns null when the body is not a JSON object", async () => {
    const out = await fetchStandings({
      fetch: (async () => jsonResponse(true, null)) as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });
});
