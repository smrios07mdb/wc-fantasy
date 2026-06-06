/**
 * In-memory {@link LineupStore} — the test double + a local harness. It models the same tables the
 * Prisma store reads/writes (manager → league, active roster_player → the squad, period windows, and
 * the per-(manager, period) `lineup_slot` rows with their `locked_at` latch), so seeding rows here
 * exercises the REAL controller (validate → commit) and the REAL lock latch with NO database.
 *
 * `saveLineup` reproduces the production write-time invariant the DB trigger `enforce_lineup_lock()`
 * guarantees: a `locked` slot's `is_starter` is immutable — a commit that would flip one is refused
 * (no partial write), exactly as the trigger would `RAISE EXCEPTION`. No method reads the wall clock.
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
  locked: boolean;
}

export class MemoryLineupStore implements LineupStore {
  private managers = new Map<string, string>(); // managerId → leagueId
  private periods = new Map<string, { leagueId: string; window: PeriodWindow }>(); // periodId → …
  private roster: RosterRow[] = [];
  private slots: SlotRecord[] = [];

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
  /** Seed a pre-existing `lineup_slot` row (e.g. a player already locked by play). */
  seedSlot(
    managerId: string,
    periodId: string,
    playerId: string,
    role: Position,
    opts: { isStarter: boolean; locked: boolean },
  ): void {
    this.slots.push({
      managerId,
      periodId,
      playerId,
      role,
      isStarter: opts.isStarter,
      locked: opts.locked,
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
      locked: s.locked,
    }));

    const p = this.periods.get(periodId);
    const period = p && p.leagueId === leagueId ? p.window : null;

    return Promise.resolve({ leagueId, squad, slots, period });
  }

  saveLineup(commit: LineupCommit): Promise<SaveOutcome> {
    // (1) Write-time latch (mirrors enforce_lineup_lock): refuse the WHOLE commit if it would change a
    //     locked slot's is_starter. Check everything BEFORE writing anything (no partial write).
    for (const d of commit.desired) {
      const cur = this.slotFor(commit.managerId, commit.periodId, d.playerId);
      if (cur && cur.locked && cur.isStarter !== d.isStarter) {
        return Promise.resolve({
          ok: false,
          conflict: { playerId: cur.playerId, isStarter: cur.isStarter },
        });
      }
    }

    // TODO(prompt-NN: FAAB add/drop) — mirror the reconcile DELETE the Prisma adapter documents: when a
    // drop path exists, remove current rows whose playerId is absent from `desired` AND not locked, so a
    // dropped player leaves no stale orphan slot. Benign now (squad fixed at 15; no drop write path).

    // (2) Apply: upsert each desired slot. Locked rows are immutable — and already validated equal — so
    //     they are left untouched; unlocked rows are overwritten; missing rows are inserted (unlocked).
    for (const d of commit.desired) {
      const cur = this.slotFor(commit.managerId, commit.periodId, d.playerId);
      if (!cur) {
        this.slots.push({
          managerId: commit.managerId,
          periodId: commit.periodId,
          playerId: d.playerId,
          role: d.role,
          isStarter: d.isStarter,
          locked: false,
        });
      } else if (!cur.locked) {
        cur.isStarter = d.isStarter;
        cur.role = d.role;
      }
    }
    return Promise.resolve({ ok: true });
  }
}
