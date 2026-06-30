// @vitest-environment jsdom
/**
 * Proof for T11 Fix B (waivers period-scoping correction). T11 over-applied a prior-matchday selector to
 * the whole /waivers screen (a top "Stat sheet" tab strip that re-scoped the player drill-down). The FA
 * pool / claims / player cards are live/global and period-less by design, so that selector is removed and
 * the period concept is confined to the Batch results tab — each settled batch is LABELLED with the
 * matchday/round it cleared. This MOUNTS the real {@link WaiversClient} (the P48/P54 lesson: a source smoke
 * doesn't prove a user path) and asserts:
 *   • the over-applied "Matchday stat sheet" selector is GONE (no tablist, even with prior matchdays);
 *   • the player info control still opens the period-less {@link FaPlayerCardSheet} (live/global restored);
 *   • the Batch results tab shows each batch's matchday label.
 *
 * `next/navigation` is mocked (no app-router provider in jsdom).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatch, WvPlayer } from "./types";

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

const MD2_BATCH: WvBatch = {
  batchId: "b-md2",
  runAt: "2026-06-14T19:00:00.000Z",
  matchdayLabel: "Group MD2",
  results: [
    {
      bidId: "r1",
      managerId: "m2",
      managerName: "Rivera",
      isMine: false,
      add: player("haaland", { shortName: "E. Haaland", position: "FWD" }),
      drop: null,
      amount: 30,
      outcome: "won",
    },
  ],
};

function view(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: [],
    lockedPlayerIds: [],
    watchedPlayerIds: [],
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
    batches: [MD2_BATCH],
    waiverOrder: [],
    batchWindow: {
      phase: "free-agency",
      caption: "Free agency open — locks at",
      value: "2:00 PM EDT",
      sub: "MD3",
      countdownToIso: null,
    },
    timezone: "UTC",
    isPlayoffPhase: false,
    rosterCap: 15,
    isParticipant: true,
    playoffForfeitDeadlineIso: null,
    nowIso: "2026-06-14T17:30:00.000Z",
    ...over,
  };
}

describe("waivers — period concept confined to Batch results (T11 Fix B)", () => {
  it("does NOT render the over-applied 'Stat sheet' matchday selector", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    // The removed top selector was a tablist labelled "Matchday stat sheet" — it must not exist.
    expect(screen.queryByRole("tablist", { name: /matchday stat sheet/i })).toBeNull();
    // The only tablist is the page's own "Waivers" tabs (My claims / Batch results).
    expect(screen.getByRole("tablist", { name: /waivers/i })).toBeTruthy();
  });

  it("the FA player info control opens the period-less player card (live/global restored)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    const fa = within(screen.getByRole("region", { name: /free agents/i }));
    fireEvent.click(fa.getByRole("button", { name: /view player card/i }));
    // It is the period-less FaPlayerCardSheet ("player card" dialog), never a per-period box score.
    expect(screen.getByRole("dialog", { name: /player card/i })).toBeTruthy();
  });

  it("labels each settled batch with its matchday in the Batch results tab", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view()} />);
    fireEvent.click(screen.getByRole("tab", { name: /batch results/i }));
    // The batch card carries the matchday label (per-matchday outcomes).
    expect(screen.getByText(/Group MD2/)).toBeTruthy();
  });
});
