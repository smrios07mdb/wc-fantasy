/**
 * Provisioning CLI (runbook A4–A5) — the IO runner for the pure plan (plan.ts). Idempotent upserts that
 * stand up a league from a config the commissioner edits. Like @app/draft's prismaStore this is a thin
 * DB edge with no unit test (it needs a live DB); the pure plan is fully unit-tested. SECRETS NEVER live
 * here — the config holds only names/emails/timer; the DB URL comes from the env (Render/Supabase).
 *
 *   pnpm --filter @app/worker provision provision   # league + periods + managers + allowlist + pending draft
 *   pnpm --filter @app/worker provision bind         # link each manager to the app_user created at sign-in
 *   pnpm --filter @app/worker provision rank <file>  # populate player.default_rank from a best-first id list
 *   pnpm --filter @app/worker provision draft         # START the draft via the controller's startDraft
 *   pnpm --filter @app/worker provision status       # print current provisioning state
 *
 * Config path: $PROVISION_CONFIG, else <repo-root>/provision.config.json (see provision.config.example.json).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { prisma } from "@app/db";
import { startDraft, DraftNotReadyError } from "@app/draft";
import { createPrismaDraftStore } from "@app/draft/prisma";
import {
  buildDefaultRankUpdates,
  buildProvisionPlan,
  normalizeEmail,
  validateConfig,
  type ProvisionConfig,
} from "./plan";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
loadEnv({ path: resolve(repoRoot, ".env") });

function loadConfig(): ProvisionConfig {
  const path = process.env.PROVISION_CONFIG ?? resolve(repoRoot, "provision.config.json");
  const config = JSON.parse(readFileSync(path, "utf8")) as ProvisionConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error(`Invalid config (${path}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Config OK: ${path}`);
  return config;
}

/** Single private league (ARCHITECTURE §4): find the one league, or null. */
async function findLeague() {
  return prisma.league.findFirst();
}

async function provision(): Promise<void> {
  const plan = buildProvisionPlan(loadConfig());

  // 1. League — single-league upsert (find-or-create, then keep config fields fresh).
  const existing = await findLeague();
  const leagueData = {
    name: plan.league.name,
    seasonYear: plan.league.seasonYear,
    timezone: plan.league.timezone,
    faabBatchLocalTime: plan.league.faabBatchLocalTime,
    resultFreezeHours: plan.league.resultFreezeHours,
    draftPickSeconds: plan.league.draftPickSeconds,
  };
  const league = existing
    ? await prisma.league.update({ where: { id: existing.id }, data: leagueData })
    : await prisma.league.create({ data: { ...leagueData, status: plan.league.status } });
  console.log(
    `league: ${existing ? "updated" : "created"} ${league.name} (${league.id}, status=${league.status})`,
  );

  // 2. Periods — upsert by (leagueId, label).
  for (const p of plan.periods) {
    await prisma.period.upsert({
      where: { leagueId_label: { leagueId: league.id, label: p.label } },
      create: { leagueId: league.id, kind: p.kind, label: p.label, cutCount: p.cutCount },
      update: { kind: p.kind, cutCount: p.cutCount },
    });
  }
  console.log(`periods: ${plan.periods.length} upserted`);

  // 3. Allowlist — upsert by (leagueId, email).
  for (const email of plan.allowlist) {
    await prisma.allowlistEmail.upsert({
      where: { leagueId_email: { leagueId: league.id, email } },
      create: { leagueId: league.id, email },
      update: {},
    });
  }
  console.log(`allowlist: ${plan.allowlist.length} upserted`);

  // 4. Managers + waiver order. faabBudget/userId are seeded on CREATE only (never clobber a started
  //    league). The waiver order is reseeded ONLY pre-draft (status 'draft'), via the schema's documented
  //    null-then-assign so the non-deferrable @@unique([leagueId, waiverOrderPosition]) never trips.
  await prisma.$transaction(async (tx) => {
    for (const m of plan.managers) {
      await tx.manager.upsert({
        where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
        create: {
          leagueId: league.id,
          draftSlot: m.draftSlot,
          displayName: m.displayName,
          isCommissioner: m.isCommissioner,
          faabBudget: m.faabBudget,
        },
        update: { displayName: m.displayName, isCommissioner: m.isCommissioner },
      });
    }
    if (league.status === "draft") {
      await tx.manager.updateMany({
        where: { leagueId: league.id },
        data: { waiverOrderPosition: null },
      });
      for (const m of plan.managers) {
        await tx.manager.update({
          where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
          data: { waiverOrderPosition: m.waiverOrderPosition },
        });
      }
    }
  });
  console.log(
    `managers: ${plan.managers.length} upserted` +
      (league.status === "draft"
        ? " (waiver order reseeded)"
        : " (waiver order left as-is; league not in draft)"),
  );

  // 5. The PENDING draft row — a benign placeholder, NOT a started server-authoritative draft. It exists
  //    only so the controller's startDraft (via `provision draft`) can ACTIVATE it. `update: {}` never
  //    touches an already-started draft, so re-running provision is safe.
  await prisma.draft.upsert({
    where: { leagueId: league.id },
    create: { leagueId: league.id },
    update: {},
  });
  console.log("draft: pending row ready.");

  console.log(
    "Done. Next: friends sign in via magic-link → `provision bind`, then `provision draft` to start.",
  );
}

/**
 * Start the draft — the commissioner's go-live. Calls the UNCHANGED controller `startDraft` (which
 * activates the pending row server-authoritatively: pick 1 on the clock, pick_deadline_at = now +
 * draft_pick_seconds, the first snake manager). We do NOT hand-insert an active draft row.
 */
async function startDraftCmd(): Promise<void> {
  const league = await findLeague();
  if (!league) {
    console.error("No league — run `provision provision` first.");
    process.exit(1);
  }
  const draft = await prisma.draft.findUnique({ where: { leagueId: league.id } });
  if (!draft) {
    console.error("No draft row — run `provision provision` first.");
    process.exit(1);
  }
  const store = createPrismaDraftStore(prisma);
  try {
    const res = await startDraft(store, draft.id, new Date());
    if (res.started) {
      console.log(
        "Draft STARTED — pick 1 is on the clock (pick_deadline_at = now + draft_pick_seconds).",
      );
      console.log("The worker draft ticker now enforces the deadline (autopick on expiry).");
    } else {
      console.log("Draft was not pending (already started or complete) — no change.");
    }
  } catch (err) {
    if (err instanceof DraftNotReadyError) {
      console.error(`Cannot start: ${err.message}. (Did you provision managers with draft slots?)`);
      process.exit(1);
    }
    throw err;
  }
}

async function bind(): Promise<void> {
  const config = loadConfig();
  const league = await findLeague();
  if (!league) {
    console.error("No league — run `provision provision` first.");
    process.exit(1);
  }
  let bound = 0;
  for (const m of config.managers) {
    const email = normalizeEmail(m.email);
    const user = await prisma.appUser.findUnique({ where: { email } });
    if (!user) {
      console.log(`  pending: ${email} hasn't signed in yet`);
      continue;
    }
    await prisma.manager.update({
      where: { leagueId_draftSlot: { leagueId: league.id, draftSlot: m.draftSlot } },
      data: { userId: user.id },
    });
    await prisma.allowlistEmail.update({
      where: { leagueId_email: { leagueId: league.id, email } },
      data: { claimedByUserId: user.id, claimedAt: new Date() },
    });
    bound += 1;
    console.log(`  bound: ${email} → manager slot ${m.draftSlot}`);
  }
  console.log(`bind: ${bound}/${config.managers.length} managers linked.`);
}

async function rank(): Promise<void> {
  const path = process.argv[3] ?? process.env.PROVISION_RANKING;
  if (!path) {
    console.error(
      "Usage: provision rank <ranking.json>  (a best-first JSON array of balldontlie player ids)",
    );
    process.exit(1);
  }
  const ids = JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as number[];
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "number")) {
    console.error(
      "Ranking file must be a JSON array of balldontlie player ids (numbers), best-first.",
    );
    process.exit(1);
  }
  const updates = buildDefaultRankUpdates(ids);
  let ranked = 0;
  for (const u of updates) {
    const res = await prisma.player.updateMany({
      where: { balldontlieId: u.key },
      data: { defaultRank: u.defaultRank },
    });
    ranked += res.count;
  }
  console.log(`rank: set default_rank on ${ranked}/${ids.length} players (unmatched ids skipped).`);
}

async function status(): Promise<void> {
  const league = await findLeague();
  if (!league) {
    console.log("No league provisioned yet.");
    return;
  }
  const [managers, bound, periods, allowlist, ranked, players] = await Promise.all([
    prisma.manager.count({ where: { leagueId: league.id } }),
    prisma.manager.count({ where: { leagueId: league.id, userId: { not: null } } }),
    prisma.period.count({ where: { leagueId: league.id } }),
    prisma.allowlistEmail.count({ where: { leagueId: league.id } }),
    prisma.player.count({ where: { defaultRank: { not: null } } }),
    prisma.player.count(),
  ]);
  console.log(
    `League: ${league.name} (status=${league.status}, draftPickSeconds=${league.draftPickSeconds})`,
  );
  console.log(
    `Managers: ${managers} (${bound} bound to a signed-in user, ${managers - bound} pending)`,
  );
  console.log(`Periods: ${periods}   Allowlist: ${allowlist}`);
  console.log(`Players ranked: ${ranked}/${players} (default_rank populated)`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "provision":
      await provision();
      break;
    case "bind":
      await bind();
      break;
    case "rank":
      await rank();
      break;
    case "draft":
      await startDraftCmd();
      break;
    case "status":
      await status();
      break;
    default:
      console.error("Usage: provision <provision|bind|rank|draft|status>");
      process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
