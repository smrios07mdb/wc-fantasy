import { describe, it, expect, vi } from "vitest";
import { submitDraftPick } from "./pickClient";

/** A minimal fetch double returning a JSON body with a given status. */
function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response,
  ) as unknown as typeof fetch;
}

const body = { draftId: "d1", managerId: "mgr-me", playerId: "p1" };

describe("submitDraftPick — the thin authed pick client", () => {
  it("POSTs to /api/draft/pick with the session manager id in the body, and returns the pick on 200", async () => {
    const fetchImpl = fetchReturning(200, {
      pickNo: 5,
      managerId: "mgr-me",
      playerId: "p1",
      isAuto: false,
      complete: false,
    });
    const res = await submitDraftPick(body, { fetch: fetchImpl });

    // the route + method + payload
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/draft/pick");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual(body); // carries managerId: "mgr-me"

    expect(res).toEqual({
      ok: true,
      pick: { pickNo: 5, managerId: "mgr-me", playerId: "p1", isAuto: false, complete: false },
    });
  });

  it("surfaces a controller rejection (409 NotYourTurnError) as a typed error", async () => {
    const fetchImpl = fetchReturning(409, { error: "NotYourTurnError", message: "not your turn" });
    const res = await submitDraftPick(body, { fetch: fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("NotYourTurnError");
    expect(res.error.status).toBe(409);
    expect(res.error.message).toMatch(/your turn/i);
  });

  it("maps the 401 no-session gate to a typed error", async () => {
    const res = await submitDraftPick(body, {
      fetch: fetchReturning(401, { error: "no_session" }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("no_session");
    expect(res.error.status).toBe(401);
  });

  it("maps the 403 not-your-manager gate to a typed error", async () => {
    const res = await submitDraftPick(body, {
      fetch: fetchReturning(403, { error: "not_your_manager" }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("not_your_manager");
    expect(res.error.status).toBe(403);
  });

  it("turns a thrown fetch (network failure) into a typed network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const res = await submitDraftPick(body, { fetch: fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("network");
  });
});
