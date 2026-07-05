/**
 * BoundaryScreen — the shared centered-card frame for the app's dead-end screens: `not-found.tsx` and
 * `error.tsx` (F-P1-ERR1 / F-P1-ERR2, T15-5). These render OUTSIDE any `<AppShell>` (404s and thrown
 * errors can occur before/without the nav's auth data resolving), so per the finding's brief the fix is
 * a single branded card + a "back to Dashboard" affordance — not a reconstruction of AppShell's nav.
 *
 * Pure presentational, no "use client": safe for both the root not-found (server) and route error.tsx
 * (client) to import. Uses only existing ds.css vocabulary (`.card`, `.btn-primary`, `.t-label`, text
 * color utilities) — no new CSS file.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/Brand";

export function BoundaryScreen({
  eyebrow,
  title,
  message,
  action,
}: {
  eyebrow: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "var(--sp-8)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <BrandMark h={56} />
        </div>
        <p className="t-label" style={{ marginBottom: "var(--sp-2)" }}>
          {eyebrow}
        </p>
        <h1 className="t-h1" style={{ marginBottom: "var(--sp-2)" }}>
          {title}
        </h1>
        <p className="text-secondary" style={{ marginBottom: "var(--sp-6)" }}>
          {message}
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--sp-3)",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {action}
          <Link href="/" className="btn btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
