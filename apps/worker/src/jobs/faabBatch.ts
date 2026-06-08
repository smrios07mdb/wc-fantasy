/**
 * FAAB batch cron entrypoint (DECISIONS.md §D — the daily pre-dawn blind-bid clearing run). Render's
 * `wc-fantasy-faab-batch` cron runs this daily at ~06:00 league-local. It opens a `FaabBatch`, reads
 * the league's pending bids + managers + roster state + add-target kickoffs, calls the pure
 * `@app/faab` resolver (the locked 8-step algorithm), then writes ALL outcomes in ONE atomic
 * transaction (the no-double-spend / valid-drop / waiver-order-contiguity guard) and stamps the batch
 * `complete`. Idempotent: a batch with nothing pending creates no row, and a re-run after a clear finds
 * the bids terminal and is a clean no-op.
 *
 * FAAB runs only while a league is live (group or playoff). The acquisition cutoff (void + refund a bid
 * whose add target already kicked off) is handled INSIDE the resolver from the fixture schedule — no new
 * live-data dependency (DECISIONS §D data note). The playoff FAAB reset + waiver carry-forward belong to
 * the separate group→playoff transition prompt; this job only READS the current budget/order.
 */
import { runFaabBatch } from "@app/faab";
import { createPrismaFaabBatchStore } from "@app/faab/prisma";
import { prisma } from "../wiring";
import { log } from "../logger";

async function main(): Promise<void> {
  const now = new Date();
  const store = createPrismaFaabBatchStore(prisma);

  // FAAB clears for every live league (single private league in this product, but kept general).
  const leagues = await prisma.league.findMany({
    where: { status: { in: ["group", "playoff"] } },
    select: { id: true },
  });
  log.info("job.faab.start", { leagues: leagues.length, runAt: now.toISOString() });

  for (const league of leagues) {
    const summary = await runFaabBatch(store, league.id, now);
    if (summary.batchId === null) {
      log.info("job.faab.skip", { leagueId: league.id, reason: "no pending bids" });
    } else {
      log.info("job.faab.cleared", {
        leagueId: league.id,
        batchId: summary.batchId,
        processed: summary.bidsProcessed,
        won: summary.won,
        lost: summary.lost,
        voided: summary.voided,
        waiverOrderChanged: summary.waiverOrderChanged,
      });
    }
  }

  log.info("job.faab.done", { leagues: leagues.length });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("job.faab.error", { message: (err as Error).message });
    process.exit(1);
  });
