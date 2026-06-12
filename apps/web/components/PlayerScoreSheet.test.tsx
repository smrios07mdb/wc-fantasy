// @vitest-environment jsdom
/**
 * Proof of the info-only contract the Vs-the-Field reuse depends on: the shared <PlayerScoreSheet>
 * renders the "Bench & forfeit" section IF AND ONLY IF `forfeitProps` is passed. Vs-the-Field passes
 * none (own players included), so the modal is purely informational there; Set Lineup passes them for
 * a played starter. `fetch` is stubbed to stay pending — the forfeit affordance is independent of the
 * box-score fetch, so we can assert it without a server.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
