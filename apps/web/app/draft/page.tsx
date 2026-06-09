/**
 * The draft-room screen — AUTHENTICATED (ARCHITECTURE.md §6). It gates on the session→manager resolve
 * (the Prompt-07 primitive): no session → /sign-in; not-allowlisted / no linked manager → /auth/denied;
 * otherwise it loads the authoritative snapshot for the session manager and hands it to the client shell,
 * which subscribes to Realtime and renders the server-synced countdown + board + pick action.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadDraftRoom } from "./loadDraftRoom";
import { DraftRoomClient } from "./DraftRoomClient";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const state = await loadDraftRoom(outcome.manager.id);
  if (!state) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <h2 className="t-h2">No draft yet</h2>
          <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
            The commissioner hasn&rsquo;t created the draft for this league yet. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  return <DraftRoomClient initialState={state} />;
}
