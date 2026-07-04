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
 * `champion`, the just-cut rosters are released, and (when a surface supplies the hook) a durable audit row
 * is written — all in ONE transaction. Server-side as the table owner — RLS does not bite. No scoring writes.
 *
 * ONE writer, three surfaces: the cut+release+audit body is the single {@link runRoundCutInTx}. The CLI cuts
 * with NO audit hook (stdout only); the web (`round_advance`, real actor) and the worker auto-fire
 * (`auto_advance`, null actor) call the same `applyRoundCut` with their own tx-bound audit hook, so no surface
 * re-implements the claim / champion / release statements. `applyRoundCut` self-opens its `$transaction`; the
 * audit hook rides the CONCRETE adapter only, never the pure port — the IO-free surface stays `@app/db`-free.
 */
import type { PrismaClient, Prisma } from "@app/db";
import { loadCumulativeTournamentTotals } from "@app/recompute/prisma";
import { releaseEliminatedRosters } from "@app/faab/prisma";
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
  /** The `period.id` of the round being cut — scopes the just-cut managers' locked-slot release to exactly
   *  this round (the round they just played). */
  roundPeriodId: string;
  /** Managers to flip `alive → eliminated` this round. NON-EMPTY — every round cuts ≥ 1. */
  eliminated: string[];
  /** The lone survivor to flip `alive → champion` (final round), or null. */
  champion: string | null;
  /** The elimination instant (`eliminated_at`). */
  at: Date;
}

/** One player that WILL be / WAS released from a cut manager's roster — the dry-run blast-radius preview
 *  (`loadActiveRosters`) and the confirm copy read this. The apply-side audit records the ids only. */
export interface ReleasePreviewPlayer {
  playerId: string;
  name: string;
}

/** The outcome of an applied cut. `applied` carries the released roster ids per eliminated manager (the
 *  audit trail); `already-cut` is the idempotent no-op (a prior run cut this round) — it releases nothing
 *  and mints no audit row. */
export type AdvanceApplyOutcome =
  | { outcome: "applied"; released: Record<string, string[]> }
  | { outcome: "already-cut" };

export interface PlayoffAdvanceStore {
  /** Assemble the round inputs, or null if no knockout round carries `roundLabel`. */
  loadRoundContext(leagueId: string, roundLabel: string): Promise<RoundContext | null>;
  /** The active roster of each named manager (id + display name), for the dry-run RELEASE preview — the
   *  blast radius the plan shows before the type-to-confirm apply. A manager with no active roster maps to
   *  an empty list. */
  loadActiveRosters(
    leagueId: string,
    managerIds: readonly string[],
  ): Promise<Record<string, ReleasePreviewPlayer[]>>;
  /** Apply the resolved cut AND release the just-cut managers' entire rosters to the wire in ONE
   *  transaction. `already-cut` when the conditional `alive → eliminated` claim matches 0 rows (a prior run
   *  already cut this round) — nothing is released. `applied` carries the released roster ids per manager. */
  applyRoundCut(input: ApplyRoundCut): Promise<AdvanceApplyOutcome>;
}

// ── Prisma adapter ──────────────────────────────────────────────────────────────────────
/** A tx-bound audit hook: writes the durable `commish_audit` governance row INSIDE the cut+release
 *  transaction, so the row and the effect commit ATOMICALLY (a rolled-back cut takes its audit row with it,
 *  and a committed cut never lacks its ledger row). It is handed the transaction client + the per-manager
 *  released map; the caller's closure owns the row shape and captures any inserted id (the web `auditId()`
 *  seam). Omitted ⇒ NO governance row (the CLI path — stdout audit only). Rides the CONCRETE adapter ONLY —
 *  never the pure {@link PlayoffAdvanceStore} port (a `Prisma.TransactionClient` there would drag `@app/db`
 *  into the IO-free surface). */
export type RecordCutAudit = (
  tx: Prisma.TransactionClient,
  released: Record<string, string[]>,
) => Promise<void>;

/** Options for the concrete adapter's {@link PrismaPlayoffAdvanceStore.applyRoundCut}. `recordAudit`, when
 *  given, writes the durable governance row inside the writer's self-opened cut+release transaction; it rides
 *  the concrete adapter only (never the pure port — a `Prisma.TransactionClient` there would drag `@app/db`
 *  into the IO-free surface). */
export interface ApplyRoundCutOptions {
  recordAudit?: RecordCutAudit;
}

/** The CONCRETE Prisma adapter shape. It widens the pure {@link PlayoffAdvanceStore} port's `applyRoundCut`
 *  with the optional tx-bound audit hook — an extra OPTIONAL param that keeps it structurally assignable to
 *  the port, which the orchestrator + CLI consume unchanged (they pass no hook). */
export interface PrismaPlayoffAdvanceStore extends Omit<PlayoffAdvanceStore, "applyRoundCut"> {
  applyRoundCut(input: ApplyRoundCut, opts?: ApplyRoundCutOptions): Promise<AdvanceApplyOutcome>;
}

/**
 * The SINGLE writer of the cut+release+audit transaction body — the one place the conditional
 * `alive → eliminated` claim, the champion flip, the whole-roster release, and (when a hook is given) the
 * durable audit row live. Runs entirely within the passed transaction client (like `releaseEliminatedRosters`);
 * `createPrismaPlayoffAdvanceStore` and the web / auto-fire surfaces all funnel through it, so the three cut
 * surfaces share ONE implementation and none re-implement the statements. The 0-row claim is the idempotency
 * gate that fronts BOTH the release AND the audit hook: a re-run cuts nothing, releases nothing, writes no row.
 */
async function runRoundCutInTx(
  tx: Prisma.TransactionClient,
  { leagueId, roundLabel, roundPeriodId, eliminated, champion, at }: ApplyRoundCut,
  recordAudit?: RecordCutAudit,
): Promise<AdvanceApplyOutcome> {
  // Idempotent entry gate: flip only the still-ALIVE eliminated managers. 0 rows ⇒ a prior run already cut
  // this round ⇒ no-op (NO release, NO audit row).
  const claim = await tx.playoffEntry.updateMany({
    where: { leagueId, status: "alive", managerId: { in: eliminated } },
    data: { status: "eliminated", eliminatedRound: roundLabel, eliminatedAt: at },
  });
  if (claim.count === 0) return { outcome: "already-cut" as const };

  // Last survivor → champion (final round only; the orchestrator passes null otherwise).
  if (champion) {
    await tx.playoffEntry.updateMany({
      where: { leagueId, status: "alive", managerId: champion },
      data: { status: "champion" },
    });
  }

  // Release the just-cut managers' ENTIRE active roster to the wire, ENLISTED in THIS transaction so the cut
  // + release commit atomically. Reuses the shared `@app/faab` release primitive (locked slots released under
  // the `app.commish_override` GUC, scoped to the round just played).
  const released = await releaseEliminatedRosters(tx, {
    leagueId,
    managerIds: eliminated,
    roundPeriodId,
    at,
  });

  // The durable governance row, when a surface supplies the hook — inserted in THIS same transaction so the
  // cut + release + audit are one atomic unit. The CLI passes no hook (stdout audit only).
  if (recordAudit) await recordAudit(tx, released);

  return { outcome: "applied" as const, released };
}

// ── Prisma adapter ──────────────────────────────────────────────────────────────────────
export function createPrismaPlayoffAdvanceStore(prisma: PrismaClient): PrismaPlayoffAdvanceStore {
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

    async loadActiveRosters(leagueId, managerIds): Promise<Record<string, ReleasePreviewPlayer[]>> {
      const out: Record<string, ReleasePreviewPlayer[]> = {};
      for (const id of managerIds) out[id] = [];
      if (managerIds.length === 0) return out;
      const rows = await prisma.rosterPlayer.findMany({
        where: { leagueId, managerId: { in: [...managerIds] }, droppedAt: null },
        select: { managerId: true, player: { select: { id: true, displayName: true } } },
      });
      for (const r of rows) {
        (out[r.managerId] ??= []).push({ playerId: r.player.id, name: r.player.displayName });
      }
      return out;
    },

    /** Apply the resolved cut in ONE self-opened `$transaction`. `opts.recordAudit`, when given, writes the
     *  durable governance row inside that same transaction. The whole body is {@link runRoundCutInTx}, the
     *  single writer shared by the CLI, web, and auto-fire surfaces. */
    async applyRoundCut(input, opts = {}): Promise<AdvanceApplyOutcome> {
      return prisma.$transaction((tx) => runRoundCutInTx(tx, input, opts.recordAudit));
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
  /** rosters[managerId] = active roster player ids (default none) — what a cut manager's release sheds. */
  rosters?: Record<string, string[]>;
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
  readonly rosters: Record<string, string[]>;
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
    this.rosters = Object.fromEntries(
      Object.entries(seed.rosters ?? {}).map(([id, ids]) => [id, [...ids]]),
    );
  }

  async loadActiveRosters(
    _leagueId: string,
    managerIds: readonly string[],
  ): Promise<Record<string, ReleasePreviewPlayer[]>> {
    const out: Record<string, ReleasePreviewPlayer[]> = {};
    for (const id of managerIds) {
      out[id] = (this.rosters[id] ?? []).map((playerId) => ({ playerId, name: playerId }));
    }
    return out;
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
  }: ApplyRoundCut): Promise<AdvanceApplyOutcome> {
    // Conditional claim: only still-alive eliminated managers (mirrors the Prisma `updateMany WHERE
    // status='alive'`). 0 rows ⇒ a prior run already cut this round → no-op (releases nothing).
    const toFlip = eliminated.filter((id) => this.entries.get(id)?.status === "alive");
    if (toFlip.length === 0) return { outcome: "already-cut" };
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
    // Model the whole-roster release: capture each cut manager's active roster, then clear it (dropped to
    // the wire). Mirrors the Prisma adapter's in-tx `releaseEliminatedRosters` (which returns the same map).
    const released: Record<string, string[]> = {};
    for (const id of eliminated) {
      released[id] = [...(this.rosters[id] ?? [])];
      this.rosters[id] = [];
    }
    this.applyCount += 1;
    return { outcome: "applied", released };
  }
}
