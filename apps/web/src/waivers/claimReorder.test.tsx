// @vitest-environment jsdom
/**
 * END-TO-END proof of the pending-claim priority reorder (§D amendment), mounting the REAL
 * {@link WaiversClient} in jsdom (the P48/P54 lesson — a unit test does not prove a working user path):
 *   (a) claims render in EFFECTIVE PROCESSING ORDER (amount DESC → own priority ASC) with #n ordinals;
 *   (b) arrows are enabled ONLY between adjacent equal-amount claims — an amount boundary / list edge
 *       is disabled and hints "raise the bid";
 *   (c) an enabled arrow PUTs the FULL permutation to /api/faab/bid and refreshes on 200;
 *   (d) the footer states the amended rule (higher bids first; equal bids follow your order).
 *
 * `next/navigation` is mocked (no app-router provider in jsdom) so we can assert `router.refresh()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatchWindow, WvClaim, WvPlayer } from "./types";

beforeEach(() => refresh.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FUTURE = "2099-01-01T00:00:00.000Z"; // cutoff open (nothing voids)

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "FWD",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? "France",
    kickoffAt: over.kickoffAt ?? FUTURE,
    seasonPoints: over.seasonPoints ?? 10,
    ...over,
  };
}

const SEALED: WvBatchWindow = {
  phase: "sealed-bid",
  caption: "Waivers process at",
  value: "6:00 AM EDT",
  sub: "MD1",
  countdownToIso: null,
};

function claimOn(
  playerId: string,
  amount: number,
  bidId: string,
  priority: number | null,
): WvClaim {
  return { bidId, amount, priority, add: player(playerId, { shortName: playerId }), drop: null };
}

/** Sorted render: eq2($20,p1) → eq1($20,p2) → lone($5) — one equal-amount pair + a lone lower bid. */
const CLAIMS: WvClaim[] = [
  claimOn("lone", 5, "b-lone", 1),
  claimOn("eq1", 20, "b-eq1", 2),
  claimOn("eq2", 20, "b-eq2", 1),
];

function view(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: [],
    lockedPlayerIds: [],
    watchedPlayerIds: [],
    freeAgents: [],
    claims: CLAIMS,
    batches: [],
    waiverOrder: [],
    teamBudgets: [],
    batchWindow: SEALED,
    timezone: "UTC",
    isPlayoffPhase: false,
    rosterCap: 15,
    isParticipant: true,
    playoffForfeitDeadlineIso: null,
    nowIso: "2026-06-11T17:30:00.000Z",
    ...over,
  };
}

const claimRows = () => document.querySelectorAll(".wv-claim");

describe("WaiversClient — pending-claim priority reorder (§D amendment)", () => {
  it("(a) renders claims in effective processing order (amount DESC → priority ASC) with #n ordinals", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    const rows = [...claimRows()];
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("eq2"), // $20 priority 1
      expect.stringContaining("eq1"), // $20 priority 2
      expect.stringContaining("lone"), // $5
    ]);
    expect(rows.map((r) => r.querySelector(".wv-claim-ord")?.textContent)).toEqual([
      "#1",
      "#2",
      "#3",
    ]);
  });

  it("(b) arrows enable ONLY between adjacent equal-amount claims; boundaries/edges disable with the hint", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    const rows = [...claimRows()];
    const arrow = (row: Element, name: RegExp) =>
      [...row.querySelectorAll("button")].find((b) =>
        (b.getAttribute("aria-label") ?? "").match(name),
      )!;
    // row 0 (eq2, top): up disabled (edge), down enabled (equal-amount neighbor)
    expect(arrow(rows[0]!, /Move claim earlier/).disabled).toBe(true);
    expect(arrow(rows[0]!, /Move claim later/).disabled).toBe(false);
    // row 1 (eq1): up enabled, down disabled ($20 → $5 boundary) with the raise-the-bid hint
    expect(arrow(rows[1]!, /Move claim earlier/).disabled).toBe(false);
    const blockedDown = arrow(rows[1]!, /Move claim later/);
    expect(blockedDown.disabled).toBe(true);
    expect(blockedDown.title).toMatch(/raise the bid/i);
    // row 2 (lone): both disabled (boundary above, edge below)
    expect(arrow(rows[2]!, /Move claim earlier/).disabled).toBe(true);
    expect(arrow(rows[2]!, /Move claim later/).disabled).toBe(true);
  });

  it("(c) an enabled arrow PUTs the FULL permutation to /api/faab/bid and refreshes on 200", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WaiversClient view={view()} />);
    const rows = [...claimRows()];
    const down = [...rows[0]!.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Move claim later",
    )!;
    fireEvent.click(down);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe("/api/faab/bid");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      managerId: "m1",
      orderedBidIds: ["b-eq1", "b-eq2", "b-lone"], // the swapped pair + the untouched tail — full 1..N
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("(d) the footer states the amended rule: higher bids first, equal bids follow your order", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    expect(screen.getByText(/Higher bids process first/i).textContent).toMatch(
      /your equal bids follow your order/i,
    );
  });
});
