/**
 * The single-match Game Detail screen (T5/T6) — AUTHENTICATED. It gates on the same session→manager
 * resolve as the other shell screens (Prompt 07): no session → /sign-in; not-allowlisted / no linked
 * manager → /auth/denied. The whole snapshot is assembled server-side (`loadGameDetail`, Prisma owner /
 * RLS-bypassing — NO engine re-run, NO Realtime) and handed to the client shell, which renders the box
 * score and opens the shared `<PlayerScoreSheet>` modal on a row tap. It is a LEAGUE-SCOPED read (any
 * league member can view any match), so there is no own-manager target and no 403-not-your-manager.
 *
 * An unknown matchId → notFound() (a real 404), not a redirect.
 */
import { notFound, redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { loadGameDetail } from "./loadGameDetail";
import { GameDetailClient } from "./GameDetailClient";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ matchId: string }> }) {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const { matchId } = await params;
  const view = await loadGameDetail(outcome.manager.id, matchId);
  if (!view) notFound();

  return <GameDetailClient view={view} />;
}
