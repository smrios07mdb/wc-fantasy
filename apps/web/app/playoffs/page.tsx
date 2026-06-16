/**
 * The /playoffs guillotine theater — AUTHENTICATED (ARCHITECTURE.md §21). It gates on the same
 * session→manager resolve as the other shell screens (Prompt 07): no session → /sign-in; not-allowlisted /
 * no linked manager → /auth/denied. It is a LEAGUE-SCOPED read (a member sees the WHOLE guillotine field),
 * so there is no 403-not-your-manager — the session manager is resolved ONLY to populate `me`.
 *
 * The phase gate is DATA-EXISTENCE, not `league.status` (which is a worker concern, never read in the web):
 * `loadPlayoffs` returns null until the knockout ladder + the seeded field exist — i.e. until the
 * group→playoff transition has run (when `league.status` would be `playoff`/`complete`). On null we render
 * the pre-playoff state; otherwise the live client. Mirrors `loadVsField` / `loadPool`.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadPlayoffs } from "./loadPlayoffs";
import { PlayoffsClient } from "./PlayoffsClient";

export const dynamic = "force-dynamic";

export default async function PlayoffsPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadPlayoffs(outcome.manager.id);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">The guillotine hasn’t started yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            The knockout playoffs open at the group→playoff transition, once the field is seeded and
            the cut schedule is set. Until then, follow the race for a playoff spot in the
            standings.
          </p>
        </div>
      </div>
    );
  }

  return <PlayoffsClient initialView={view} />;
}
