// @vitest-environment jsdom
/**
 * The /players → /waivers?bid= hand-off (PLAYERS-1). Two layers:
 *   1. the PURE `resolveBidDeepLink` matrix (open+claimable → preselect; closed / owned / unknown /
 *      cutoff-passed / no-act → null, never throws); S3 — an already-bid target now PRESELECTS (2nd bid);
 *   2. the INTEGRATION — mounting the real {@link WaiversClient} with `deepLinkBidPlayerId` and proving
 *      it preselects via the EXISTING setSelected path (sealed-bid → composer opens on the player;
 *      free-agency → the FA panel's "Add" is armed) and is a graceful no-op otherwise.
 *
 * The bid submit path / FAAB engine / composer internals are untouched — this is preselection only.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { resolveBidDeepLink } from "./waiversLogic";
import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatchWindow, WvClaim, WvPlayer } from "./types";
import type { Position } from "@app/shared";
import type { AcquisitionWindow } from "@app/faab";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-06-11T17:30:00.000Z");
const FUTURE = "2026-06-11T20:00:00.000Z";
const PAST = "2026-06-11T16:00:00.000Z";

function wvPlayer(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "FWD",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? "France",
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? 10,
  };
}

// ── layer 1: the pure resolver ──────────────────────────────────────────────────────────────────
describe("resolveBidDeepLink — the matrix", () => {
  const fa = wvPlayer("mbappe", {
    name: "Kylian Mbappé",
    shortName: "K. Mbappé",
    kickoffAt: FUTURE,
  });
  const base = {
    playerId: "mbappe",
    canAct: true,
    freeAgents: [fa],
    now: NOW,
  };

  it("open sealed-bid + claimable ⇒ preselect (sealed-bid mode)", () => {
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid" })).toEqual({
      mode: "sealed-bid",
      player: fa,
    });
  });
  it("open free-agency + claimable ⇒ preselect (free-agency mode)", () => {
    expect(resolveBidDeepLink({ ...base, phase: "free-agency" })).toEqual({
      mode: "free-agency",
      player: fa,
    });
  });
  it("locked window ⇒ null", () => {
    expect(resolveBidDeepLink({ ...base, phase: "locked" })).toBeNull();
  });
  it("no live window (null phase) ⇒ null", () => {
    expect(resolveBidDeepLink({ ...base, phase: null })).toBeNull();
  });
  it("cannot act (playoff non-participant) ⇒ null", () => {
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid", canAct: false })).toBeNull();
  });
  it("unknown / null player id ⇒ null", () => {
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid", playerId: "ghost" })).toBeNull();
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid", playerId: null })).toBeNull();
  });
  it("owned since (not in the free-agent pool) ⇒ null", () => {
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid", freeAgents: [] })).toBeNull();
  });
  it("cutoff already passed (his match kicked off) ⇒ null", () => {
    const kicked = wvPlayer("mbappe", { kickoffAt: PAST });
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid", freeAgents: [kicked] })).toBeNull();
  });
  it("S3: an already-bid target still resolves — the pool is claims-agnostic (preselects a 2nd bid)", () => {
    // The resolver no longer consults the viewer's claims, so a player he already bid on stays claimable
    // and preselects. The user-facing second-bid flow is asserted end-to-end in the integration block.
    expect(resolveBidDeepLink({ ...base, phase: "sealed-bid" })).toEqual({
      mode: "sealed-bid",
      player: fa,
    });
  });
});

// ── layer 2: WaiversClient integration ───────────────────────────────────────────────────────────
function fullRoster(): WvPlayer[] {
  const counts: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const out: WvPlayer[] = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (let i = 0; i < counts[pos]; i++)
      out.push(wvPlayer(`${pos}${i}`, { position: pos, shortName: `${pos} ${i}` }));
  }
  return out;
}

function window(phase: AcquisitionWindow): WvBatchWindow {
  return {
    phase,
    caption: phase === "sealed-bid" ? "Waivers process at" : "Free agency open — locks at",
    value: "2:00 PM EDT",
    sub: "R16",
    countdownToIso: null,
  };
}

function view(phase: AcquisitionWindow, over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: fullRoster(),
    lockedPlayerIds: [],
    watchedPlayerIds: [],
    freeAgents: [
      wvPlayer("mbappe", { name: "Kylian Mbappé", shortName: "K. Mbappé", kickoffAt: FUTURE }),
    ],
    claims: [],
    batches: [],
    waiverOrder: [],
    teamBudgets: [],
    batchWindow: window(phase),
    timezone: "UTC",
    isPlayoffPhase: false,
    rosterCap: 15,
    isParticipant: true,
    playoffForfeitDeadlineIso: null,
    nowIso: NOW.toISOString(),
    ...over,
  };
}

describe("WaiversClient — deep-link preselection (open + claimable)", () => {
  it("sealed-bid: the composer opens PRESELECTED on the deep-linked player (not the empty placeholder)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view("sealed-bid")} deepLinkBidPlayerId="mbappe" />);

    const dialog = screen.getByRole("dialog", { name: /waiver claim/i });
    // Preselected ⇒ the "pick a free agent" placeholder is gone and the player shows in the picker.
    expect(within(dialog).queryByText(/pick a free agent to configure/i)).toBeNull();
    expect(within(dialog).getAllByText(/K\. Mbappé/).length).toBeGreaterThan(0);
  });

  it("free-agency: the FA panel is armed (Add enabled) on the deep-linked player", () => {
    render(<WaiversClient view={view("free-agency")} deepLinkBidPlayerId="mbappe" />);
    const fa = within(screen.getByRole("region", { name: /free agents/i }));
    // Selected ⇒ the "Add free agent" CTA is present (absent when nothing is selected).
    expect(fa.getByRole("button", { name: /^Add free agent$/i })).toBeTruthy();
  });

  it("S2/S3: sealed-bid preselects a player the viewer ALREADY has a pending bid on, badged 'Your bid ×1'", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const existing: WvClaim = {
      bidId: "b1",
      amount: 5,
      add: wvPlayer("mbappe", { name: "Kylian Mbappé", shortName: "K. Mbappé", kickoffAt: FUTURE }),
      drop: null,
    };
    render(
      <WaiversClient
        view={view("sealed-bid", { claims: [existing] })}
        deepLinkBidPlayerId="mbappe"
      />,
    );
    const dialog = screen.getByRole("dialog", { name: /waiver claim/i });
    // Preselected DESPITE the existing bid ⇒ the placeholder is gone and the player shows in the picker.
    expect(within(dialog).queryByText(/pick a free agent to configure/i)).toBeNull();
    expect(within(dialog).getAllByText(/K\. Mbappé/).length).toBeGreaterThan(0);
    // S2 indicator: the composer's pool row shows the viewer's existing bid count on this player.
    expect(within(dialog).getByText(/Your bid ×1/)).toBeTruthy();
  });
});

describe("WaiversClient — deep-link no-op (graceful, no throw)", () => {
  it("locked window: no composer auto-opens, no FA selection", () => {
    render(<WaiversClient view={view("locked")} deepLinkBidPlayerId="mbappe" />);
    expect(screen.queryByRole("dialog", { name: /waiver claim/i })).toBeNull();
    const fa = within(screen.getByRole("region", { name: /free agents/i }));
    expect(fa.queryByRole("button", { name: /^Add free agent$/i })).toBeNull();
  });

  it("unknown player id in an open window: composer stays closed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view("sealed-bid")} deepLinkBidPlayerId="ghost" />);
    expect(screen.queryByRole("dialog", { name: /waiver claim/i })).toBeNull();
  });

  it("no deep-link param at all: renders normally, composer closed", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<WaiversClient view={view("sealed-bid")} />);
    expect(screen.queryByRole("dialog", { name: /waiver claim/i })).toBeNull();
  });
});
