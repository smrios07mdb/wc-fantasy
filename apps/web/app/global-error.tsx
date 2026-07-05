"use client";

/**
 * `global-error.tsx` (F-P1-ERR2, T15-5). Fires only when the ROOT LAYOUT itself throws — and when it
 * fires, Next renders it IN PLACE of `layout.tsx`, so none of `layout.tsx`'s imports execute: no
 * `ds.css` (no design tokens, no dark surface, no Schibsted/Hanken fonts), no Tailwind reset, no
 * `<AppShell>`. Without this file that failure mode is Next's bare "Application error" page — see the
 * audit finding.
 *
 * Per the Next contract this file must render its own `<html>`/`<body>` (it IS the document here) and
 * must be a Client Component. It is deliberately SELF-CONTAINED: every style below is an inline,
 * hardcoded value (no `var(--...)` — ds.css's custom properties don't exist in this tree), no imported
 * stylesheet, no `next/image` (which is its own async pipeline this screen shouldn't depend on), no
 * Google Fonts network fetch (`system-ui` only — a font fetch is one more thing that can fail on the
 * page whose whole job is to survive failure). The color values are copied from ds.css's dark tokens at
 * time of writing (`--surface-0`, `--surface-1`, `--hairline`, `--text-primary`, `--text-secondary`,
 * `--accent`) so it still looks like the app, just without any live dependency on the stylesheet.
 */
import { useEffect } from "react";

const COLORS = {
  surface0: "#0A0D12",
  surface1: "#11151C",
  hairline: "rgba(255,255,255,0.08)",
  textPrimary: "#F1F4F9",
  textSecondary: "#A6B0C0",
  accent: "#4D8DFF",
  textOnAccent: "#04101F",
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The only signal available in this fallback; no telemetry wired yet.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: COLORS.surface0,
          color: COLORS.textPrimary,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            padding: 32,
            textAlign: "center",
            background: COLORS.surface1,
            border: `1px solid ${COLORS.hairline}`,
            borderRadius: 12,
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: COLORS.textSecondary,
            }}
          >
            XI · Error
          </p>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>Something went wrong</h1>
          <p
            style={{
              margin: "0 0 24px",
              color: COLORS.textSecondary,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            The app hit an unexpected error and couldn&apos;t load. Try again — if it keeps
            happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: COLORS.accent,
              color: COLORS.textOnAccent,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
