import { describe, it, expect, vi } from "vitest";
import { submitLineup, type LineupSubmitBody } from "./lineupClient";

const body: LineupSubmitBody = {
  managerId: "mgr-alice",
  periodId: "md1",
  starterIds: ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2"],
};

const fetchReturning = (status: number, payload: unknown): typeof fetch =>
  vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      }) as Response,
  );

describe("submitLineup — posts to the gated route", () => {
  it("POSTs to /api/lineup with the session manager id in the body", async () => {
    const fetchImpl = fetchReturning(200, { ok: true });
    await submitLineup(body, { fetch: fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("/api/lineup");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(body);
  });

  it("returns ok on a 200", async () => {
    const res = await submitLineup(body, { fetch: fetchReturning(200, { ok: true }) });
    expect(res.ok).toBe(true);
  });

  it("maps a 409 locked-player-moved to a typed, surfaced error", async () => {
    const res = await submitLineup(body, {
      fetch: fetchReturning(409, { error: "locked-player-moved", message: "d1 is locked" }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("locked-player-moved");
    expect(res.error.status).toBe(409);
    expect(res.error.message).toBe("d1 is locked");
  });

  it("maps a 401 to a sign-in-again message", async () => {
    const res = await submitLineup(body, { fetch: fetchReturning(401, { error: "no_session" }) });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.status).toBe(401);
    expect(res.error.code).toBe("no_session");
    expect(res.error.message).toMatch(/sign in/i);
  });

  it("maps a 403 not_your_manager", async () => {
    const res = await submitLineup(body, {
      fetch: fetchReturning(403, { error: "not_your_manager" }),
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.status).toBe(403);
    expect(res.error.code).toBe("not_your_manager");
  });

  it("surfaces a network throw as a typed network error (no real network)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const res = await submitLineup(body, { fetch: fetchImpl });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error.code).toBe("network");
  });
});
