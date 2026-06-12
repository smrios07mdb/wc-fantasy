/**
 * In-memory {@link LineupStore} — the test double + a local harness. It models the same tables the
 * Prisma store reads/writes (manager → league, active roster_player → the squad, period windows, and
 * the per-(manager, period) `lineup_slot` rows with their `locked_at` latch), so seeding rows here
 * exercises the REAL controller (validate → commit) and the REAL lock latch with NO database.
 *
 * `saveLineup` reproduces the production write-time invariant the DB trigger `enforce_lineup_lock()`
 * guarantees: a `locked` slot's `is_starter` is immutable EXCEPT the one sanctioned forfeit transition
 * (a played starter benched + voided in the same write) — a commit that would otherwise flip a locked
 * slot is refused (no partial write), exactly as the trigger would `RAISE EXCEPTION`. A forfeit stamps
 * `voided` and records a manager-period recompute enqueue. No method reads the wall clock.
 */
import type { Position } from "@app/shared";
import type { SquadPlayer, PeriodWindow } from "./validate";
import type { LineupCommit, LineupContext, LineupStore, SaveOutcome, SlotRow } from "./store";

interface RosterRow {
  leagueId: string;
  managerId: string;
  playerId: string;
  position: Position;
}

interface SlotRecord {
  managerId: string;
  periodId: string;
  playerId: string;
  role: Position;
  isStarter: boolean;
  /** `score_player_match` row exists — the authoritative "has played" (drives validate's forfeit rules). */
  hasPlayed: boolean;
  /** `locked_at IS NOT NULL` — the lock-on-play latch (drives the write-time trigger mirror). */
  locked: boolean;
  /** `voided_at IS NOT NULL` — the player was forfeited (one-way). */
  voided: boolean;
}

/** A recorded manager-period recompute enqueue (the recompute_dirty insert the forfeit save makes). */
interface RecomputeRef {
  managerId: string;
  periodId: string;
}

export class MemoryLineupStore implements LineupStore {
  private managers = new Map<string, string>(); // managerId → leagueId
  private periods = new Map<string, { leagueId: string; window: PeriodWindow }>(); // periodId → …
  private roster: RosterRow[] = [];
  private slots: SlotRecord[] = [];
  private enqueued: RecomputeRef[] = []; // manager-period recompute enqueues the forfeit save made

  // ── seeding (test setup) ──
  seedManager(managerId: string, leagueId: string): void {
    this.managers.set(managerId, leagueId);
  }
  seedPeriod(leagueId: string, window: PeriodWindow): void {
    this.periods.set(window.id, { leagueId, window });
  }
  /** Seed an active roster ownership (a squad member). */
  seedRoster(leagueId: string, managerId: string, playerId: string, position: Position): void {
    this.roster.push({ leagueId, managerId, playerId, position });
  }
  /** Seed a pre-existing `lineup_slot` row. `hasPlayed` (a score_player_match exists) drives the validator's
   *  forfeit rules; `locked` (locked_at) drives the write-time latch; `voided` is the one-way forfeit latch.
   *  `hasPlayed`/`locked` default to each other (a played player is normally locked, and vice-versa). */
  seedSlot(
    managerId: string,
    periodId: string,
    playerId: string,
    role: Position,
    opts: { isStarter: boolean; hasPlayed?: boolean; locked?: boolean; voided?: boolean },
  ): void {
    const hasPlayed = opts.hasPlayed ?? opts.locked ?? false;
    this.slots.push({
      managerId,
      periodId,
      playerId,
      role,
      isStarter: opts.isStarter,
      hasPlayed,
      locked: opts.locked ?? hasPlayed,
      voided: opts.voided ?? false,
    });
  }

  // ── assertions (test reads) ──
  slotsOf(managerId: string, periodId: string): SlotRecord[] {
    return this.slots.filter((s) => s.managerId === managerId && s.periodId === periodId);
  }
  starterIdsOf(managerId: string, periodId: string): string[] {
    return this.slotsOf(managerId, periodId)
      .filter((s) => s.isStarter)
      .map((s) => s.playerId);
  }
  benchIdsOf(managerId: string, periodId: string): string[] {
    return this.slotsOf(managerId, periodId)
      .filter((s) => !s.isStarter)
      .map((s) => s.playerId);
  }
  /** The player ids forfeited (voided) for a (manager, period). */
  voidedIdsOf(managerId: string, periodId: string): string[] {
    return this.slotsOf(managerId, periodId)
      .filter((s) => s.voided)
      .map((s) => s.playerId);
  }
  /** The manager-period recompute enqueues `saveLineup` recorded (the recompute_dirty inserts). */
  enqueuedRecomputes(): readonly RecomputeRef[] {
    return this.enqueued;
  }

  private slotFor(managerId: string, periodId: string, playerId: string): SlotRecord | undefined {
    return this.slots.find(
      (s) => s.managerId === managerId && s.periodId === periodId && s.playerId === playerId,
    );
  }

  // ── LineupStore ──
  loadLineupContext(managerId: string, periodId: string): Promise<LineupContext | null> {
    const leagueId = this.managers.get(managerId);
    if (!leagueId) return Promise.resolve(null);

    const squad: SquadPlayer[] = this.roster
      .filter((r) => r.managerId === managerId)
      .map((r) => ({ playerId: r.playerId, position: r.position }));

    const slots: SlotRow[] = this.slotsOf(managerId, periodId).map((s) => ({
      playerId: s.playerId,
      isStarter: s.isStarter,
      hasPlayed: s.hasPlayed,
      voided: s.voided,
    }));

    const p = this.periods.get(periodId);
    const period = p && p.leagueId === leagueId ? p.window : null;

    return Promise.resolve({ leagueId, squad, slots, period });
  }

  saveLineup(commit: LineupCommit): Promise<SaveOutcome> {
    // Commissioner carve-out (mirrors the prismaStore GUC + the DB trigger exemption): --allow-locked-slot
    // both SKIPS the write-time latch re-check (below) AND lets a locked row be overwritten (step 2).
    const override = commit.allowLockedSlot === true;
    const voidSet = new Set(commit.voidPlayerIds);
    // (1) Write-time latch (mirrors enforce_lineup_lock): refuse the WHOLE commit if it would change a
    //     locked slot's is_starter — EXCEPT the one sanctioned forfeit transition (a played starter
    //     benched AND voided in this same write). Check everything BEFORE writing (no partial write).
    //     Skipped under the commissioner override.
    if (!override) {
      for (const d of commit.desired) {
        const cur = this.slotFor(commit.managerId, commit.periodId, d.playerId);
        if (!cur || !cur.locked || cur.isStarter === d.isStarter) continue;
        // A locked slot's is_starter would change. Allowed iff it's the forfeit transition: starter →
        // bench for a player in this commit's void set. Anything else is the latch conflict.
        const isForfeit = voidSet.has(d.playerId) && cur.isStarter && !d.isStarter;
        if (!isForfeit) {
          return Promise.resolve({
            ok: false,
            conflict: { playerId: cur.playerId, isStarter: cur.isStarter },
          });
        }
      }
    }

    // TODO(prompt-NN: FAAB add/drop) — mirror the reconcile DELETE the Prisma adapter documents: when a
    // drop path exists, remove current rows whose playerId is absent from `desired` AND not locked, so a
    // dropped player leaves no stale orphan slot. Benign now (squad fixed at 15; no drop write path).

    // (2) Apply: upsert each desired slot. A forfeit target is benched AND stamped voided (one-way; the
    //     locked latch is bypassed for exactly this transition, mirroring the extended trigger). A normal
    //     locked row is immutable (left untouched); under the override any row is overwritten. Missing rows
    //     are inserted unlocked/unvoided; unlocked rows are overwritten. `locked_at` itself never changes.
    for (const d of commit.desired) {
      const cur = this.slotFor(commit.managerId, commit.periodId, d.playerId);
      const forfeit = voidSet.has(d.playerId);
      if (!cur) {
        this.slots.push({
          managerId: commit.managerId,
          periodId: commit.periodId,
          playerId: d.playerId,
          role: d.role,
          isStarter: d.isStarter,
          hasPlayed: false,
          locked: false,
          voided: false,
        });
      } else if (forfeit) {
        cur.isStarter = false; // a forfeited player is benched
        cur.role = d.role;
        cur.voided = true; // one-way: voided_at stamped
      } else if (override || !cur.locked) {
        cur.isStarter = d.isStarter;
        cur.role = d.role;
      }
    }

    // (3) A forfeit changes who counts toward the manager-period score → enqueue a restate (deduped,
    //     mirroring @app/recompute's enqueueManagerPeriodDirty). No forfeit → no enqueue (unchanged path).
    if (voidSet.size > 0) {
      const already = this.enqueued.some(
        (r) => r.managerId === commit.managerId && r.periodId === commit.periodId,
      );
      if (!already) this.enqueued.push({ managerId: commit.managerId, periodId: commit.periodId });
    }
    return Promise.resolve({ ok: true });
  }
}
