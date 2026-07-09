// @vitest-environment jsdom
/**
 * CUTOFF-TAG (W2-06 / spec v6) — the displayed acquisition deadline is the ACTIONABLE cutoff: the EARLIER
 * of the period's waiver batch fire and the player's kickoff-void boundary, NEVER the bare per-player
 * kickoff. This proves the label per GOVERNING bound on each real surface (source smoke does not prove a
 * user path — P48/P54 lesson), driving the components through RTL:
 *
 *   • the shared `CutoffTag` atom — the label text (the non-color signal) per bound;
 *   • the FA card sheet (`FaPlayerCardSheet`) — the shared /waivers + /players player card;
 *   • a /waivers claim row (`ClaimRow` via `WaiversClient`) — the sealed-bid "voids at kickoff" case.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CutoffTag } from "./components";
import { FaPlayerCardSheet } from "./FaPlayerCardSheet";
import { WaiversClient } from "./WaiversClient";
import type { WaiversView, WvBatchWindow, WvClaim, WvPlayer } from "./types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-06-11T17:30:00.000Z");
const BATCH = new Date("2026-06-11T20:00:00.000Z"); // +2.5h
const KO_BEFORE_BATCH = "2026-06-11T19:00:00.000Z"; // +1.5h — kicks off BEFORE the batch → void
const KO_AFTER_BATCH = "2026-06-11T21:00:00.000Z"; // +3.5h — kicks off AFTER the batch → batch governs
const KO_PAST = "2026-06-11T16:00:00.000Z"; // −1.5h — already kicked off

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? "France",
    kickoffAt: over.kickoffAt ?? KO_AFTER_BATCH,
    seasonPoints: over.seasonPoints ?? 12,
    ...over,
  };
}

// ── the shared atom: label per governing bound ──────────────────────────────────────────────────
describe("CutoffTag — the label names the governing bound (min(batch, kickoff))", () => {
  it("batch before kickoff → 'to batch' (bidding closes at the batch)", () => {
    render(
      <CutoffTag player={player("a", { kickoffAt: KO_AFTER_BATCH })} now={NOW} batchAt={BATCH} />,
    );
    expect(screen.getByText(/to batch/)).toBeTruthy();
    expect(screen.queryByText(/voids at kickoff/)).toBeNull();
  });

  it("kickoff before batch → 'voids at kickoff' (a bid would refund)", () => {
    render(
      <CutoffTag player={player("a", { kickoffAt: KO_BEFORE_BATCH })} now={NOW} batchAt={BATCH} />,
    );
    expect(screen.getByText(/voids at kickoff/)).toBeTruthy();
    expect(screen.queryByText(/to batch/)).toBeNull();
  });

  it("no batch scheduled → 'to kickoff' (the plain availability bound)", () => {
    render(
      <CutoffTag player={player("a", { kickoffAt: KO_AFTER_BATCH })} now={NOW} batchAt={null} />,
    );
    expect(screen.getByText(/to kickoff/)).toBeTruthy();
    expect(screen.queryByText(/to batch/)).toBeNull();
  });

  it("already kicked off → 'cutoff passed' (regardless of a future batch)", () => {
    render(<CutoffTag player={player("a", { kickoffAt: KO_PAST })} now={NOW} batchAt={BATCH} />);
    expect(screen.getByText(/cutoff passed/)).toBeTruthy();
  });
});

// ── surface 1: the shared FA card sheet (/waivers + /players player card) ────────────────────────
describe("FaPlayerCardSheet — Acquisition row shows the actionable cutoff", () => {
  it("sealed-bid + kickoff after batch → the card reads 'to batch', not the bare kickoff", () => {
    render(
      <FaPlayerCardSheet
        player={player("mbappe", { name: "Kylian Mbappé", kickoffAt: KO_AFTER_BATCH })}
        now={NOW}
        batchAt={BATCH}
        onClose={() => {}}
      />,
    );
    const card = screen.getByRole("dialog", { name: /player card/i });
    expect(within(card).getByText(/to batch/)).toBeTruthy();
  });

  it("kickoff before the batch → the card warns 'voids at kickoff'", () => {
    render(
      <FaPlayerCardSheet
        player={player("mbappe", { name: "Kylian Mbappé", kickoffAt: KO_BEFORE_BATCH })}
        now={NOW}
        batchAt={BATCH}
        onClose={() => {}}
      />,
    );
    const card = screen.getByRole("dialog", { name: /player card/i });
    expect(within(card).getByText(/voids at kickoff/)).toBeTruthy();
  });
});

// ── surface 2: a /waivers claim row (sealed-bid pending claim) ───────────────────────────────────
const SEALED_WINDOW: WvBatchWindow = {
  phase: "sealed-bid",
  caption: "Waivers process at",
  value: "8:00 PM UTC",
  sub: "MD1",
  countdownToIso: BATCH.toISOString(),
};

function claim(id: string, add: WvPlayer): WvClaim {
  return { bidId: id, amount: 10, priority: null, add, drop: null };
}

function sealedView(over: Partial<WaiversView> = {}): WaiversView {
  return {
    managerId: "m1",
    faabBudget: 100,
    roster: [],
    lockedPlayerIds: [],
    watchedPlayerIds: [],
    freeAgents: [],
    claims: over.claims ?? [],
    batches: [],
    waiverOrder: [],
    teamBudgets: [],
    batchWindow: SEALED_WINDOW,
    timezone: "UTC",
    isPlayoffPhase: false,
    rosterCap: 15,
    isParticipant: true,
    playoffForfeitDeadlineIso: null,
    nowIso: NOW.toISOString(),
    ...over,
  };
}

describe("WaiversClient claim row — the pending claim's add target shows the actionable cutoff", () => {
  it("add kicks off before the batch → the claim row reads 'voids at kickoff'", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <WaiversClient
        view={sealedView({
          claims: [claim("b1", player("early", { kickoffAt: KO_BEFORE_BATCH }))],
        })}
      />,
    );
    expect(screen.getByText(/voids at kickoff/)).toBeTruthy();
  });

  it("add kicks off after the batch → the claim row reads 'to batch'", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <WaiversClient
        view={sealedView({
          claims: [claim("b1", player("late", { kickoffAt: KO_AFTER_BATCH }))],
        })}
      />,
    );
    expect(screen.getByText(/to batch/)).toBeTruthy();
  });
});
