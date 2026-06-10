import { describe, it, expect, vi } from "vitest";
import { enableBrowserPush, urlBase64ToUint8Array, type PushBrowserEnv } from "./pushClient";

// A fake browser env so the permission→register→subscribe→POST flow is testable with no DOM.
function makeEnv(overrides: Partial<PushBrowserEnv> = {}): {
  env: PushBrowserEnv;
  register: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  fetchSpy: ReturnType<typeof vi.fn>;
} {
  const subJSON = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };
  const subscribe = vi.fn().mockResolvedValue({ toJSON: () => subJSON });
  const registration = { pushManager: { subscribe } };
  const register = vi.fn().mockResolvedValue(registration);
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
  const env: PushBrowserEnv = {
    requestPermission: vi.fn().mockResolvedValue("granted"),
    serviceWorker: {
      register,
      ready: Promise.resolve(registration),
    } as unknown as ServiceWorkerContainer,
    vapidPublicKey: "BFakeKey",
    fetch: fetchSpy as unknown as typeof fetch,
    ...overrides,
  };
  return { env, register, subscribe, fetchSpy };
}

describe("urlBase64ToUint8Array — VAPID key decoding", () => {
  it("decodes a base64url string into the expected bytes", () => {
    // "AQID" base64 = bytes [1,2,3]; base64url with no padding behaves the same here.
    const bytes = urlBase64ToUint8Array("AQID");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("handles base64url -_ and missing padding", () => {
    // 0xFB 0xFF 0xBF -> standard base64 "+/+/", base64url "-_-_"
    const bytes = urlBase64ToUint8Array("-_-_");
    expect(Array.from(bytes)).toEqual([251, 255, 191]);
  });
});

describe("enableBrowserPush — permission gate then subscribe + POST", () => {
  it("registers /sw.js, subscribes with the VAPID key, and POSTs the subscription", async () => {
    const { env, register, subscribe, fetchSpy } = makeEnv();

    const res = await enableBrowserPush(env);

    expect(res).toEqual({ ok: true });
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/notifications/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ endpoint: "https://push.example/abc" });
  });

  it("stops at a denied permission — no register, no subscribe, no POST", async () => {
    const { env, register, subscribe, fetchSpy } = makeEnv({
      requestPermission: vi.fn().mockResolvedValue("denied"),
    });

    const res = await enableBrowserPush(env);

    expect(res).toEqual({ ok: false, reason: "denied" });
    expect(register).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports subscribe_failed when the server rejects the subscription", async () => {
    const { env } = makeEnv({
      fetch: vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch,
    });
    const res = await enableBrowserPush(env);
    expect(res).toEqual({ ok: false, reason: "subscribe_failed" });
  });

  it("reports unsupported when there is no push support in the env", async () => {
    const { env } = makeEnv();
    const res = await enableBrowserPush({ ...env, vapidPublicKey: "" });
    expect(res).toEqual({ ok: false, reason: "unsupported" });
  });
});
