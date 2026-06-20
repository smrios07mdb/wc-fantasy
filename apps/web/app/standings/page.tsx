/**
 * /standings — the dedicated all-play-all standings page, AUTHENTICATED (ARCHITECTURE §4 read surface).
 * It gates on the same session→manager resolve as the other shell screens (Prompt 07): no session →
 * /sign-in; not-allowlisted / no linked manager → /auth/denied. It is a LEAGUE-SCOPED read (a member
 * sees the WHOLE field), so there is no 403-not-your-manager — the session manager is resolved ONLY to
 * mark `meId`.
 *
 * `loadStandings` always returns a snapshot for a valid member (even an empty pre-season one), so unlike
 * the playoffs theater there is no pre-state branch; the client renders the empty state inline. The
 * route is `force-dynamic` (the auth gate reads the session cookie) and recomputes both tabs per request.
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadStandings } from "./loadStandings";
import { StandingsClient } from "./StandingsClient";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const view = await loadStandings(outcome.manager.id);
  if (!view) redirect("/auth/denied"); // manager row vanished mid-session — treat as no longer a member

  return <StandingsClient initial={view} />;
}
