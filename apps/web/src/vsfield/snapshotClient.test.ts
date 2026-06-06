import { describe, it, expect, vi } from "vitest";
import type { VsFieldView } from "@app/vsfield";
import { fetchVsField } from "./snapshotClient";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const VIEW: VsFieldView = {
  asOf: "2026-06-12T12:00:00.000Z",
  leagueId: "lg1",
  viewerManagerId: "m1",
  currentPeriod: { id: "md1", label: "MD1" },
  field: [],
  season: [],
  matches: [],
};

describe("fetchVsField — refetch the server-computed snapshot on a change-nudge / poll tick", () => {
  it("GETs /api/vsfield and returns the parsed snapshot", async () => {
    const fetch = vi.fn(async () => jsonResponse(200, VIEW));
    const view = await fetchVsField({ fetch: fetch as unknown as typeof globalThis.fetch });
    expect(fetch).toHaveBeenCalledWith("/api/vsfield", expect.objectContaining({ method: "GET" }));
    expect(view).toEqual(VIEW);
  });

  it("returns null on a non-ok response (caller keeps prior state)", async () => {
    const fetch = vi.fn(async () => jsonResponse(401, { error: "no_session" }));
    expect(await fetchVsField({ fetch: fetch as unknown as typeof globalThis.fetch })).toBeNull();
  });

  it("returns null on a network/parse failure (never throws into the subscription handler)", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchVsField({ fetch: fetch as unknown as typeof globalThis.fetch })).toBeNull();
  });
});
