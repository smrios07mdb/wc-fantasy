/**
 * The /players full-tournament browser — AUTHENTICATED, READ-ONLY (PLAYERS-1). It gates on the same
 * session→manager resolve as the other shell screens (Prompt 07): no session → /sign-in;
 * not-allowlisted / no linked manager → /auth/denied. The whole snapshot is assembled server-side
 * (`loadPlayers`, Prisma owner / RLS-bypassing — no engine run, no Realtime, no writes) and handed to
 * the client shell, which browses/filters and opens the shared view-only player card. There is NO
 * mutation surface here: acquisition is single-sourced on /waivers, reached via a `?bid=` hand-off.
 *
 * A league-scoped read (any member browses the full pool), no own-manager target ⇒ no
 * 403-not-your-manager gate (that lives in the write routes /players never calls).
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadPlayers } from "./loadPlayers";
import { PlayersClient } from "@/src/players/PlayersClient";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadPlayers(outcome.manager.id);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">Players aren’t available yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            The tournament player pool loads once the league is set up.
          </p>
        </div>
      </div>
    );
  }

  return <PlayersClient view={view} />;
}
