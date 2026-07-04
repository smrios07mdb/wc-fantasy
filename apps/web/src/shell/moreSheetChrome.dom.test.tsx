// @vitest-environment jsdom
/**
 * T15-2 (F-P2-A4 + F-P3-A1) — MoreSheet as a TRUE modal, proven by mounting the real client
 * island: grabber + title + explicit ✕, aria-modal, Escape dismissal, focus containment, and the
 * shared body-scroll lock (F-P2-I6) locking on open / releasing on close. Complements the
 * Playwright harness (verify-shell-stacking.mjs), which proves paint order and tap geometry in a
 * real browser — jsdom here proves the wiring.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MoreSheet } from "@/app/shell/MoreSheet";
import { MORE_SHEET_ITEMS } from "@/src/shell/crossNav";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function openSheet() {
  const utils = render(
    <MoreSheet
      active={null}
      moreHasActive={false}
      signedInAs="test@example.com"
      isCommissioner={false}
      moreItems={MORE_SHEET_ITEMS}
    />,
  );
  const moreBtn = screen.getByRole("button", { name: /more navigation options/i });
  // jsdom's click doesn't focus the target the way a real pointer press does — focus explicitly
  // so the hook's opener-restore path has a real opener to return to.
  moreBtn.focus();
  fireEvent.click(moreBtn);
  return utils;
}

describe("MoreSheet — sheet chrome (F-P2-A4)", () => {
  it("renders grabber, title head, and an explicit ✕ close that closes the sheet", () => {
    const { container } = openSheet();
    expect(container.querySelector(".sh-sheet-grab")).not.toBeNull();
    expect(container.querySelector(".sh-sheet-head .sh-sheet-title")?.textContent).toBe("More");
    const x = screen.getByRole("button", { name: /close menu/i });
    fireEvent.click(x);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a true modal: role=dialog + aria-modal", () => {
    openSheet();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});

describe("MoreSheet — modal behavior via useSheetChrome (F-P3-A1 + F-P2-I6)", () => {
  it("locks body scroll while open and releases it on close", () => {
    openSheet();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape closes the sheet and restores focus to the More button", () => {
    openSheet();
    expect(screen.getByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("More navigation options");
  });

  it("moves focus into the sheet on open and wraps Tab at the edges (focus trap)", () => {
    openSheet();
    const dialog = screen.getByRole("dialog");
    // focus entered the sheet (first focusable = the ✕)
    expect(dialog.contains(document.activeElement)).toBe(true);
    const focusables = dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    const last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // wrapped from the last control back to the first
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("selecting a More item closes the sheet (navigation close path)", () => {
    openSheet();
    const first = MORE_SHEET_ITEMS[0]!;
    fireEvent.click(screen.getByRole("link", { name: first.label }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
