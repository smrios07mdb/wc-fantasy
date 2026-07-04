/**
 * Per-request nav-phase read for the App Shell (T15-CUT) — React `cache()`-memoized so the 12 shell
 * mount sites cost ONE query per request, with zero per-caller threading. READ-ONLY and minimal
 * (status + period id/kind/label — the same shape the dashboard's phase read uses).
 *
 * Failure posture: the shell is chrome — if the read fails for any reason the nav degrades to the
 * group-phase labels instead of 500ing every authenticated screen.
 */
import { cache } from "react";
import { prisma } from "@app/db";
import { deriveNavPhaseState, type NavPhaseState } from "./navPhase";

export const loadNavPhase = cache(async (): Promise<NavPhaseState> => {
  try {
    const rows = await prisma.fifaMatch.findMany({
      select: { status: true, period: { select: { id: true, kind: true, label: true } } },
    });
    return deriveNavPhaseState(
      rows.map((m) => ({
        status: m.status,
        periodId: m.period?.id ?? null,
        periodKind: m.period?.kind ?? null,
        periodLabel: m.period?.label ?? null,
      })),
    );
  } catch {
    return { phase: "group", knockoutLive: false };
  }
});
