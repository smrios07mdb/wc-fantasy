// @vitest-environment jsdom
/**
 * END-TO-END proof of the /players browser (PLAYERS-1) — mounts the real {@link PlayersClient} in
 * jsdom and drives it through RTL (the "a source smoke doesn't prove a user path" lesson):
 *   • rows render sorted by season points desc (nulls last);
 *   • a row tap opens the SHARED view-only card (Points + Stats), read-only (no star control);
 *   • the bid trailer appears ONLY for a claimable FA in an open window, and links to /waivers?bid=;
 *   • the paged reveal (25) + "Load more"; the empty state names the active filters + clears them;
 *   • the availability filter (Mine) composes.
 *
 * `PlayersClient` uses no router; the card's eager stats fetch is stubbed (the Points tab needs none).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { PlayersClient } from "./PlayersClient";
import type { PlayersView, PlPlayer } from "./types";
import type { AcquisitionWindow } from "@app/faab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ME = "mgr-me";

function plPlayer(id: string, over: Partial<PlPlayer> = {}): PlPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "France",
    teamName: over.teamName ?? over.nation ?? "France",
    kickoffAt: over.kickoffAt ?? null,
    seasonPoints: over.seasonPoints ?? null,
    nationAlive: over.nationAlive ?? true,
    owner: over.owner ?? null,
  };
}

function view(players: PlPlayer[], over: Partial<PlayersView> = {}): PlayersView {
  return {
    viewerManagerId: ME,
    players,
    windowPhase: over.windowPhase ?? "free-agency",
    windowLabel: over.windowLabel ?? "R16",
    timezone: "UTC",
    nowIso: "2026-06-11T17:30:00.000Z",
    ...over,
  };
}

const rowButtons = () => screen.getAllByRole("button", { name: /player card/i });

describe("PlayersClient — list + sort", () => {
  it("renders rows sorted by season points desc, nulls last", () => {
    render(
      <PlayersClient
        view={view([
          plPlayer("low", { name: "Low", seasonPoints: 5 }),
          plPlayer("none", { name: "Nil", seasonPoints: null }),
          plPlayer("high", { name: "High", seasonPoints: 90 }),
        ])}
      />,
    );
    const names = rowButtons().map((b) => within(b).getByText(/High|Low|Nil/).textContent);
    expect(names).toEqual(["High", "Low", "Nil"]);
  });
});

describe("PlayersClient — row → shared view-only card", () => {
  it("a row tap opens the card (Points + Stats) with NO star control (read-only)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <PlayersClient
        view={view([plPlayer("mbappe", { name: "Kylian Mbappé", seasonPoints: 42 })])}
      />,
    );

    expect(screen.queryByRole("dialog", { name: /player card/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Kylian Mbappé’s player card/i }));

    const dialog = screen.getByRole("dialog", { name: /player card/i });
    expect(within(dialog).getByRole("tab", { name: "Stats" })).toBeTruthy();
    // Read-only: the watchlist star (present on /waivers) must NOT render here.
    expect(within(dialog).queryByRole("button", { name: /watchlist/i })).toBeNull();
  });
});

describe("PlayersClient — bid trailer (hand-off to /waivers)", () => {
  it("shows for a claimable FA in an open window and links to /waivers?bid=", () => {
    render(
      <PlayersClient
        view={view([plPlayer("fa1", { name: "Free Agent", owner: null, nationAlive: true })])}
      />,
    );
    const link = screen.getByRole("link", { name: /Place a bid on Free Agent/i });
    expect(link.getAttribute("href")).toBe("/waivers?bid=fa1");
  });

  it("hidden when the window is closed", () => {
    render(
      <PlayersClient
        view={view([plPlayer("fa1", { name: "Free Agent", owner: null })], {
          windowPhase: "locked" as AcquisitionWindow,
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: /place a bid/i })).toBeNull();
  });

  it("hidden for a rostered player and for an eliminated nation", () => {
    render(
      <PlayersClient
        view={view([
          plPlayer("owned", { name: "Owned", owner: { managerId: "rival", name: "Rival FC" } }),
          plPlayer("elim", { name: "Eliminated", owner: null, nationAlive: false }),
        ])}
      />,
    );
    expect(screen.queryByRole("link", { name: /place a bid/i })).toBeNull();
  });
});

describe("PlayersClient — paged reveal + empty state", () => {
  const pool = Array.from({ length: 30 }, (_, i) =>
    plPlayer(`p${String(i).padStart(2, "0")}`, {
      name: `P${String(i).padStart(2, "0")}`,
      seasonPoints: 100 - i,
    }),
  );

  it("reveals 25, then all 30 after Load more", () => {
    render(<PlayersClient view={view(pool)} />);
    expect(rowButtons()).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: /Load \d+ more/i }));
    expect(rowButtons()).toHaveLength(30);
  });

  it("the empty state names the active filters and Clear restores the list", () => {
    render(<PlayersClient view={view(pool)} />);
    fireEvent.change(screen.getByRole("searchbox", { name: /search players/i }), {
      target: { value: "zzznomatch" },
    });
    expect(screen.getByText(/no players match/i)).toBeTruthy();
    expect(screen.getByText(/zzznomatch/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
    expect(rowButtons()).toHaveLength(25);
  });
});

describe("PlayersClient — availability filter composes", () => {
  it("Mine narrows to the viewer's players", () => {
    render(
      <PlayersClient
        view={view([
          plPlayer("mine", {
            name: "Mine One",
            owner: { managerId: ME, name: "You" },
            seasonPoints: 10,
          }),
          plPlayer("free", { name: "Free One", owner: null, seasonPoints: 20 }),
        ])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Mine$/ }));
    const names = rowButtons().map((b) => within(b).getByText(/One/).textContent);
    expect(names).toEqual(["Mine One"]);
  });
});
