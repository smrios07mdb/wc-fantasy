import { describe, it, expect, vi } from "vitest";
import { fetchDraftState } from "./stateClient";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchDraftState — re-fetch the authoritative draft row when a broadcast is partial", () => {
  it("GETs /api/draft/state and returns the authoritative patch (snake_case, reducer-shaped)", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(200, {
        status: "active",
        current_pick_no: 1,
        current_manager_id: "m1",
        pick_deadline_at: "2026-06-11T00:00:30Z",
      }),
    );

    const patch = await fetchDraftState({ fetch: fetch as unknown as typeof globalThis.fetch });

    expect(fetch).toHaveBeenCalledWith(
      "/api/draft/state",
      expect.objectContaining({ method: "GET" }),
    );
    expect(patch).toEqual({
      status: "active",
      current_pick_no: 1,
      current_manager_id: "m1",
      pick_deadline_at: "2026-06-11T00:00:30Z",
    });
  });

  it("returns null on a non-ok response (so the caller leaves state untouched)", async () => {
    const fetch = vi.fn(async () => jsonResponse(401, { error: "no_session" }));
    expect(
      await fetchDraftState({ fetch: fetch as unknown as typeof globalThis.fetch }),
    ).toBeNull();
  });

  it("returns null on a network/parse failure (never throws into the subscription handler)", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await fetchDraftState({ fetch: fetch as unknown as typeof globalThis.fetch }),
    ).toBeNull();
  });
});
