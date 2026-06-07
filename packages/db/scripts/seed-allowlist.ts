/**
 * Seed the email allowlist (Prompt 14) — a one-off, RE-RUNNABLE operational script.
 *
 * Writes ONLY the `allowlist_email` table so the league's members can pass the magic-link gate
 * (ARCHITECTURE §6 "private by allowlist" + the Prompt-07 `/auth/callback`, which signs out + denies
 * any authenticated email without an allowlist row). This is NOT the manager provisioning ceremony
 * (that lives in apps/worker's provision CLI and is a separate, still-unpinned decision) — this
 * script never touches `manager`.
 *
 * "Boring and reliable": plain @app/db Prisma, one idempotent upsert per email, NO Supabase
 * admin/service-role client and no RLS surface (Prisma connects as the DB role directly). A re-run
 * is a clean no-op — `update: {}` never clobbers an already-claimed row's `claimedByUserId` /
 * `claimedAt`. Lives outside the package's `src` surface, so no runtime/app path imports it.
 *
 * Run (the DB URL comes from the env / repo-root .env, never this file):
 *   pnpm --filter @app/db seed:allowlist
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { prisma } from "@app/db";
import { normalizeEmail } from "@app/auth";

// Load repo-root .env for local runs; a no-op when the env is already provided (e.g. on Render).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

/**
 * The league allowlist — the committed, reviewable source of truth (one email per line). Stored
 * normalized via the gate's own `normalizeEmail` (below), so the persisted form always matches gate
 * semantics. To add or remove a member, edit this list and re-run; re-running is idempotent.
 */
const ALLOWLIST_EMAILS = [
  // League members
  "yader.rosales@gmail.com",
  "sebastian.talavera5@gmail.com",
  "armando.zepeda.az@gmail.com",
  "cvarga33@gmail.com",
  "lacayo.ocampo@gmail.com",
  "afcg0207@gmail.com",
  "lrtm1990@gmail.com",
  "rodrigotelleria@gmail.com",
  // Commissioner — the gate has no bypass, so an un-allowlisted commissioner cannot sign in.
  "smrios07@gmail.com",
];

async function main(): Promise<void> {
  // Single private league (ARCHITECTURE §4). Refuse to guess if zero or many leagues exist.
  const leagueCount = await prisma.league.count();
  if (leagueCount !== 1) {
    throw new Error(
      leagueCount === 0
        ? "No league found — provision the league before seeding the allowlist."
        : `Expected exactly one league (single-league assumption, ARCHITECTURE §4) but found ${leagueCount}. Refusing to guess which one to seed.`,
    );
  }
  const league = await prisma.league.findFirstOrThrow();

  // Normalize through the gate's own normalizer (single source of truth) and de-dupe so the summary
  // counts each distinct address once.
  const emails = [...new Set(ALLOWLIST_EMAILS.map(normalizeEmail))];

  let created = 0;
  let present = 0;
  for (const email of emails) {
    const existing = await prisma.allowlistEmail.findUnique({
      where: { leagueId_email: { leagueId: league.id, email } },
      select: { id: true },
    });
    await prisma.allowlistEmail.upsert({
      where: { leagueId_email: { leagueId: league.id, email } },
      create: { leagueId: league.id, email },
      // Deliberate no-op: a re-run must NEVER clobber claimedByUserId / claimedAt on a claimed row.
      update: {},
    });
    if (existing) {
      present += 1;
      console.log(`  already present: ${email}`);
    } else {
      created += 1;
      console.log(`  created:         ${email}`);
    }
  }

  console.log(
    `\n${emails.length} emails — ${created} newly added, ${present} already present` +
      ` (league "${league.name}").`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
