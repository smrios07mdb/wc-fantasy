/**
 * Store edge for the playoff per-round cut application (`commish:advance`, {@link ./advance}). Defines the
 * {@link PlayoffAdvanceStore} port (here, with the adapter — so this deliverable stands alone), the
 * in-memory double the orchestrator tests run against, and the Prisma adapter that ASSEMBLES the round
 * inputs and APPLIES the resolved cut in ONE transaction. The pure orchestrator decides WHAT; this decides
 * nothing.
 *
 * READ assembly (`loadRoundContext`): the target knockout `period` (+ its `cut_count` / `frozen_at`), the
 * still-`alive` field with each manager's THIS-round `score_manager_period` points and their cumulative
 * tournament total (Σ `score_manager_period.points` over ALL league periods — computed on the fly, no
 * stored column), plus the two migration-free preconditions: `alreadyCut` (≥1 entry stamped
 * `eliminated_round == roundLabel`) and `uncutPriorRounds` (earlier knockout rounds not yet cut).
 *
 * WRITE (`applyRoundCut`): the FIRST statement is the conditional `alive → eliminated` claim (mirrors the
 * transition store's `updateMany WHERE status='group'` entry gate) — 0 rows means a prior run already cut
 * this round, so the whole transaction is a no-op. The lone survivor (final round) is then flipped to
 * `champion`. Server-side as the table owner — RLS does not bite. No roster / FAAB / scoring writes.
 */
import type { PrismaClient } from "@app/db";
import { loadCumulativeTournamentTotals } from "@app/recompute/prisma";
import { KNOCKOUT_ROUNDS, type KnockoutRound } from "@app/shared";

/** One alive manager's inputs for the round resolution. */
export interface AliveSurvivor {
  managerId: string;
  /** This round's `score_manager_period.points` (0 when no row — the manager scored nothing). */
  roundPoints: number;
  /** Σ `score_manager_period.points` over ALL league periods to date (the boundary tiebreak). */
  cumulativeTotal: number;
}

/** The target round's view + the alive field, as the store hands it over. */
export interface RoundContext {
  leagueId: string;
  round: {
    id: string;
    label: string;
    /** `period.cut_count` — null until the transition seeds the knockout rounds. */
    cutCount: number | null;
    /** `period.frozen_at` — null = results not yet final (the readiness precondition). */
    frozenAt: Date | null;
  };
  /** True iff this round was already cut (≥1 `playoff_entry` stamped `eliminated_round == round.label`). */
  alreadyCut: boolean;
  /** Earlier knockout rounds (lower {@link KNOCKOUT_ROUNDS} index) not yet cut — the ordering guard. */
  uncutPriorRounds: string[];
  /** The alive field with each manager's round score + cumulative tournament total. */
  alive: AliveSurvivor[];
}

/** The resolved cut to apply (produced by the pure `resolveRoundCut`). */
export interface ApplyRoundCut {
  leagueId: string;
  roundLabel: string;
  /** Managers to flip `alive → eliminated` this round. NON-EMPTY — every round cuts ≥ 1. */
  eliminated: string[];
  /** The lone survivor to flip `alive → champion` (final round), or null. */
  champion: string | null;
  /** The elimination instant (`eliminated_at`). */
  at: Date;
}

export interface PlayoffAdvanceStore {
  /** Assemble the round inputs, or null if no knockout round carries `roundLabel`. */
  loadRoundContext(leagueId: string, roundLabel: string): Promise<RoundContext | null>;
  /** Apply the resolved cut in ONE transaction. Returns "already-cut" when the conditional
   *  `alive → eliminated` claim matches 0 rows (a prior run already cut this round). */
  applyRoundCut(input: ApplyRoundCut): Promise<"applied" | "already-cut">;
}

// ── Prisma adapter ──────────────────────────────────────────────────────────────────────
export function createPrismaPlayoffAdvanceStore(prisma: PrismaClient): PlayoffAdvanceStore {
  return {
    async loadRoundContext(leagueId, roundLabel): Promise<RoundContext | null> {
      const round = await prisma.period.findFirst({
        where: { leagueId, kind: "knockout_round", label: roundLabel },
        select: { id: true, label: true, cutCount: true, frozenAt: true },
      });
      if (!round) return null;

      // Which knockout rounds are already cut (≥1 entry stamped with that round's label) — the
      // migration-free idempotency + ordering signal.
      const cutMarks = await prisma.playoffEntry.findMany({
        where: { leagueId, eliminatedRound: { not: null } },
        select: { eliminatedRound: true },
        distinct: ["eliminatedRound"],
      });
      const cutRounds = new Set(cutMarks.map((m) => m.eliminatedRound!));
      const idx = KNOCKOUT_ROUNDS.indexOf(roundLabel as KnockoutRound);
      const uncutPriorRounds =
        idx < 0 ? [] : KNOCKOUT_ROUNDS.slice(0, idx).filter((r) => !cutRounds.has(r));

      const aliveEntries = await prisma.playoffEntry.findMany({
        where: { leagueId, status: "alive" },
        select: { managerId: true },
      });
      const aliveIds = aliveEntries.map((e) => e.managerId);

      // This round's per-manager score (0 where no row).
      const roundScores = aliveIds.length
        ? await prisma.scoreManagerPeriod.findMany({
            where: { periodId: round.id, managerId: { in: aliveIds } },
            select: { managerId: true, points: true },
          })
        : [];
      const roundBy = new Map(roundScores.map((s) => [s.managerId, s.points] as const));

      // Cumulative tournament total: Σ points over ALL the league's periods (the boundary tiebreak), via the
      // SINGLE canonical helper the read path (`loadPlayoffs`) shares — one derivation, computed on the fly,
      // no stored column. Single-sourcing the period scoping here is what keeps the live zone == this cut.
      const cumBy = await loadCumulativeTournamentTotals(prisma, leagueId, aliveIds);

      return {
        leagueId,
        round: {
          id: round.id,
          label: round.label,
          cutCount: round.cutCount,
          frozenAt: round.frozenAt,
        },
        alreadyCut: cutRounds.has(roundLabel),
        uncutPriorRounds: [...uncutPriorRounds],
        alive: aliveIds.map((id) => ({
          managerId: id,
          roundPoints: roundBy.get(id) ?? 0,
          cumulativeTotal: cumBy.get(id) ?? 0,
        })),
      };
    },

    async applyRoundCut({
      leagueId,
      roundLabel,
      eliminated,
      champion,
      at,
    }): Promise<"applied" | "already-cut"> {
      return prisma.$transaction(async (tx) => {
        // Idempotent entry gate: flip only the still-ALIVE eliminated managers. 0 rows ⇒ a prior run
        // already cut this round (they are already `eliminated`) → no-op (mirrors the transition claim).
        const claim = await tx.playoffEntry.updateMany({
          where: { leagueId, status: "alive", managerId: { in: eliminated } },
          data: { status: "eliminated", eliminatedRound: roundLabel, eliminatedAt: at },
        });
        if (claim.count === 0) return "already-cut" as const;

        // Last survivor → champion (final round only; the orchestrator passes null otherwise).
        if (champion) {
          await tx.playoffEntry.updateMany({
            where: { leagueId, status: "alive", managerId: champion },
            data: { status: "champion" },
          });
        }
        return "applied" as const;
      });
    },
  };
}

// ── in-memory double (the orchestrator tests run against this) ──────────────────────────
interface MemEntry {
  managerId: string;
  status: "alive" | "eliminated" | "champion";
  eliminatedRound: string | null;
  eliminatedAt: Date | null;
}

export interface MemoryAdvanceSeed {
  leagueId?: string;
  /** The knockout-round periods present (label + cut_count + frozen_at). */
  rounds: { label: string; cutCount: number | null; frozenAt: Date | null }[];
  /** The playoff_entry rows (status defaults to "alive"; eliminatedRound defaults null). */
  entries: {
    managerId: string;
    status?: MemEntry["status"];
    eliminatedRound?: string | null;
  }[];
  /** roundScores[roundLabel][managerId] = this-round points (default 0). */
  roundScores?: Record<string, Record<string, number>>;
  /** cumulativeTotals[managerId] = Σ tournament points to date (default 0). */
  cumulativeTotals?: Record<string, number>;
}

/** A faithful in-memory {@link PlayoffAdvanceStore} mirroring the Prisma adapter's semantics. */
export class MemoryPlayoffAdvanceStore implements PlayoffAdvanceStore {
  readonly rounds = new Map<
    string,
    { label: string; cutCount: number | null; frozenAt: Date | null }
  >();
  readonly entries = new Map<string, MemEntry>();
  readonly roundScores: Record<string, Record<string, number>>;
  readonly cumulativeTotals: Record<string, number>;
  applyCount = 0;

  constructor(seed: MemoryAdvanceSeed) {
    for (const r of seed.rounds) this.rounds.set(r.label, { ...r });
    for (const e of seed.entries)
      this.entries.set(e.managerId, {
        managerId: e.managerId,
        status: e.status ?? "alive",
        eliminatedRound: e.eliminatedRound ?? null,
        eliminatedAt: null,
      });
    this.roundScores = seed.roundScores ?? {};
    this.cumulativeTotals = seed.cumulativeTotals ?? {};
  }

  async loadRoundContext(leagueId: string, roundLabel: string): Promise<RoundContext | null> {
    const round = this.rounds.get(roundLabel);
    if (!round) return null;
    const cutRounds = new Set(
      [...this.entries.values()]
        .map((e) => e.eliminatedRound)
        .filter((r): r is string => r !== null),
    );
    const idx = KNOCKOUT_ROUNDS.indexOf(roundLabel as KnockoutRound);
    const uncutPriorRounds =
      idx < 0 ? [] : KNOCKOUT_ROUNDS.slice(0, idx).filter((r) => !cutRounds.has(r));
    const aliveIds = [...this.entries.values()]
      .filter((e) => e.status === "alive")
      .map((e) => e.managerId);
    const scores = this.roundScores[roundLabel] ?? {};
    return {
      leagueId,
      round: {
        id: `p-${roundLabel}`,
        label: round.label,
        cutCount: round.cutCount,
        frozenAt: round.frozenAt,
      },
      alreadyCut: cutRounds.has(roundLabel),
      uncutPriorRounds: [...uncutPriorRounds],
      alive: aliveIds.map((id) => ({
        managerId: id,
        roundPoints: scores[id] ?? 0,
        cumulativeTotal: this.cumulativeTotals[id] ?? 0,
      })),
    };
  }

  async applyRoundCut({
    roundLabel,
    eliminated,
    champion,
    at,
  }: ApplyRoundCut): Promise<"applied" | "already-cut"> {
    // Conditional claim: only still-alive eliminated managers (mirrors the Prisma `updateMany WHERE
    // status='alive'`). 0 rows ⇒ a prior run already cut this round → no-op.
    const toFlip = eliminated.filter((id) => this.entries.get(id)?.status === "alive");
    if (toFlip.length === 0) return "already-cut";
    for (const id of toFlip) {
      const e = this.entries.get(id)!;
      e.status = "eliminated";
      e.eliminatedRound = roundLabel;
      e.eliminatedAt = at;
    }
    if (champion) {
      const c = this.entries.get(champion);
      if (c && c.status === "alive") c.status = "champion";
    }
    this.applyCount += 1;
    return "applied";
  }
}
