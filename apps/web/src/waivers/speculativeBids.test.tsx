// @vitest-environment jsdom
/**
 * END-TO-END proof of the S1/S2/S3 speculative-bidding relaxations (commissioner amendment 2026-07-07),
 * mounting the REAL {@link WaiversClient} in jsdom — the P48/P54 lesson: a route/unit test does not prove
 * a working user path. Covers:
 *   (a) S2/S3 — TWO sealed bids on the SAME player (different drops) both POST /api/faab/bid, and a player
 *       the viewer already bid on stays in the pool badged "Your bid ×N" (no longer hidden);
 *   (b) S1 — a bid whose amount over-commits the SUM of pending vs budget is still ACCEPTED at submission;
 *   (c) S1 — the persistent overage notice + an unclamped negative "after pending" render when the sum of
 *       pending bids exceeds the budget.
 *
 * `next/navigation` is mocked (no app-router provider in jsdom) so we can assert `router.refresh()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatchWindow, WvClaim, WvPlayer } from "./types";
import type { Position } from "@app/shared";

beforeEach(() => refresh.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FUTURE = "2099-01-01T00:00:00.000Z"; // cutoff open (acquirable)

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

/** A full 15-man squad (2/5/5/3) so a bid REQUIRES a drop; two named drop targets, ids `alpha`/`beta`. */
function fullRoster(): WvPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: WvPlayer[] = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (let i = 0; i < counts[pos]; i++) {
      out.push(player(`${pos}${i}`, { position: pos, shortName: `${pos} ${i}`, nation: "Spain" }));
    }
  }
  out[0] = player("alpha", {
    position: "GK",
    shortName: "AlphaDrop",
    nation: "Spain",
    seasonPoints: 1,
  });
  out[1] = player("beta", {
    position: "GK",
    shortName: "BetaDrop",
    nation: "Spain",
    seasonPoints: 2,
  });
  return out;
}

const MBAPPE = player("mbappe", { name: "Kylian Mbappé", shortName: "K. Mbappé", position: "FWD" });

const SEALED: WvBatchWindow = {
  phase: "sealed-bid",
  caption: "Waivers process at",
  value: "6:00 AM EDT",
  sub: "MD1",
  countdownToIso: null,
};

function view(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: fullRoster(),
    lockedPlayerIds: [],
    watchedPlayerIds: [],
    freeAgents: [MBAPPE],
    claims: [],
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

function claimOn(
  playerId: string,
  amount: number,
  bidId: string,
  over: Partial<WvPlayer> = {},
): WvClaim {
  return { bidId, amount, add: player(playerId, over), drop: null };
}

const dialog = () => screen.getByRole("dialog", { name: /waiver claim/i });
const okBid = vi.fn(
  async (_url: string, _init: { method: string; body: string }) =>
    new Response(JSON.stringify({ ok: true, bid: { bidId: "x" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
);

describe("WaiversClient — S2/S3 speculative bids (duplicate + own-bid-visible pool)", () => {
  it("(a) places TWO sealed bids on the SAME player with different drops — both POST /api/faab/bid", async () => {
    const fetchMock = okBid.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    render(<WaiversClient view={view()} />);

    // bid 1: mbappe + AlphaDrop
    fireEvent.click(screen.getAllByRole("button", { name: /New claim/i })[0]!);
    fireEvent.click(within(dialog()).getByRole("button", { name: /Mbappé/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /AlphaDrop/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /Queue sealed bid/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /waiver claim/i })).toBeNull());

    // bid 2: the SAME player mbappe + a DIFFERENT drop (BetaDrop) — allowed, no duplicate-target block
    fireEvent.click(screen.getAllByRole("button", { name: /New claim/i })[0]!);
    fireEvent.click(within(dialog()).getByRole("button", { name: /Mbappé/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /BetaDrop/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /Queue sealed bid/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(fetchMock.mock.calls.every((c) => c[0] === "/api/faab/bid")).toBe(true);
    expect(bodies[0]).toMatchObject({ playerAddId: "mbappe", playerDropId: "alpha" });
    expect(bodies[1]).toMatchObject({ playerAddId: "mbappe", playerDropId: "beta" });
  });

  it("(a) a player the viewer already bid on stays in the pool badged 'Your bid ×2', both claims listed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <WaiversClient
        view={view({
          claims: [
            claimOn("mbappe", 5, "b1", { name: "Kylian Mbappé", shortName: "K. Mbappé" }),
            claimOn("mbappe", 8, "b2", { name: "Kylian Mbappé", shortName: "K. Mbappé" }),
          ],
        })}
      />,
    );
    // both claims listed
    expect(screen.getByText(/Pending claims · 2/)).toBeTruthy();
    expect(screen.getAllByText(/K\. Mbappé/).length).toBeGreaterThanOrEqual(2);
    // pool row still visible (claims-agnostic) with the "Your bid ×2" indicator
    fireEvent.click(screen.getByRole("button", { name: /New claim/i }));
    expect(within(dialog()).getByText(/Your bid ×2/)).toBeTruthy();
  });
});

describe("WaiversClient — S1 over-commit allowed + overage surfaced", () => {
  it("(b) accepts a bid whose amount over-commits the SUM of pending vs budget (pending 80 + 30 on 100)", async () => {
    const fetchMock = okBid.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <WaiversClient
        view={view({
          freeAgents: [player("haaland", { shortName: "Haaland" })],
          claims: [claimOn("other", 80, "b1")],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /New claim/i }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /Haaland/ }));
    fireEvent.change(within(dialog()).getByRole("spinbutton"), { target: { value: "30" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: /AlphaDrop/ }));
    fireEvent.click(within(dialog()).getByRole("button", { name: /Queue sealed bid/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // 80 already pending + a 30 bid = 110 > 100 budget, but a single bid ≤ budget is accepted (S1 — the
    // over-commit rejection is retired; the batch's budget-exhausted skip is the enforcement).
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      playerAddId: "haaland",
      amount: 30,
    });
  });

  it("(c) renders the persistent overage notice + an unclamped negative 'after pending' when pending > budget", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <WaiversClient view={view({ claims: [claimOn("p1", 80, "b1"), claimOn("p2", 40, "b2")] })} />,
    );
    expect(screen.getByText(/Pending bids exceed your budget/i)).toBeTruthy();
    // after = 100 − 120 = −20, shown unclamped (never floored at 0)
    expect(screen.getByText("$-20")).toBeTruthy();
  });
});
