import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the waivers screen. The repo's Vitest run has NO DOM/JSX
// transform (by design — see components/Brand.test.ts + shell/appShell.test.ts), so we verify the
// load-bearing CONTRACTS from source rather than mounting. The screen's actual BEHAVIOUR (void
// derivation, claim order, budget caps, claimable/droppable filtering) is unit-tested against the pure
// core in waiversLogic.test.ts; here we guard the wiring the component + route depend on.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const client = read("WaiversClient.tsx");
const composer = read("BidComposer.tsx");
const page = read("../../app/waivers/page.tsx");
const layout = read("../../app/waivers/layout.tsx");
const loader = read("../../app/waivers/loadWaivers.ts");

describe("WaiversClient — interactive surface wiring", () => {
  it("is a Client Component (needs state + fetch)", () => {
    expect(client).toMatch(/^\s*["']use client["']/m);
  });

  it("renders BOTH tabs and tracks the active tab", () => {
    expect(client).toContain("My claims");
    expect(client).toContain("Batch results");
    expect(client).toMatch(/setTab\(["']claims["']\)/);
    expect(client).toMatch(/setTab\(["']results["']\)/);
  });

  it("round-trips every mutation through /api/faab/bid with the right verb", () => {
    expect(client).toContain('"/api/faab/bid"');
    expect(client).toMatch(/callBid\(\s*["']POST["']/); // submit
    expect(client).toMatch(/callBid\(\s*["']PATCH["']/); // edit
    expect(client).toMatch(/callBid\(\s*["']DELETE["']/); // cancel
  });

  it("refetches via router.refresh() after a successful mutation", () => {
    expect(client).toContain("useRouter");
    expect(client).toContain("router.refresh()");
  });

  it("renders the empty state when there are no pending claims", () => {
    expect(client).toContain("No pending claims.");
  });

  it("applies the void+refund state from the live cutoff check (isClaimVoid)", () => {
    expect(client).toContain("isClaimVoid");
    expect(client).toMatch(/voided=\{isClaimVoid\(/);
  });

  it("stays fully sealed — never surfaces rival bid counts", () => {
    expect(client.toLowerCase()).not.toContain("rival");
    expect(client).not.toContain("rivalBids");
  });

  it("labels the next-batch cadence illustrative and imports the scoped CSS", () => {
    expect(client).toContain("illustrative cadence");
    expect(client).toContain('"./waivers.css"');
  });
});

describe("BidComposer — place + edit, engine-consistent validation", () => {
  it("fixes the add target on edit (change-add = cancel+resubmit)", () => {
    expect(composer).toContain("editClaim");
    expect(composer).toMatch(/To claim a different player/);
  });

  it("caps the bid at the engine's available budget (composerMaxBid)", () => {
    expect(composer).toContain("composerMaxBid");
    expect(composer).toContain("droppableRoster");
  });

  it("leaves the deferred reorder seam as a TODO(confirm) on the priority migration", () => {
    expect(read("components.tsx")).toMatch(/TODO\(confirm\):[\s\S]*priority/);
  });
});

describe("waivers route — gate + mount + self-scoped reads", () => {
  it("page gates on getSessionManager and redirects unauthenticated/denied", () => {
    expect(page).toContain("getSessionManager");
    expect(page).toContain('redirect("/sign-in")');
    expect(page).toContain('redirect("/auth/denied")');
    expect(page).toContain("WaiversClient");
  });

  it("layout mounts the App Shell with the waivers nav id active", () => {
    expect(layout).toContain("AppShell");
    expect(layout).toContain('active="waivers"');
  });

  it("loader self-scopes pending claims, reads public complete batches, and locks via @app/lineup", () => {
    expect(loader).toMatch(/status:\s*["']pending["']/);
    expect(loader).toMatch(/status:\s*["']complete["']/);
    expect(loader).toContain("take: 5");
    expect(loader).toContain("findLockedSlotPlayerIds");
  });
});
