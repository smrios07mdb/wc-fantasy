// @vitest-environment jsdom
/**
 * T15-3b — F-P3-H2 rendered-DOM pin. The source-regex sweep in verify-form-attrs.mjs proves
 * `maxLength={40}` exists in the JSX; this test proves it survives to the RENDERED DOM (the
 * gap class it closes: prop-spread order or a controlled-component wrapper silently dropping
 * the attribute between source and DOM). Also pins the length clamp behaviorally: jsdom
 * enforces maxlength on user input the way a real browser does via userEvent-style typing,
 * so we assert the attribute + the keyboard attrs on the real mounted element.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SettingsClient } from "./SettingsClient";

afterEach(cleanup);

describe("SettingsClient display-name input — rendered DOM attributes (F-P3-H2)", () => {
  it("carries maxlength=40 in the rendered DOM, not just the JSX", () => {
    render(<SettingsClient currentName="Sergio" />);
    const input = screen.getByLabelText<HTMLInputElement>("Display name");
    expect(input.getAttribute("maxlength")).toBe("40");
    expect(input.maxLength).toBe(40);
  });

  it("carries the T15-3 keyboard attributes in the rendered DOM", () => {
    render(<SettingsClient currentName="Sergio" />);
    const input = screen.getByLabelText<HTMLInputElement>("Display name");
    expect(input.getAttribute("autocapitalize")).toBe("words");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("enterkeyhint")).toBe("done");
    expect(input.getAttribute("autocomplete")).toBe("off");
  });
});
