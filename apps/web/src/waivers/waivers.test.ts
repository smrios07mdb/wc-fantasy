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
const faPanel = read("FreeAgentPanel.tsx");
const page = read("../../app/waivers/page.tsx");
const layout = read("../../app/waivers/layout.tsx");
const loader = read("../../app/waivers/loadWaivers.ts");
const faStore = read("../../../../packages/faab/src/prismaStore.ts");
const faElig = read("../../../../packages/faab/src/faEligibility.ts");

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

  it("renders the REAL per-period batch window (no leftover illustrative placeholder) + scoped CSS", () => {
    // The static daily placeholder is gone; the screen renders the live window from the server.
    expect(client).not.toContain("illustrative cadence");
    expect(client).not.toContain("batchLocalTime");
    expect(client).toContain("BatchBar");
    expect(client).toContain("view.batchWindow");
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

  it("derives the next-batch window from the SHARED @app/faab kernel (one source of truth w/ the worker)", () => {
    // The displayed time MUST come from the same fns the worker fires against — not a web-local copy.
    expect(loader).toContain("acquisitionWindowState");
    expect(loader).toContain("effectiveBatchAt");
    expect(loader).toContain("buildBatchWindowView");
    expect(loader).toContain("DEFAULT_FAAB_BATCH_LEAD_MIN");
  });
});

describe("instant $0 free-agency — Waivers-tab surface (Prompt 48 route, finally wired)", () => {
  it("the loader offers the LIVE-UNOWNED pool in EVERY phase via the shared predicate (no snapshot branch)", () => {
    // Jun 18 2026: a player is a free agent the moment he holds no active spot. The FA list = the live
    // free-agent set the grant accepts, resolved via the ONE predicate the route re-checks — phase-agnostic.
    // The retired snapshot branch (faSnapshotAt / phase-gated pool) is gone.
    expect(loader).toMatch(/listFaIneligiblePlayerIds\(prisma, leagueId\)/);
    expect(loader).not.toContain("faSnapshotAt");
    expect(loader).not.toMatch(/phase === "free-agency"/); // the pool is no longer gated on the FA phase
  });

  it("the FA eligibility predicate is defined ONCE (per-player re-check + grant + batch list share it)", () => {
    // Single source of truth: liveOwnedWhere is the ONE predicate (pure faEligibility.ts, IO-free), imported
    // by the Prisma adapter and counted in getFaTargetFacts (one player), claimFreeAgent (the grant
    // re-check), AND listFaIneligiblePlayerIds (the pool) — so they cannot drift. Snapshot predicate gone.
    expect(faElig).toContain("export function liveOwnedWhere");
    expect(faStore).toContain('from "./faEligibility"');
    expect(faStore).not.toContain("snapshotOwnershipWhere");
    expect(faStore.match(/liveOwnedWhere\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(faStore).toContain("export async function listFaIneligiblePlayerIds");
  });

  it("the client round-trips the instant grant through /api/faab/free-agent + refreshes", () => {
    expect(client).toContain('"/api/faab/free-agent"');
    expect(client).toContain("FreeAgentPanel");
    expect(client).toContain("handleGrant");
    // phase-switched: FA surface only in free-agency/locked; the sealed form is otherwise unchanged.
    expect(client).toMatch(/faMode/);
    expect(client).toMatch(/phase === "free-agency"/);
  });

  it("the FA panel REUSES the sealed composer's drop/roster + pool logic (no duplicated rules)", () => {
    expect(faPanel).toContain("droppableRoster");
    expect(faPanel).toContain("claimableFreeAgents");
    expect(faPanel).toContain("SQUAD_SIZE"); // drop required only once the squad is full
    expect(faPanel).toContain("Add free agent");
  });
});
