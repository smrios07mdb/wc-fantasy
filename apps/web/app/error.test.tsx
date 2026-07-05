// @vitest-environment jsdom
/**
 * Root `error.tsx` (F-P1-ERR2, T15-5) — proves the boundary renders branded content and surfaces the
 * Next `reset()` retry affordance per the error-boundary contract.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./error";

afterEach(cleanup);

describe("root error.tsx", () => {
  it("renders branded error copy", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
  });

  it("calls reset() when the retry button is pressed", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("also offers a link back to the dashboard", () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link.getAttribute("href")).toBe("/");
  });
});
