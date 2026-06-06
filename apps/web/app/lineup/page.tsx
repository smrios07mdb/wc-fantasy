/**
 * The set-lineup screen — AUTHENTICATED (ARCHITECTURE.md §6). It gates on the session→manager resolve
 * (the Prompt-07 primitive): no session → /sign-in; not-allowlisted / no linked manager → /auth/denied;
 * otherwise it loads the authoritative squad + editable windows for the session manager and hands them to
 * the client shell, which renders the formation/bench and posts edits to the gated `POST /api/lineup`.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadLineup } from "./loadLineup";
import { SetLineupClient } from "./SetLineupClient";

export const dynamic = "force-dynamic";

export default async function LineupPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const state = await loadLineup(outcome.manager.id);
  if (!state || state.squad.length === 0 || state.periods.length === 0) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">No lineup to set yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            {state && state.squad.length === 0
              ? "You don’t have a squad yet — your lineup opens once the draft fills your roster."
              : "There’s no open or upcoming match window to set a lineup for right now. Check back soon."}
          </p>
        </div>
      </div>
    );
  }

  return <SetLineupClient initialState={state} />;
}
