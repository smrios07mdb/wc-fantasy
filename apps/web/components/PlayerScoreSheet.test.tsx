// @vitest-environment jsdom
/**
 * Proof of the info-only contract the Vs-the-Field reuse depends on: the shared <PlayerScoreSheet>
 * renders the "Bench & forfeit" section IF AND ONLY IF `forfeitProps` is passed. Vs-the-Field passes
 * none (own players included), so the modal is purely informational there; Set Lineup passes them for
 * a played starter. `fetch` is stubbed to stay pending — the forfeit affordance is independent of the
 * box-score fetch, so we can assert it without a server.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PlayerScoreSheet } from "./PlayerScoreSheet";

beforeEach(() => {
  // Never resolves → modal sits in its loading state; forfeit section renders independently of this.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlayerScoreSheet — forfeit section is opt-in", () => {
  it("renders NO forfeit section when forfeitProps is omitted (the vsfield / info-only posture)", () => {
    render(<PlayerScoreSheet periodId="p1" playerId="x" onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /bench & forfeit/i })).toBeNull();
    expect(screen.queryByText(/forfeits/i)).toBeNull();
  });

  it("renders the forfeit section when forfeitProps IS passed (the set-lineup posture)", () => {
    const onForfeit = vi.fn();
    render(
      <PlayerScoreSheet
        periodId="p1"
        playerId="x"
        onClose={() => {}}
        forfeitProps={{ playerName: "Rashford", pointsAtStake: 6, onForfeit }}
      />,
    );
    expect(screen.getByRole("button", { name: /bench & forfeit/i })).toBeTruthy();
  });
});

// ─── Prompt 54: the Points | Stats tab strip ──────────────────────────────────

const BOX = {
  header: {
    displayName: "Player One",
    shortName: "P. One",
    position: "FWD",
    nation: "Brazil",
    fixture: null,
    periodTotal: 14,
  },
  state: "played",
  sections: [],
  trackedStats: [],
  season: null,
};

const STATS = {
  totals: { matches: 1, goals: 1, assists: 0, points: 8 },
  tiles: [
    { key: "matches", label: "Matches", value: 1 },
    { key: "goals", label: "Goals", value: 1 },
    { key: "assists", label: "Assists", value: 0 },
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
      lines: [
        { key: "goals", label: "G", value: 1 },
        { key: "assists", label: "A", value: null }, // null → "—"
        { key: "shots", label: "SH", value: 3 },
        { key: "dribbles", label: "DRB", value: 0 }, // genuine 0 → omitted
      ],
    },
  ],
};

/** Routes fetch by URL: box (player-box) vs stats (player-tournament-stats). */
function routedFetch(opts: { box?: unknown; boxPending?: boolean; statsReject?: boolean }) {
  return vi.fn((url: string) => {
    if (url.includes("player-tournament-stats")) {
      return opts.statsReject
        ? Promise.resolve({ ok: false })
        : Promise.resolve({ ok: true, json: () => Promise.resolve(STATS) });
    }
    if (opts.boxPending) return new Promise(() => {});
    return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.box ?? BOX) });
  });
}

describe("PlayerScoreSheet — Points | Stats tab strip", () => {
  it("renders the .pc-seg strip and defaults to the Points tab", async () => {
    vi.stubGlobal("fetch", routedFetch({}));
    render(<PlayerScoreSheet periodId="p1" playerId="x" onClose={() => {}} />);

    expect(screen.getByRole("tab", { name: "Points" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Stats" })).toBeTruthy();

    // Points is the default tab: its breakdown shows; the Stats-only loghead does not.
    expect(await screen.findByText("P. One")).toBeTruthy();
    expect(screen.queryByText(/completed matches/i)).toBeNull();
  });

  it("switching to Stats renders the position tiles + the completed-match log", async () => {
    // Box pending so we know the visible content is the Stats tab, not Points.
    vi.stubGlobal("fetch", routedFetch({ boxPending: true }));
    const { container } = render(
      <PlayerScoreSheet periodId="p1" playerId="x" onClose={() => {}} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Stats" }));

    expect(await screen.findByText("Mexico")).toBeTruthy(); // game-log opponent (the other team)
    expect(screen.getByText("MD1")).toBeTruthy();
    expect(screen.getByText("2–0")).toBeTruthy(); // scoreline oriented to the player's team
    // Tile labels render (position-aware FWD set includes Shots).
    expect(screen.getByText("Shots")).toBeTruthy();

    // Per-match statline: a null cell (assists) is SHOWN (its label "A" survives), while a genuine
    // 0 (dribbles "DRB") is omitted — so unknown data is never displayed as a misleading zero.
    const statline = container.querySelector(".pc-statline");
    expect(statline?.textContent).toContain("A"); // null assist chip rendered
    expect(statline?.textContent).not.toContain("DRB"); // 0 dribbles omitted
  });

  it("a Stats fetch failure degrades quietly and leaves the Points tab functional", async () => {
    vi.stubGlobal("fetch", routedFetch({ statsReject: true }));
    render(<PlayerScoreSheet periodId="p1" playerId="x" onClose={() => {}} />);

    // Points works on open.
    expect(await screen.findByText("P. One")).toBeTruthy();

    // Stats tab shows the quiet error, not a crash.
    fireEvent.click(screen.getByRole("tab", { name: "Stats" }));
    expect(await screen.findByText(/couldn’t load stats|couldn't load stats/i)).toBeTruthy();

    // Switching back to Points still shows the breakdown.
    fireEvent.click(screen.getByRole("tab", { name: "Points" }));
    expect(screen.getByText("P. One")).toBeTruthy();
  });
});
