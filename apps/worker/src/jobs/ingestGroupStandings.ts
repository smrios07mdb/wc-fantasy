/**
 * Group-standings backfill / refresh (T18). Pulls BALLDONTLIE WC `group_standings` (all 12 groups in one
 * non-paginated call) and upserts each team's row via the SAME `mapGroupStanding` + `upsertGroupStanding`
 * path the new `@app/ingest` `ingestGroupStandings` orchestrator uses — populating the game-detail
 * Standings tab.
 *
 *   pnpm --filter @app/worker job:ingest-group-standings
 *
 * Display-only / fantasy-safe: it writes `group_standing` ONLY — no player dirty-mark, no recompute, no
 * other table. Idempotent (the `team_id` upsert overwrites in place); safe to re-run after each matchday
 * to refresh positions/points. Foreign-guarded inside the store (a standings row for a team not yet in
 * `fifa_team` is skipped + counted). Shape mirrors `job:ingest-team-stats` (single feed call, no per-match
 * loop since the endpoint is not match-scoped).
 */
import { feed, ingestStore } from "../wiring";
import { ingestGroupStandings } from "@app/ingest";
import { log } from "../logger";

// WC2026-only (the table's PK is per-edition `team_id`); the orchestrator defaults to 2026.
const SEASON = 2026;

async function main(): Promise<void> {
  log.info("job.ingestGroupStandings.start", { season: SEASON });
  const r = await ingestGroupStandings(feed, ingestStore, SEASON);
  log.info("job.ingestGroupStandings.done", {
    season: SEASON,
    fetched: r.fetched,
    upserted: r.upserted,
    foreignSkipped: r.foreignSkipped,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.ingestGroupStandings.error", { message: (err as Error).message });
    process.exit(1);
  });
