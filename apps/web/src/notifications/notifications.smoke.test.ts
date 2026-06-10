import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-41a transport surface (the Vitest run has no DOM, so
// we verify the load-bearing wiring from source — same convention as settings.test.ts). The behavioural
// proofs live in handlers.test.ts / pushClient.test.ts / dispatch.test.ts; this guards the GLUE: the
// service worker, the registration island, and the four thin routes.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const sw = read("../../public/sw.js");
const island = read("./NotificationsClient.tsx");
const subscribeRoute = read("../../app/api/notifications/subscribe/route.ts");
const unsubscribeRoute = read("../../app/api/notifications/unsubscribe/route.ts");
const preferencesRoute = read("../../app/api/notifications/preferences/route.ts");
const testRoute = read("../../app/api/notifications/test/route.ts");

describe("service worker (/sw.js) — push display + click focus", () => {
  it("handles the push event and shows a notification", () => {
    expect(sw).toMatch(/addEventListener\(\s*["']push["']/);
    expect(sw).toContain("showNotification");
  });

  it("reads the @app/notify payload shape (title / body / url / tag)", () => {
    expect(sw).toContain("payload.title");
    expect(sw).toContain("payload.body");
    expect(sw).toContain("payload.url");
    expect(sw).toContain("payload.tag");
  });

  it("handles notificationclick by focusing or opening the app", () => {
    expect(sw).toMatch(/addEventListener\(\s*["']notificationclick["']/);
    expect(sw).toContain("clients.matchAll");
    expect(sw).toContain("openWindow");
  });

  it("does NOT intercept fetch (no offline shell — boring + reliable)", () => {
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
  });
});

describe("NotificationsClient island — toggles + enable/test wiring", () => {
  it("is a Client Component", () => {
    expect(island).toMatch(/^\s*["']use client["']/m);
  });

  it("renders the three preference toggles from the three keys", () => {
    expect(island).toContain("draftTurn");
    expect(island).toContain("playerNotStarting");
    expect(island).toContain("matchStarting");
  });

  it("seeds the toggles from the server-provided initial prefs", () => {
    expect(island).toContain("initial");
    expect(island).toContain("useState");
  });

  it("Enable wires the permission→register→subscribe path via enableBrowserPush", () => {
    expect(island).toContain("enableBrowserPush");
    expect(island).toContain("Enable browser notifications");
  });

  it("reads the build-time VAPID public key for the browser subscribe", () => {
    expect(island).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  });

  it("persists toggles to /preferences and probes via /test", () => {
    expect(island).toContain('"/api/notifications/preferences"');
    expect(island).toContain('"/api/notifications/test"');
  });
});

describe("the four thin routes — POST handlers wired to the framework-agnostic handlers", () => {
  it("subscribe route POSTs through handleSubscribe", () => {
    expect(subscribeRoute).toContain("export async function POST");
    expect(subscribeRoute).toContain("handleSubscribe");
    expect(subscribeRoute).toContain('export const dynamic = "force-dynamic"');
  });

  it("unsubscribe route POSTs through handleUnsubscribe", () => {
    expect(unsubscribeRoute).toContain("handleUnsubscribe");
  });

  it("preferences route POSTs through handlePreferences", () => {
    expect(preferencesRoute).toContain("handlePreferences");
  });

  it("test route POSTs through handleTest", () => {
    expect(testRoute).toContain("handleTest");
  });
});
