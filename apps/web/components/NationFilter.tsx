"use client";
/**
 * `<NationFilter>` — the collapsible country filter, factored out of the draft pool (Prompt 31/35) so the
 * waivers free-agent pool reuses the SAME pattern instead of reinventing it: a "Nations ▾/▸" toggle that is
 * COLLAPSED by default, an active-nation chip + clear control shown in the header while collapsed, and a
 * flag-tagged chip grid when open. Flags render through the existing sole `<Flag>` surface + `toIso2`
 * resolver (Prompts 33/35/36 — emoji for ISO nations, hand-authored England/Scotland SVGs), so this never
 * re-derives flag logic.
 *
 * Pure presentation: the parent owns the selected `value` + the derived `nations` list and passes
 * `onChange`. `labelOf` maps a nation token to its display string (identity by default — the waivers pool
 * already carries country NAMES; a code-based pool can pass a code→name resolver). The `nf-*` classes are
 * defined by the consuming route's stylesheet (route-scoped CSS convention).
 */
import { useState } from "react";
import { Flag } from "../app/draft/Flag";
import { toIso2 } from "../src/draft/flag";

export interface NationFilterProps {
  /** The distinct nation tokens present in the pool (already sorted by the parent). */
  nations: readonly string[];
  /** The selected nation token, or "ALL" for no filter. */
  value: string | "ALL";
  onChange: (next: string | "ALL") => void;
  /** Map a nation token → its display label (identity by default). */
  labelOf?: (nation: string) => string;
}

export function NationFilter({ nations, value, onChange, labelOf }: NationFilterProps) {
  const [open, setOpen] = useState(false); // collapsed by default — mirrors the draft pool
  if (nations.length === 0) return null;
  const label = labelOf ?? ((n: string) => n);

  return (
    <div className="nf-filter">
      <div className="nf-header">
        <button type="button" className="nf-toggle" onClick={() => setOpen((o) => !o)}>
          Nations {open ? "▾" : "▸"}
        </button>
        {value !== "ALL" && !open && (
          <span className="chip is-active nf-active">
            <Flag code={toIso2(value)} label={label(value)} />
            {label(value)}
            <span
              className="nf-clear"
              role="button"
              aria-label="Clear nation filter"
              onClick={(e) => {
                e.stopPropagation();
                onChange("ALL");
              }}
            >
              ✕
            </span>
          </span>
        )}
      </div>
      {open && (
        <div className="nf-grid">
          <button
            type="button"
            className={"chip" + (value === "ALL" ? " is-active" : "")}
            onClick={() => onChange("ALL")}
          >
            All
          </button>
          {nations.map((n) => (
            <button
              key={n}
              type="button"
              className={"chip" + (value === n ? " is-active" : "")}
              onClick={() => onChange(n)}
            >
              <Flag code={toIso2(n)} label={label(n)} />
              {label(n)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
