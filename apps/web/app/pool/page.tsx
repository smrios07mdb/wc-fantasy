/**
 * The /pool pick'em screen — AUTHENTICATED (ARCHITECTURE.md §6). It gates on the same session→manager
 * resolve as the other shell screens (Prompt 07): no session → /sign-in; not-allowlisted / no linked
 * manager → /auth/denied. The whole snapshot is assembled server-side (`loadPool`, Prisma owner /
 * RLS-bypassing) and handed to the client shell, which round-trips every pick through the gated
 * `POST /api/pool/pick` and refetches via `router.refresh()` (form-driven CRUD — NO Realtime, NO polling;
 * the Realtime subscription is Prompt 43). The pool is a SELF-scoped surface (the viewer's own picks),
 * so there is no 403-not-your-manager here — the per-pick write gate lives in the route.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadPool } from "@/src/pool/loadPool";
import { PoolClient } from "@/src/pool/PoolClient";

export const dynamic = "force-dynamic";

export default async function PoolPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadPool(outcome.manager.id);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">The pool isn’t open yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            Per-match picks open once the league is set up and the tournament schedule is loaded.
          </p>
        </div>
      </div>
    );
  }

  return <PoolClient view={view} />;
}
