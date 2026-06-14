// @vitest-environment jsdom
/**
 * END-TO-END proof of the Free Agents / Waivers player card (Prompt 56, Parts B–D). The P48/P54
 * lesson — a source smoke does NOT prove a user path — so this MOUNTS the real {@link WaiversClient}
 * in jsdom and drives the picker row through RTL:
 *   • the trailing info control opens the view-only {@link FaPlayerCardSheet} (Points overview + Stats);
 *   • CRITICALLY, tapping that control does NOT select the player for acquisition (the right-panel
 *     selection is unchanged — the config still shows its placeholder, no "Add free agent");
 *   • the EXISTING select tap still selects; the add/drop submit still POSTs /api/faab/free-agent.
 *
 * `next/navigation` is mocked (no app-router provider in jsdom) so we can assert `router.refresh()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatchWindow, WvPlayer } from "./types";
import type { Position } from "@app/shared";

beforeEach(() => refresh.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? null,
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? null,
  };
}

function fullRoster(): WvPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: WvPlayer[] = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (let i = 0; i < counts[pos]; i++) {
      out.push(player(`${pos}${i}`, { position: pos, shortName: `${pos} ${i}`, nation: "Spain" }));
    }
  }
  out[out.length - 1] = player("dropme", {
    position: "FWD",
    shortName: "DropTarget",
    nation: "Spain",
  });
  return out;
}

const FA_WINDOW: WvBatchWindow = {
  phase: "free-agency",
  caption: "Free agency open — locks at",
  value: "2:00 PM EDT",
  sub: "MD1",
  countdownToIso: null,
};

function view(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: fullRoster(),
    lockedPlayerIds: [],
    freeAgents: [
      player("mbappe", {
        name: "Kylian Mbappé",
        shortName: "K. Mbappé",
        position: "FWD",
        teamName: "France",
        seasonPoints: 42,
      }),
    ],
    claims: [],
    batches: [],
    waiverOrder: [],
    batchWindow: FA_WINDOW,
    timezone: "UTC",
    isPlayoffPhase: false,
    nowIso: "2026-06-11T17:30:00.000Z",
    ...over,
  };
}

const fa = () => within(screen.getByRole("region", { name: /free agents/i }));
const card = () => screen.getByRole("dialog", { name: /player card/i });

describe("Free Agents / Waivers player card (open-vs-add resolution)", () => {
  it("the info control opens the view-only card and does NOT select the player for acquisition", () => {
    // Stats fetch stays pending — the Points overview needs no fetch; the card still opens.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);

    // Pre-state: nothing selected → the config rail shows its placeholder, no "Add" CTA.
    expect(fa().getByText(/pick a free agent to add/i)).toBeTruthy();
    expect(fa().queryByRole("button", { name: /^Add free agent$/i })).toBeNull();

    // Open the card via the dedicated trailing control.
    fireEvent.click(fa().getByRole("button", { name: /view player card/i }));

    // The card is up: header season total, a Points overview row, and a Stats tab.
    expect(card()).toBeTruthy();
    expect(within(card()).getByText(/season points/i)).toBeTruthy();
    expect(within(card()).getByRole("tab", { name: "Stats" })).toBeTruthy();

    // …and the acquisition selection is UNTOUCHED — still the placeholder, still no "Add".
    expect(fa().getByText(/pick a free agent to add/i)).toBeTruthy();
    expect(fa().queryByRole("button", { name: /^Add free agent$/i })).toBeNull();
  });

  it("switching the open card to Stats renders the shared body (eager fetch, position tiles)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totals: { matches: 1, goals: 1, points: 8 },
              tiles: [
                { key: "matches", label: "Matches", value: 1 },
                { key: "goals", label: "Goals", value: 1 },
                { key: "shots", label: "Shots", value: 3 },
                { key: "points", label: "Points", value: 8 },
              ],
              games: [
                {
                  periodLabel: "MD1",
                  opponentTeamName: "Mexico",
                  opponentIso2: "MX",
                  isHome: true,
                  minutes: 90,
                  scoreline: "2–0",
                  result: "W",
                  points: 8,
                  lines: [{ key: "goals", label: "G", value: 1 }],
                },
              ],
            }),
        }),
      ),
    );
    render(<WaiversClient view={view()} />);
    fireEvent.click(fa().getByRole("button", { name: /view player card/i }));
    fireEvent.click(within(card()).getByRole("tab", { name: "Stats" }));

    expect(await within(card()).findByText("Mexico")).toBeTruthy();
    expect(within(card()).getByText("Shots")).toBeTruthy();
    expect(within(card()).getByText("2–0")).toBeTruthy();
  });

  it("the existing select tap still selects (unchanged) and does NOT open the card", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);

    fireEvent.click(fa().getByRole("button", { name: /Mbappé/ }));

    // Selecting reveals the "Adding" config (the Add CTA); the card is NOT open.
    expect(fa().getByRole("button", { name: /^Add free agent$/i })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /player card/i })).toBeNull();
  });

  it("the add/drop submit still POSTs /api/faab/free-agent exactly as before", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WaiversClient view={view()} />);

    fireEvent.click(fa().getByRole("button", { name: /Mbappé/ }));
    fireEvent.click(fa().getByRole("button", { name: /DropTarget/ }));
    fireEvent.click(fa().getByRole("button", { name: /^Add free agent$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/faab/free-agent");
    expect(JSON.parse(init.body as string)).toMatchObject({
      managerId: "m1",
      playerAddId: "mbappe",
      playerDropId: "dropme",
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
