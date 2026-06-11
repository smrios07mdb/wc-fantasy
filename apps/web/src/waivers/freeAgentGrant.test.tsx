// @vitest-environment jsdom
/**
 * END-TO-END proof that the Waivers tab actually transacts an instant $0 free agent (Prompt 48's route
 * shipped + was unit-tested, but NOTHING in the UI ever called it — a sealed bid in the FA window won't
 * clear until the next batch). The P48/P54 lesson: a route-level test (or a source-contract smoke) does
 * NOT prove a working user path. So this MOUNTS the real {@link WaiversClient} in jsdom and drives the
 * FA "Add" control through RTL:
 *   • free-agency phase → picking a free agent + a drop + "Add" POSTs `/api/faab/free-agent` (add/drop,
 *     $0) and refreshes the screen on a 200;
 *   • the fa-conflict (409) first-come loss surfaces a friendly error and does NOT refresh;
 *   • locked phase → the add is disabled (the window is closed).
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
    teamName: over.teamName ?? "France",
    // far-future kickoff → cutoff open (acquirable)
    kickoffAt: over.kickoffAt ?? "2099-01-01T00:00:00.000Z",
    seasonPoints: over.seasonPoints ?? 10,
    ...over,
  };
}

/** A full 15-man squad (2/5/5/3) so an FA add REQUIRES a drop; the last FWD is the named drop target. */
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
      player("mbappe", { name: "Kylian Mbappé", shortName: "K. Mbappé", position: "FWD" }),
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

describe("Waivers FA tab — instant $0 free-agency grant (the wiring P48 was missing)", () => {
  it("free-agency: Add posts the $0 grant (add + drop) to /api/faab/free-agent and refreshes", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        new Response(JSON.stringify({ ok: true, playerAddId: "mbappe" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<WaiversClient view={view()} />);

    // pick the free agent → pick the (required) drop → Add
    fireEvent.click(fa().getByRole("button", { name: /Mbappé/ }));
    fireEvent.click(fa().getByRole("button", { name: /DropTarget/ }));
    fireEvent.click(fa().getByRole("button", { name: /^Add free agent$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/faab/free-agent");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      managerId: "m1",
      playerAddId: "mbappe",
      playerDropId: "dropme",
    });
    // the roster move applies via a server re-read
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("fa-conflict (409): the first-come loser sees a friendly error and the screen is NOT refreshed", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "fa-conflict" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<WaiversClient view={view()} />);
    fireEvent.click(fa().getByRole("button", { name: /Mbappé/ }));
    fireEvent.click(fa().getByRole("button", { name: /DropTarget/ }));
    fireEvent.click(fa().getByRole("button", { name: /^Add free agent$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      await fa().findByText(/just (grabbed|claimed)|someone|no longer available/i),
    ).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("locked: the FA add is disabled (the acquisition window is closed)", () => {
    render(<WaiversClient view={view({ batchWindow: { ...FA_WINDOW, phase: "locked" } })} />);
    fireEvent.click(fa().getByRole("button", { name: /Mbappé/ }));
    const add = fa().getByRole("button", { name: /^Add free agent$/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });

  it("sealed-bid: the FA list is NOT shown — the sealed claim form is unchanged", () => {
    render(<WaiversClient view={view({ batchWindow: { ...FA_WINDOW, phase: "sealed-bid" } })} />);
    expect(screen.queryByRole("region", { name: /free agents/i })).toBeNull();
    // the existing sealed CTA is still present
    expect(screen.getAllByRole("button", { name: /new claim/i }).length).toBeGreaterThan(0);
  });
});
