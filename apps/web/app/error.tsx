"use client";

/**
 * Root `error.tsx` (F-P1-ERR2, T15-5). Catches an uncaught exception thrown while rendering/streaming
 * any route that doesn't have a more specific `error.tsx` of its own (Next bubbles to the nearest
 * boundary). Without this file, an unhandled server exception mid-matchday renders Next's bare,
 * themeless default error page — see the audit finding.
 *
 * This is NOT `global-error.tsx`: it renders INSIDE the root layout (ds.css + fonts still apply), so it
 * can reuse `BoundaryScreen` freely. `global-error.tsx` is the separate, self-contained fallback for
 * when the root layout itself throws.
 *
 * Per the Next error-boundary contract this must be a Client Component and receives `reset()` to retry
 * rendering the segment without a full reload.
 */
import { useEffect } from "react";
import { BoundaryScreen } from "./_boundaries/BoundaryScreen";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The only signal we have client-side; no telemetry wired yet.
    console.error(error);
  }, [error]);

  return (
    <BoundaryScreen
      eyebrow="Error"
      title="Something went wrong"
      message="An unexpected error occurred. You can try again, or head back to the dashboard."
      action={
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
      }
    />
  );
}
