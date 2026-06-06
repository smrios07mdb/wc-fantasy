/**
 * The live "vs the field" screen — AUTHENTICATED (ARCHITECTURE.md §5/§6). It gates on the session→manager
 * resolve (the Prompt-07 primitive): no session → /sign-in; not-allowlisted / no linked manager →
 * /auth/denied. It is a LEAGUE-SCOPED read (the whole field), so there is no own-manager target and no
 * 403-not-your-manager. The whole-league snapshot is computed server-side (`loadVsField` → `buildVsField`,
 * Prisma owner / RLS-bypassing) and handed to the client shell, which live-updates via the JWT-authed
 * Realtime subscription (+ polling fallback) and refetches `GET /api/vsfield` on a change-nudge.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadVsField } from "./loadVsField";
import { VsFieldClient } from "./VsFieldClient";

export const dynamic = "force-dynamic";

export default async function VsFieldPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadVsField(outcome.manager.id);
  if (!view) {
    return (
      <div className="vf-app">
        <div className="vf-empty">
          <div className="card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
            <h2 className="t-h2">The field isn’t ready yet</h2>
            <p className="text-secondary t-sm" style={{ marginBottom: 0 }}>
              Standings and live scores appear once the league is set up and the first matchday
              opens.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <VsFieldClient initialView={view} />;
}
