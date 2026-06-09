/**
 * The FAAB waivers screen — AUTHENTICATED (ARCHITECTURE.md §6). It gates on the session→manager resolve
 * (the Prompt-07 primitive): no session → /sign-in; not-allowlisted / no linked manager → /auth/denied.
 * The mutable surface is SELF-scoped (the viewer's own budget + pending claims), so there is no
 * 403-not-your-manager here — the per-claim write gate lives in `/api/faab/bid`. The whole snapshot is
 * assembled server-side (`loadWaivers`, Prisma owner / RLS-bypassing) and handed to the client shell,
 * which round-trips every place/edit/cancel through the gated `/api/faab/bid` and refetches via
 * `router.refresh()` (form-driven CRUD — no Realtime, no polling).
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadWaivers } from "./loadWaivers";
import { WaiversClient } from "@/src/waivers/WaiversClient";

export const dynamic = "force-dynamic";

export default async function WaiversPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadWaivers(outcome.manager.id);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">Waivers aren’t open yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            Blind FAAB bids open once the league is set up and your squad is drafted.
          </p>
        </div>
      </div>
    );
  }

  return <WaiversClient view={view} />;
}
