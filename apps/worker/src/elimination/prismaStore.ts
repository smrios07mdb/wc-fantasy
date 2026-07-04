/**
 * Prisma-backed {@link TeamEliminationStore} — the production adapter for the resident-tick team-elimination
 * derivation (feat/auto-team-elimination; DECISIONS.md "auto-derived team elimination"). It performs the
 * FREEZE-GATED read (completed knockout-round fixtures whose period is frozen) and the guarded, set-only,
 * GLOBAL write of `fifa_team.eliminated`. The DECISION (who lost) stays in the pure
 * {@link ./selectEliminatedTeams}.
 */
import type { PrismaClient } from "@app/db";
import type { KnockoutMatchResult } from "./selectEliminatedTeams";
import type { TeamEliminationStore } from "./store";

type Db = PrismaClient;

export function createPrismaTeamEliminationStore(prisma: Db): TeamEliminationStore {
  return {
    async loadFrozenCompletedKnockoutMatches(): Promise<KnockoutMatchResult[]> {
      // status='completed' AND joined period.kind='knockout_round' AND period.frozen_at IS NOT NULL. The
      // `period` relation is nullable, so `is: {...}` excludes rows with `period_id = NULL` — the period-less
      // 3rd-place match drops out naturally (no special-casing). GLOBAL: `fifa_match`/`fifa_team` are
      // league-agnostic reference data (one private league per tournament — ARCHITECTURE.md §4).
      return prisma.fifaMatch.findMany({
        where: {
          status: "completed",
          period: { is: { kind: "knockout_round", frozenAt: { not: null } } },
        },
        select: {
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          homeScoreEt: true,
          awayScoreEt: true,
          homeScorePens: true,
          awayScorePens: true,
        },
      });
    },

    async flagEliminated(teamIds: string[]): Promise<string[]> {
      if (teamIds.length === 0) return [];

      // Read the not-yet-flagged subset FIRST so the returned list — and thus the tick's
      // `team.elimination.flagged` log — is EXACTLY the newly eliminated teams (a guarded `updateMany` only
      // yields a count). No transaction: the single worker is the only tick writer, elimination is monotonic
      // (false → true, never reverse), and the write below is itself `eliminated = false`-guarded — so a
      // concurrent commissioner flip can at worst make the log over-report by one, never corrupt the DB.
      const toFlip = await prisma.fifaTeam.findMany({
        where: { id: { in: teamIds }, eliminated: false },
        select: { id: true },
      });
      if (toFlip.length === 0) return []; // steady state: every loser already flagged — no write

      const ids = toFlip.map((t) => t.id);
      await prisma.fifaTeam.updateMany({
        // Guarded + set-only + GLOBAL (no league scope): UPDATE fifa_team SET eliminated = true
        // WHERE id IN (ids) AND eliminated = false. NEVER sets false — a post-freeze "un-loss" stays a
        // commissioner action (`commish:roster --allow-eliminated` / manual SQL), never an auto-revive.
        where: { id: { in: ids }, eliminated: false },
        data: { eliminated: true },
      });
      return ids.sort();
    },
  };
}
