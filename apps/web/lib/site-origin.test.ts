import { describe, it, expect, afterEach } from "vitest";
import { siteOrigin } from "./site-origin";

const ORIGINAL = process.env.SITE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = ORIGINAL;
});

const req = (url: string, headers: Record<string, string> = {}): Request =>
  new Request(url, { headers });

describe("siteOrigin", () => {
  it("(a) prefers SITE_URL and strips a trailing slash", () => {
    process.env.SITE_URL = "https://wc-fantasy-web.onrender.com/";
    // Even though the request looks like the internal Render bind, the pinned env wins.
    expect(siteOrigin(req("https://localhost:10000/auth/callback?code=x"))).toBe(
      "https://wc-fantasy-web.onrender.com",
    );
  });

  it("(b) with no env, uses x-forwarded-host (+ x-forwarded-proto)", () => {
    delete process.env.SITE_URL;
    expect(
      siteOrigin(
        req("https://localhost:10000/auth/callback", {
          "x-forwarded-host": "wc-fantasy-web.onrender.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://wc-fantasy-web.onrender.com");
  });

  it("(c) with no env and no forwarded headers, uses the request origin (correct scheme)", () => {
    delete process.env.SITE_URL;
    // Local dev: http + localhost:3000 must be preserved (NOT defaulted to https).
    expect(siteOrigin(req("http://localhost:3000/auth/callback"))).toBe("http://localhost:3000");
  });
});
