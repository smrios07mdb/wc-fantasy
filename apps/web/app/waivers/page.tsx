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

export default async function WaiversPage({
  searchParams,
}: {
  // PLAYERS-1: the /players browser hands off a free-agent bid via `?bid=<playerId>`. Read it here
  // (this page is already force-dynamic) and thread it to the client, which preselects it iff the
  // window is open AND the player is still claimable. A bare, single string is all we accept.
  searchParams: Promise<{ bid?: string | string[] }>;
}) {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const { bid } = await searchParams;
  const deepLinkBidPlayerId = typeof bid === "string" ? bid : null;

  const view = await loadWaivers(outcome.manager.id);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">Waivers aren’t open yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            Blind FAAB bids open once the league is set up and your squad is drafted.
          </p>
        </div>
      </div>
    );
  }

  return <WaiversClient view={view} deepLinkBidPlayerId={deepLinkBidPlayerId} />;
}
