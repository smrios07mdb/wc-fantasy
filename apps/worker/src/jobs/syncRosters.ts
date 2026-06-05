/**
 * One-shot squad sync (the `player` + `fifa_team` bootstrap). Pulls the BALLDONTLIE FIFA rosters for
 * the current edition (2026) and upserts every player with their national team + mapped position — the
 * same `ingestRosters` path the scheduler runs on boot / slow cadence, exposed as a job so an operator
 * can populate or refresh the draft pool on demand: `pnpm --filter @app/worker job:rosters`.
 * Idempotent (upserts on BALLDONTLIE ids); safe to re-run. Writes to whatever DATABASE_URL points at.
 */
import { feed, ingestStore } from "../wiring";
import { ingestRosters } from "@app/ingest";
import { log } from "../logger";

async function main(): Promise<void> {
  log.info("job.rosters.start", {});
  await ingestRosters(feed, ingestStore);
  log.info("job.rosters.done", {});
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.rosters.error", { message: (err as Error).message });
    process.exit(1);
  });
