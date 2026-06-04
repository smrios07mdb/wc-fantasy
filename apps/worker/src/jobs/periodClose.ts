/**
 * Period-close cron entrypoint (runbook B3 — deploy the plumbing NOW; the freeze/close LOGIC is a later
 * prompt). Render's `wc-fantasy-period-close` cron runs this hourly. For now it is a live-but-inert
 * placeholder: it boots, logs, and exits 0 so the cron plumbing is green end-to-end. Replace the body
 * when period-close lands.
 *
 * TODO(prompt-NN: period close): after a wave's last FT + result_freeze_hours, stamp period.frozen_at
 * (INVARIANT 5) so the recompute sweeper gates restatement to commissioner-only (ARCHITECTURE §2/§4).
 */
console.log(
  JSON.stringify({
    level: "info",
    msg: "job.periodClose.placeholder",
    note: "not yet implemented — cron plumbing live",
  }),
);
