// @vitest-environment jsdom
/**
 * T15-2 — the shared sheet-behavior kit in isolation: the STACKED-sheet lock count (the FA card
 * opened over the bid composer must not unlock the body when the top sheet closes), Escape
 * calling the LATEST onClose (not the one captured at open), and no re-lock churn across parent
 * re-renders. Surface-level wiring is proven per-sheet (moreSheetChrome.dom.test.tsx mounts the
 * real MoreSheet); this file pins the kit's own invariants.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useSheetChrome } from "./useSheetChrome";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function Sheet({ onClose, label }: { onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useSheetChrome(true, onClose, ref);
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">inside-{label}</button>
    </div>
  );
}

describe("useSheetChrome — stacked-sheet body lock (F-P2-I6)", () => {
  it("keeps the body locked until the LAST open sheet unmounts", () => {
    const a = render(<Sheet onClose={() => {}} label="a" />);
    expect(document.body.style.overflow).toBe("hidden");
    const b = render(<Sheet onClose={() => {}} label="b" />);
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount(); // top sheet closes — the base sheet is still open
    expect(document.body.style.overflow).toBe("hidden");
    a.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("useSheetChrome — Escape uses the latest close handler", () => {
  it("calls the handler from the CURRENT render, not the open-time capture", () => {
    const calls: string[] = [];
    function Host() {
      const [gen, setGen] = useState("first");
      return (
        <>
          <button type="button" onClick={() => setGen("second")}>
            regen
          </button>
          <Sheet onClose={() => calls.push(gen)} label="s" />
        </>
      );
    }
    const { getByText } = render(<Host />);
    fireEvent.click(getByText("regen"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls).toEqual(["second"]);
  });

  it("does not re-lock or steal focus on parent re-renders (single open-cycle effect)", () => {
    const onClose = vi.fn();
    function Host() {
      const [, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN((n) => n + 1)}>
            rerender
          </button>
          <Sheet onClose={onClose} label="s" />
        </>
      );
    }
    const { getByText } = render(<Host />);
    // focus went into the sheet on mount…
    expect((document.activeElement?.textContent ?? "").startsWith("inside-")).toBe(true);
    getByText("rerender").focus();
    fireEvent.click(getByText("rerender"));
    // …but a parent re-render must NOT re-run the effect and yank focus back
    expect(document.activeElement?.textContent).toBe("rerender");
    expect(document.body.style.overflow).toBe("hidden");
  });
});
