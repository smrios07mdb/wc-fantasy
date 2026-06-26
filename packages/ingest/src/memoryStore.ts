/**
 * In-memory {@link IngestStore} — the test double. Models the raw tables keyed by BDL ids so seeding
 * here exercises the real ingestion orchestration (idempotent upserts, dirty marking, lock-on-play)
 * with NO database. Mirrors the production semantics: raw stat/rating writes mark (match,player) dirty;
 * event/shot/team writes do NOT (markPlayersDirty does, as in the Prisma store).
 */
import type { IngestStore, SchedulableMatch, LineupEntryIn } from "./store";
import type {
  MatchRowIn,
  StatLineRow,
  EventRowIn,
  ShotRowIn,
  TeamStatRowIn,
  GroupStandingRowIn,
} from "./map";
import { isLockWriteAuthorized } from "./lock";

const pk = (a: number, b: number): string => `${a}:${b}`;

export class MemoryIngestStore implements IngestStore {
  private stats = new Map<string, StatLineRow>();
  private ratings = new Map<string, number | null>();
  private events = new Map<number, EventRowIn>();
  private shots = new Map<number, ShotRowIn>();
  private teamStats = new Map<string, TeamStatRowIn>();
  private groupStandings = new Map<number, GroupStandingRowIn>(); // teamBdlId → row (T18)
  private dirty = new Set<string>();
  private locks = new Map<string, Date>();
  private appeared = new Map<number, Set<number>>(); // matchBdlId → appeared player BDL-ids (score rows)
  // matchBdlId → (playerBdlId → isStarter): the pre-kickoff availability snapshot (upsertLineupEntries).
  private lineupEntries = new Map<number, Map<number, boolean>>();
  /** Opt-in lock-gate model (mirrors `fifa_match` status+teams+period for `lockSlot`). When a match's facts
   *  are seeded the gate is enforced EXACTLY as production; an unseeded match exercises lock FLOW only — the
   *  gate's own coverage lives in `isLockWriteAuthorized`'s unit tests + the Prisma store. */
  private lockMatchFacts = new Map<
    number,
    {
      status: string;
      periodId: string | null;
      homeTeamBdlId: number | null;
      awayTeamBdlId: number | null;
    }
  >();
  private lockPlayerTeam = new Map<number, number>(); // playerBdlId → teamBdlId (team-membership gate)
  private periods = new Map<string, string>(); // `${kind}:${label}` → periodId
  private matches: SchedulableMatch[] = [];
  /** bdlId → what upsertMatch was called with (records the resolved period_id + fallback flag). */
  private upsertedMatches = new Map<
    number,
    { periodId: string | null; kickoffLockFallback: boolean }
  >();
  /** bdlId → fields upsertPlayerByBdlId was called with (rosters-sync assertions). */
  private upsertedPlayers = new Map<
    number,
    { displayName: string | null; position: string | null; teamBdlId: number | null }
  >();
  /** bdlId → name upsertTeamByBdlId was called with. */
  private upsertedTeams = new Map<number, string | null>();

  // ── seeding / assertions (test setup) ──
  seedPeriod(kind: string, label: string, id: string): void {
    this.periods.set(`${kind}:${label}`, id);
  }
  /** Seed the authoritative appeared set (the `score_player_match` participants) for a match. */
  seedAppeared(matchBdlId: number, playerBdlIds: readonly number[]): void {
    this.appeared.set(matchBdlId, new Set(playerBdlIds));
  }
  /** Seed a match's lock-gate facts (status + teams + period) so `lockSlot` enforces the FULL production
   *  gate for it. Without this a match is gate-exempt in memory (lock-FLOW-only tests). */
  seedMatchFacts(
    matchBdlId: number,
    facts: {
      status: string;
      periodId: string | null;
      homeTeamBdlId: number | null;
      awayTeamBdlId: number | null;
    },
  ): void {
    this.lockMatchFacts.set(matchBdlId, facts);
  }
  /** Seed a player's team id (for the team-membership gate). */
  seedPlayerTeam(playerBdlId: number, teamBdlId: number): void {
    this.lockPlayerTeam.set(playerBdlId, teamBdlId);
  }
  /** Pre-seed a lock directly, BYPASSING the gate — for tests asserting the monotonic latch / sweep no-ops. */
  seedLock(matchBdlId: number, playerBdlId: number, at: Date): void {
    this.locks.set(pk(matchBdlId, playerBdlId), at);
  }
  seedSchedulable(m: {
    bdlId: number;
    status: string;
    kickoffMs: number;
    hasRating?: boolean;
    lineupPulled?: boolean;
    lineupPeeked?: boolean;
    kickoffLockFallback?: boolean;
  }): void {
    this.matches.push({
      hasRating: false,
      lineupPulled: false,
      lineupPeeked: false,
      kickoffLockFallback: false,
      ...m,
    });
  }
  /** Test accessor: the persisted pre-kickoff snapshot for a match (playerBdlId → isStarter). */
  lineupEntriesFor(matchBdlId: number): Map<number, boolean> | undefined {
    return this.lineupEntries.get(matchBdlId);
  }
  statLines(): StatLineRow[] {
    return [...this.stats.values()];
  }
  allEvents(): EventRowIn[] {
    return [...this.events.values()];
  }
  allShots(): ShotRowIn[] {
    return [...this.shots.values()];
  }
  allTeamStats(): TeamStatRowIn[] {
    return [...this.teamStats.values()];
  }
  /** Test accessor: the stored group-standing rows (T18). */
  allGroupStandings(): GroupStandingRowIn[] {
    return [...this.groupStandings.values()];
  }
  isDirty(m: number, p: number): boolean {
    return this.dirty.has(pk(m, p));
  }
  clearDirty(m: number, p: number): void {
    this.dirty.delete(pk(m, p));
  }
  lockedAt(m: number, p: number): Date | undefined {
    return this.locks.get(pk(m, p));
  }
  ratingFor(m: number, p: number): number | null | undefined {
    return this.ratings.get(pk(m, p));
  }

  // ── IngestStore: reference rows ──
  upsertTeamByBdlId(bdlId: number, name: string | null): Promise<string> {
    this.upsertedTeams.set(bdlId, name);
    return Promise.resolve(`team-${bdlId}`);
  }
  upsertPlayerByBdlId(
    bdlId: number,
    fields: { displayName: string | null; position: string | null; teamBdlId: number | null },
  ): Promise<string> {
    this.upsertedPlayers.set(bdlId, fields);
    return Promise.resolve(`player-${bdlId}`);
  }
  /** Assertions for the rosters sync. */
  upsertedPlayer(
    bdlId: number,
  ): { displayName: string | null; position: string | null; teamBdlId: number | null } | undefined {
    return this.upsertedPlayers.get(bdlId);
  }
  upsertedPlayerCount(): number {
    return this.upsertedPlayers.size;
  }
  upsertedTeam(bdlId: number): string | null | undefined {
    return this.upsertedTeams.get(bdlId);
  }
  upsertedTeamCount(): number {
    return this.upsertedTeams.size;
  }
  upsertMatch(
    row: MatchRowIn,
    periodId: string | null,
    opts: { kickoffLockFallback?: boolean },
  ): Promise<{ matchId: string }> {
    this.upsertedMatches.set(row.bdlId, {
      periodId,
      kickoffLockFallback: opts.kickoffLockFallback ?? false,
    });
    return Promise.resolve({ matchId: `match-${row.bdlId}` });
  }
  /** Assertion: what period_id the schedule-sync resolved for a fixture. */
  upsertedMatch(
    bdlId: number,
  ): { periodId: string | null; kickoffLockFallback: boolean } | undefined {
    return this.upsertedMatches.get(bdlId);
  }
  resolvePeriodId(label: { kind: string; label: string } | null): Promise<string | null> {
    return Promise.resolve(
      label ? (this.periods.get(`${label.kind}:${label.label}`) ?? null) : null,
    );
  }

  // ── IngestStore: raw layer ──
  upsertStatLine(row: StatLineRow): Promise<void> {
    this.stats.set(pk(row.matchBdlId, row.playerBdlId), row);
    this.dirty.add(pk(row.matchBdlId, row.playerBdlId));
    return Promise.resolve();
  }
  upsertRatingBalldontlie(m: number, p: number, rating: number | null): Promise<void> {
    this.ratings.set(pk(m, p), rating);
    this.dirty.add(pk(m, p));
    return Promise.resolve();
  }
  upsertEvent(row: EventRowIn): Promise<void> {
    this.events.set(row.bdlId, row);
    return Promise.resolve();
  }
  upsertShot(row: ShotRowIn): Promise<void> {
    this.shots.set(row.bdlId, row);
    return Promise.resolve();
  }
  upsertTeamStat(row: TeamStatRowIn): Promise<void> {
    this.teamStats.set(pk(row.matchBdlId, row.teamBdlId), row);
    return Promise.resolve();
  }
  upsertGroupStanding(row: GroupStandingRowIn): Promise<boolean> {
    // FOREIGN-GUARD mirror: skip a row whose team was never registered via `upsertTeamByBdlId`
    // (models "team not in fifa_team"). Idempotent: keyed by teamBdlId. No dirty-mark, no recompute.
    if (!this.upsertedTeams.has(row.teamBdlId)) return Promise.resolve(false);
    this.groupStandings.set(row.teamBdlId, row);
    return Promise.resolve(true);
  }
  markPlayersDirty(m: number, ps: readonly number[]): Promise<void> {
    for (const p of ps) this.dirty.add(pk(m, p));
    return Promise.resolve();
  }

  // ── IngestStore: availability peek (plain table write; NOT a lock) ──
  upsertLineupEntries(matchBdlId: number, entries: readonly LineupEntryIn[]): Promise<void> {
    const m = this.lineupEntries.get(matchBdlId) ?? new Map<number, boolean>();
    for (const e of entries) m.set(e.playerBdlId, e.isStarter);
    this.lineupEntries.set(matchBdlId, m);
    return Promise.resolve();
  }

  // ── IngestStore: locking ──
  lockSlot(m: number, p: number, at: Date, now: Date, _path: string): Promise<boolean> {
    // Temporal now-gate — ALWAYS enforced (the boundary never trusts the caller).
    if (at.getTime() > now.getTime()) return Promise.resolve(false);
    // Team + status gate — enforced exactly as production WHEN the test opted in by seeding match facts.
    const facts = this.lockMatchFacts.get(m);
    if (facts) {
      const authz = isLockWriteAuthorized({
        periodId: facts.periodId,
        matchStatus: facts.status,
        homeTeamId: facts.homeTeamBdlId,
        awayTeamId: facts.awayTeamBdlId,
        playerTeamId: this.lockPlayerTeam.get(p) ?? null,
        lockedAtMs: at.getTime(),
        nowMs: now.getTime(),
      });
      if (!authz.ok) return Promise.resolve(false);
    }
    // Monotonic latch: only set when currently unlocked (mirrors the DB trigger / Prisma store).
    if (this.locks.has(pk(m, p))) return Promise.resolve(false);
    this.locks.set(pk(m, p), at);
    return Promise.resolve(true);
  }
  listAppearedPlayerBdlIds(matchBdlId: number): Promise<number[]> {
    return Promise.resolve([...(this.appeared.get(matchBdlId) ?? [])]);
  }

  // ── IngestStore: scheduler reads ──
  listSchedulableMatches(): Promise<SchedulableMatch[]> {
    // `lineupPeeked` mirrors the Prisma EXISTS: true once any `match_lineup_entry` row exists for the
    // match (OR a directly-seeded value, for selector-flow tests that don't go through upsert).
    return Promise.resolve(
      this.matches.map((m) => ({
        ...m,
        lineupPeeked: m.lineupPeeked || (this.lineupEntries.get(m.bdlId)?.size ?? 0) > 0,
      })),
    );
  }
}
