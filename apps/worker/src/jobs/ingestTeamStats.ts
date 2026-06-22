/**
 * One-shot team-stats backfill (T17). Pulls BALLDONTLIE team match stats for EVERY completed
 * `fifa_match` and upserts them via the SAME `mapTeamStat` + `upsertTeamStat` path the live scheduler
 * uses (`@app/ingest` `ingestTeamStats`) — now that `mapTeamStat` retains the full payload in
 * `stat_team_match.extra`, this repopulates matches ingested BEFORE T17 (the `settle` path deliberately
 * never re-pulls team stats, so those rows carry an empty `extra` and render "–" on the Statistics tab).
 *
 *   pnpm --filter @app/worker job:ingest-team-stats
 *
 * Display-only / fantasy-safe: it writes `stat_team_match` ONLY — no player dirty-mark, no recompute,
 * no other table. Idempotent (the `(match_id, team_id)` upsert overwrites in place); safe to re-run.
 * Per-match try/catch isolates failures — one bad match logs and is skipped, the run continues (mirrors
 * the `eachItem` per-item isolation at match granularity). Shape mirrors `job:recompute` / `job:rosters`.
 */
import { prisma, feed, ingestStore } from "../wiring";
import { ingestTeamStats } from "@app/ingest";
import { log } from "../logger";

async function main(): Promise<void> {
  // ALL completed matches — MD1, MD2, and any later completed fixtures were all ingested pre-T17, so
  // their `extra` is empty regardless of matchday. The natural-key upsert makes a re-run idempotent.
  const matches = await prisma.fifaMatch.findMany({
    where: { status: "completed" },
    select: { id: true, balldontlieId: true },
  });
  log.info("job.ingestTeamStats.start", { completedMatches: matches.length });

  let matchesOk = 0;
  let matchesFailed = 0;
  let teamRowsUpserted = 0;
  let foreignSkipped = 0;
  for (const m of matches) {
    try {
      const r = await ingestTeamStats(feed, ingestStore, m.balldontlieId);
      teamRowsUpserted += r.upserted;
      foreignSkipped += r.foreignSkipped;
      matchesOk++;
    } catch (err) {
      // One bad match must not abort the whole backfill.
      matchesFailed++;
      log.error("job.ingestTeamStats.match_error", {
        matchId: m.id,
        bdlId: m.balldontlieId,
        message: (err as Error).message,
      });
    }
  }

  log.info("job.ingestTeamStats.done", {
    completedMatches: matches.length,
    matchesOk,
    matchesFailed,
    teamRowsUpserted,
    foreignSkipped,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.ingestTeamStats.error", { message: (err as Error).message });
    process.exit(1);
  });
