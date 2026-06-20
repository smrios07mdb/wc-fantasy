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
import { seedManagerSelection } from "@/src/vsfield/seedSelection";
import { loadVsField } from "./loadVsField";
import { VsFieldClient } from "./VsFieldClient";

export const dynamic = "force-dynamic";

export default async function VsFieldPage({
  searchParams,
}: {
  // Next 15: `searchParams` is a Promise. We read only `?manager=<id>` — the dashboard standings-row
  // deep-link (T3) — and validate it against the loaded field before handing the client an H2H seed.
  searchParams: Promise<{ manager?: string | string[] }>;
}) {
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

  // Validate the deep-link against the loaded field; an unknown/malformed id resolves to null so the
  // client keeps its existing default selection (never a non-existent manager → empty H2H).
  const { manager } = await searchParams;
  const initialSelection = seedManagerSelection(manager, view.field);

  return <VsFieldClient initialView={view} initialSelection={initialSelection} />;
}
