import { LEAGUE_SEED_DEFAULTS } from "@app/shared";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">WC Fantasy</h1>
      <p className="text-slate-600">
        Private World Cup fantasy league. Foundation is up — scaffold + database schema. Features
        land in later prompts.
      </p>
      <ul className="list-disc pl-6 text-sm text-slate-600">
        <li>
          Health check:{" "}
          <a className="text-blue-600 underline" href="/api/health">
            /api/health
          </a>
        </li>
        <li>
          DB connectivity:{" "}
          <a className="text-blue-600 underline" href="/api/db-check">
            /api/db-check
          </a>
        </li>
      </ul>
      <p className="text-xs text-slate-400">
        Seed defaults (a real league reads its own row): season {LEAGUE_SEED_DEFAULTS.seasonYear} ·
        FAAB ${LEAGUE_SEED_DEFAULTS.faabBudget} · freeze {LEAGUE_SEED_DEFAULTS.resultFreezeHours}h
      </p>
    </main>
  );
}
