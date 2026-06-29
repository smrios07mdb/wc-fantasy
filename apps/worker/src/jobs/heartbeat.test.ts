import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ping,
  reportPeriodCloseSuccess,
  reportPeriodCloseFailure,
  type FetchLike,
} from "./heartbeat";
import { log } from "../logger";

/**
 * Cron-resilience A-lite detection (DECISIONS.md). The LOAD-BEARING property under test is the
 * never-throw observational invariant: a ping must NEVER affect the job's work, result, logs-of-record,
 * or exit code. Every failure mode — throw, timeout, DNS failure, non-2xx — is swallowed; `ping` never
 * rejects. The wiring wrappers add a second layer (defense-in-depth) so even a contract-violating throw
 * can neither escape into the job path nor suppress a sibling signal.
 */

const URL_HB = "https://hc.example/abc-liveness";
const URL_ATT = "https://hooks.example/attention";

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Silence + capture the diagnostic warn line so failure-path assertions are deterministic.
  warnSpy = vi.spyOn(log, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ping — the best-effort, never-throw primitive", () => {
  it("is a silent no-op when the URL is undefined (unset env var → signal off)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));

    await expect(ping(undefined, { fetchImpl })).resolves.toBeUndefined();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("is a silent no-op for an empty-string URL", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));

    await expect(ping("", { fetchImpl })).resolves.toBeUndefined();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs once with an abort signal on success, and logs nothing", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));

    await expect(ping(URL_HB, { fetchImpl })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      URL_HB,
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("attaches a JSON body + content-type only when a payload is given", async () => {
    const withBody = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));
    await ping(URL_ATT, { fetchImpl: withBody, body: { anomalies: 2, leagueId: "L1" } });
    expect(withBody).toHaveBeenCalledWith(
      URL_ATT,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anomalies: 2, leagueId: "L1" }),
      }),
    );

    const noBody = vi.fn<FetchLike>(async () => ({ ok: true, status: 200 }));
    await ping(URL_HB, { fetchImpl: noBody });
    expect(noBody.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("swallows a synchronous throw from the transport (never rethrows) and warns", async () => {
    const fetchImpl = vi.fn<FetchLike>(() => {
      throw new Error("DNS go boom");
    });

    await expect(ping(URL_HB, { fetchImpl })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("heartbeat.skipped", expect.any(Object));
  });

  it("swallows an async rejection from the transport and warns", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error("connection refused");
    });

    await expect(ping(URL_HB, { fetchImpl })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a non-2xx response as a swallowed failure (warns with the status, never throws)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: false, status: 503 }));

    await expect(ping(URL_HB, { fetchImpl })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const fields = warnSpy.mock.calls[0]?.[1] as { reason?: string };
    expect(fields.reason).toContain("503");
  });

  it("does NOT leak the secret monitor URL into the diagnostic log line", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: false, status: 500 }));

    await ping(URL_HB, { fetchImpl, label: "period-close.liveness" });

    const fields = warnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(fields)).not.toContain(URL_HB);
    expect(fields.label).toBe("period-close.liveness");
  });

  it("aborts via the hard timeout and resolves (never hangs the job)", async () => {
    let aborted = false;
    // A transport that only ever settles when the abort signal fires — proves the timeout wiring.
    const fetchImpl = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("The operation was aborted"));
          });
        }),
    );

    await expect(ping(URL_HB, { fetchImpl, timeoutMs: 20 })).resolves.toBeUndefined();

    expect(aborted).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("reportPeriodCloseSuccess — liveness + (conditional) attention", () => {
  it("fires ONLY the liveness ping when there are no anomalies", async () => {
    const pingSpy = vi.fn<typeof ping>(async () => {});

    await reportPeriodCloseSuccess(
      { heartbeatUrl: URL_HB, attentionUrl: URL_ATT },
      { anomalies: 0, leagueId: "L1" },
      pingSpy,
    );

    expect(pingSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy).toHaveBeenCalledWith(
      URL_HB,
      expect.objectContaining({ label: "period-close.liveness" }),
    );
  });

  it("fires liveness THEN attention (with a tiny payload) when anomalies > 0", async () => {
    const pingSpy = vi.fn<typeof ping>(async () => {});

    await reportPeriodCloseSuccess(
      { heartbeatUrl: URL_HB, attentionUrl: URL_ATT },
      { anomalies: 2, leagueId: "L1" },
      pingSpy,
    );

    expect(pingSpy).toHaveBeenCalledTimes(2);
    expect(pingSpy.mock.calls[0]?.[0]).toBe(URL_HB);
    expect(pingSpy.mock.calls[1]?.[0]).toBe(URL_ATT);
    expect(pingSpy.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        label: "period-close.attention",
        body: { anomalies: 2, leagueId: "L1" },
      }),
    );
  });

  it("passes through an undefined heartbeat URL untouched (ping no-ops it) — unset env = off", async () => {
    const pingSpy = vi.fn<typeof ping>(async () => {});

    await reportPeriodCloseSuccess(
      { heartbeatUrl: undefined, attentionUrl: undefined },
      { anomalies: 0, leagueId: "L1" },
      pingSpy,
    );

    expect(pingSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy.mock.calls[0]?.[0]).toBeUndefined();
  });

  it("independence: a thrown ATTENTION ping cannot escape the job nor suppress liveness", async () => {
    const pingImpl = vi.fn<typeof ping>(async (url) => {
      if (url === URL_ATT) throw new Error("attention exploded");
    });

    await expect(
      reportPeriodCloseSuccess(
        { heartbeatUrl: URL_HB, attentionUrl: URL_ATT },
        { anomalies: 1, leagueId: "L1" },
        pingImpl,
      ),
    ).resolves.toBeUndefined();

    expect(pingImpl).toHaveBeenCalledTimes(2);
    expect(pingImpl.mock.calls[0]?.[0]).toBe(URL_HB); // liveness fired first, unsuppressed
  });

  it("independence: a thrown LIVENESS ping cannot escape, and attention still fires", async () => {
    const pingImpl = vi.fn<typeof ping>(async (url) => {
      if (url === URL_HB) throw new Error("liveness exploded");
    });

    await expect(
      reportPeriodCloseSuccess(
        { heartbeatUrl: URL_HB, attentionUrl: URL_ATT },
        { anomalies: 1, leagueId: "L1" },
        pingImpl,
      ),
    ).resolves.toBeUndefined();

    expect(pingImpl).toHaveBeenCalledTimes(2);
    expect(pingImpl.mock.calls[1]?.[0]).toBe(URL_ATT); // attention still attempted
  });
});

describe("reportPeriodCloseFailure — the immediate /fail crash signal", () => {
  it("pings the Healthchecks.io /fail variant of the liveness URL", async () => {
    const pingSpy = vi.fn<typeof ping>(async () => {});

    await reportPeriodCloseFailure({ heartbeatUrl: URL_HB }, pingSpy);

    expect(pingSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy).toHaveBeenCalledWith(
      `${URL_HB}/fail`,
      expect.objectContaining({ label: "period-close.liveness-fail" }),
    );
  });

  it("does NOT synthesize an 'undefined/fail' URL when the heartbeat URL is unset", async () => {
    const pingSpy = vi.fn<typeof ping>(async () => {});

    await reportPeriodCloseFailure({ heartbeatUrl: undefined }, pingSpy);

    expect(pingSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy.mock.calls[0]?.[0]).toBeUndefined();
  });

  it("never escapes even if the ping throws (defense-in-depth)", async () => {
    const pingImpl = vi.fn<typeof ping>(async () => {
      throw new Error("fail-ping exploded");
    });

    await expect(
      reportPeriodCloseFailure({ heartbeatUrl: URL_HB }, pingImpl),
    ).resolves.toBeUndefined();
  });
});
