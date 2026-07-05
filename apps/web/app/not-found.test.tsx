// @vitest-environment jsdom
/**
 * Root `not-found.tsx` (F-P1-ERR1, T15-5) — proves the branded 404 renders REAL content instead of
 * Next's bare default, and that it offers a way back without reconstructing AppShell.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotFound from "./not-found";

afterEach(cleanup);

describe("root not-found.tsx", () => {
  it("renders branded 404 copy (not Next's default page)", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("offers a link back to the dashboard", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link.getAttribute("href")).toBe("/");
  });
});
