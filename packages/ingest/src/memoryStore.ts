/**
 * In-memory {@link IngestStore} — the test double. Models the raw tables keyed by BDL ids so seeding
 * here exercises the real ingestion orchestration (idempotent upserts, dirty marking, lock-on-play)
 * with NO database. Mirrors the production semantics: raw stat/rating writes mark (match,player) dirty;
 * event/shot/team writes do NOT (markPlayersDirty does, as in the Prisma store).
 */
import type { IngestStore, SchedulableMatch } from "./store";
import type { MatchRowIn, StatLineRow, EventRowIn, ShotRowIn, TeamStatRowIn } from "./map";

const pk = (a: number, b: number): string => `${a}:${b}`;

export class MemoryIngestStore implements IngestStore {
  private stats = new Map<string, StatLineRow>();
  private ratings = new Map<string, number | null>();
  private events = new Map<number, EventRowIn>();
  private shots = new Map<number, ShotRowIn>();
  private teamStats = new Map<string, TeamStatRowIn>();
  private dirty = new Set<string>();
  private locks = new Map<string, Date>();
  private appeared = new Map<number, Set<number>>(); // matchBdlId → appeared player BDL-ids (score rows)
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
  seedSchedulable(m: {
    bdlId: number;
    status: string;
    kickoffMs: number;
    hasRating?: boolean;
    lineupPulled?: boolean;
    kickoffLockFallback?: boolean;
  }): void {
    this.matches.push({
      hasRating: false,
      lineupPulled: false,
      kickoffLockFallback: false,
      ...m,
    });
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
  markPlayersDirty(m: number, ps: readonly number[]): Promise<void> {
    for (const p of ps) this.dirty.add(pk(m, p));
    return Promise.resolve();
  }

  // ── IngestStore: locking ──
  setLockedAt(m: number, p: number, at: Date): Promise<void> {
    // Monotonic latch: only set when currently unlocked (mirrors the DB trigger / Prisma store).
    if (!this.locks.has(pk(m, p))) this.locks.set(pk(m, p), at);
    return Promise.resolve();
  }
  listAppearedPlayerBdlIds(matchBdlId: number): Promise<number[]> {
    return Promise.resolve([...(this.appeared.get(matchBdlId) ?? [])]);
  }

  // ── IngestStore: scheduler reads ──
  listSchedulableMatches(): Promise<SchedulableMatch[]> {
    return Promise.resolve([...this.matches]);
  }
}
