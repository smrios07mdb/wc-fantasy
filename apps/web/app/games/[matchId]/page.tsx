/**
 * The single-match Game Detail screen (T5/T6) — AUTHENTICATED. It gates on the same session→manager
 * resolve as the other shell screens (Prompt 07): no session → /sign-in; not-allowlisted / no linked
 * manager → /auth/denied. The whole snapshot is assembled server-side (`loadGameDetail`, Prisma owner /
 * RLS-bypassing — NO engine re-run, NO Realtime) and handed to the client shell, which renders the box
 * score and opens the shared `<PlayerScoreSheet>` modal on a row tap. It is a LEAGUE-SCOPED read (any
 * league member can view any match), so there is no own-manager target and no 403-not-your-manager.
 *
 * An unknown matchId → notFound() (a real 404), not a redirect.
 *
 * F-P3-A4 (T15-CUT rider): the App Shell mounts HERE (not the layout — layouts can't read
 * searchParams) so the active tab derives from the validated `?from=` the referring surface appends
 * (dashboard → home, The Cut → vsfield); anything absent/unknown falls back to "pool", the dedicated
 * per-match surface — the old hardcode, now only the default.
 */
import { notFound, redirect } from "next/navigation";
import { getSessionManager, getViewerIsCommissioner } from "@/lib/auth/manager";
import { AppShell } from "../../shell/AppShell";
import type { NavId } from "@/src/shell/crossNav";
import { loadGameDetail } from "./loadGameDetail";
import { GameDetailClient } from "./GameDetailClient";

export const dynamic = "force-dynamic";

/** The surfaces that link into a match page — the only accepted `?from=` values. */
const GAME_FROM_TABS = new Set<NavId>(["home", "pool", "vsfield"]);

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  const { matchId } = await params;
  const view = await loadGameDetail(outcome.manager.id, matchId);
  if (!view) notFound();

  const { from } = await searchParams;
  const fromRaw = Array.isArray(from) ? from[0] : from;
  const active: NavId = GAME_FROM_TABS.has(fromRaw as NavId) ? (fromRaw as NavId) : "pool";
  const isCommissioner = await getViewerIsCommissioner();

  return (
    <AppShell active={active} isCommissioner={isCommissioner}>
      <GameDetailClient view={view} />
    </AppShell>
  );
}
