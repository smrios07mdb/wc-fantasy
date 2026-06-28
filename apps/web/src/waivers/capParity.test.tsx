// @vitest-environment jsdom
/**
 * Cap-parity unit tests for the two acquisition surfaces (the 2026-06-28 R32 incident). Both the
 * instant-$0 {@link FreeAgentPanel} and the sealed {@link BidComposer} must key their squad-FULL /
 * drop-required / add-enable gate on the THREADED phase roster cap (`rosterCap`, 15 group / 9 playoff —
 * `rosterCapForPlayoffPhase`), NOT a hardcoded `SQUAD_SIZE = 15`. The bug: a 9-man playoff squad read
 * `9 >= 15 = false`, so the FA panel hid the drop selector and posted `dropId: null` → the engine's
 * `drop-required` 409. The mirror over-constraint in the composer: it ALWAYS required a drop, so a
 * below-cap playoff squad was forced into an unnecessary 1-for-1. These MOUNT each component directly
 * and assert the gate flips with the cap. The pure engine (`checkDropAndRoster`) is unchanged — these
 * only prove the UI now reads the same cap the engine enforces.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { FreeAgentPanel } from "./FreeAgentPanel";
import { BidComposer } from "./BidComposer";
import type { WvPlayer } from "./types";

afterEach(cleanup);

function player(id: string, over: Partial<WvPlayer> = {}): WvPlayer {
  return {
    id,
    name: over.name ?? id,
    shortName: over.shortName ?? id,
    position: over.position ?? "MID",
    nation: over.nation ?? "Spain",
    teamName: over.teamName ?? "Spain",
    kickoffAt: over.kickoffAt ?? "2099-01-01T00:00:00.000Z", // far-future ⇒ acquirable/droppable
    seasonPoints: over.seasonPoints ?? 10,
    ...over,
  };
}

/** An n-man squad whose LAST man is the named drop target "DropMe". */
function roster(n: number): WvPlayer[] {
  const out: WvPlayer[] = [];
  for (let i = 0; i < n - 1; i++) {
    out.push(player(`r${i}`, { shortName: `Roster ${i}`, position: "MID" }));
  }
  out.push(player("dropme", { shortName: "DropMe", position: "FWD" }));
  return out;
}

const FREE_AGENT = player("freeman", { shortName: "FreeMan", position: "FWD" });
const NOW = new Date("2026-06-28T12:00:00.000Z");

const faPanel = () => within(screen.getByRole("region", { name: /free agents/i }));

function renderFa(rosterCap: number, squadSize: number, onGrant = vi.fn()) {
  render(
    <FreeAgentPanel
      enabled
      rosterCap={rosterCap}
      freeAgents={[FREE_AGENT]}
      claims={[]}
      roster={roster(squadSize)}
      lockedPlayerIds={[]}
      now={NOW}
      submitting={false}
      errorMessage={null}
      onGrant={onGrant}
      onOpen={vi.fn()}
    />,
  );
  return onGrant;
}

function renderComposer(rosterCap: number, squadSize: number, onSubmit = vi.fn()) {
  render(
    <BidComposer
      editClaim={null}
      rosterCap={rosterCap}
      now={NOW}
      freeAgents={[FREE_AGENT]}
      claims={[]}
      roster={roster(squadSize)}
      lockedPlayerIds={[]}
      faabBudget={100}
      submitting={false}
      errorMessage={null}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      onOpen={vi.fn()}
    />,
  );
  return onSubmit;
}

describe("FreeAgentPanel — squad-full gate keyed on the threaded rosterCap", () => {
  it("playoff cap 9, 9-man squad (AT CAP): drop selector renders + a drop is REQUIRED", () => {
    const onGrant = renderFa(9, 9);
    fireEvent.click(faPanel().getByRole("button", { name: /FreeMan/ }));
    // the drop selector is present (the regression: hardcoded 15 hid it at 9-man)
    expect(faPanel().getByRole("button", { name: /DropMe/ })).toBeTruthy();
    const add = faPanel().getByRole("button", { name: /^Add free agent$/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true); // no drop chosen yet ⇒ blocked
    fireEvent.click(faPanel().getByRole("button", { name: /DropMe/ }));
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onGrant).toHaveBeenCalledWith({ addId: "freeman", dropId: "dropme" });
  });

  it("playoff cap 9, 8-man squad (BELOW CAP): no drop selector + Add enables with just a selection", () => {
    const onGrant = renderFa(9, 8);
    fireEvent.click(faPanel().getByRole("button", { name: /FreeMan/ }));
    expect(faPanel().queryByRole("button", { name: /DropMe/ })).toBeNull();
    const add = faPanel().getByRole("button", { name: /^Add free agent$/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(onGrant).toHaveBeenCalledWith({ addId: "freeman", dropId: null });
  });

  it("group cap 15, 15-man squad (AT CAP): drop selector renders + a drop is REQUIRED (unchanged)", () => {
    const onGrant = renderFa(15, 15);
    fireEvent.click(faPanel().getByRole("button", { name: /FreeMan/ }));
    expect(faPanel().getByRole("button", { name: /DropMe/ })).toBeTruthy();
    const add = faPanel().getByRole("button", { name: /^Add free agent$/i }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(faPanel().getByRole("button", { name: /DropMe/ }));
    fireEvent.click(add);
    expect(onGrant).toHaveBeenCalledWith({ addId: "freeman", dropId: "dropme" });
  });
});

const dialog = () => within(screen.getByRole("dialog", { name: /waiver claim/i }));

describe("BidComposer — drop-required gate keyed on the threaded rosterCap (parity)", () => {
  it("playoff cap 9, 9-man squad (AT CAP): drop selector renders + a drop is REQUIRED", () => {
    const onSubmit = renderComposer(9, 9);
    fireEvent.click(dialog().getByRole("button", { name: /FreeMan/ }));
    expect(dialog().getByRole("button", { name: /DropMe/ })).toBeTruthy();
    const submit = dialog().getByRole("button", { name: /Queue sealed bid/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // no drop chosen ⇒ blocked
    fireEvent.click(dialog().getByRole("button", { name: /DropMe/ }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ addId: "freeman", dropId: "dropme", amount: 1 });
  });

  it("playoff cap 9, 8-man squad (BELOW CAP): no drop selector + submit enables without a drop", () => {
    const onSubmit = renderComposer(9, 8);
    fireEvent.click(dialog().getByRole("button", { name: /FreeMan/ }));
    expect(dialog().queryByRole("button", { name: /DropMe/ })).toBeNull();
    const submit = dialog().getByRole("button", { name: /Queue sealed bid/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ addId: "freeman", dropId: null, amount: 1 });
  });

  it("group cap 15, 15-man squad (AT CAP): a drop is REQUIRED (unchanged group behaviour)", () => {
    const onSubmit = renderComposer(15, 15);
    fireEvent.click(dialog().getByRole("button", { name: /FreeMan/ }));
    const submit = dialog().getByRole("button", { name: /Queue sealed bid/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(dialog().getByRole("button", { name: /DropMe/ }));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ addId: "freeman", dropId: "dropme", amount: 1 });
  });
});
