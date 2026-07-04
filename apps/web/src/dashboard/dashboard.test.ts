import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the Prompt-37 dashboard foundation + pre-draft + draft phases.
// The repo's Vitest run has no DOM/JSX transform (by design — see draftRoom.test.ts + the landing/
// shell smokes), so we verify the dashboard's load-bearing CONTRACTS from source rather than mounting.
// Component compilation is covered by `tsc --noEmit` + `next build`. The behaviours the dashboard must
// preserve are unit-tested at the right altitude — selectDashboardPhase.test.ts (pure phase selector).

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app");
const srcDir = here;
const readApp = (rel: string) => readFileSync(resolve(appDir, rel), "utf8");
const readSrc = (rel: string) => readFileSync(resolve(srcDir, rel), "utf8");

const page = readApp("page.tsx");
const dashboard = readApp("_dashboard/Dashboard.tsx");
const loader = readApp("_dashboard/loadDashboard.ts");
const banner = readApp("_dashboard/PrimaryBanner.tsx");
const css = readApp("_dashboard/dashboard.css");
const phaseSelector = readSrc("selectDashboardPhase.ts");

describe("dashboard — page.tsx hub branch renders Dashboard (non-hub states byte-for-byte)", () => {
  it("hub branch renders <Dashboard with loadDashboard data", () => {
    expect(page).toContain("<Dashboard data={data} />");
    expect(page).toContain("await loadDashboard(managerId)");
  });

  it("Hub is now async (calls await loadDashboard)", () => {
    expect(page).toContain("async function Hub(");
  });

  it("hub narrowing still uses selectLandingView + outcome.kind === 'ok' guard", () => {
    expect(page).toContain("selectLandingView(outcome)");
    expect(page).toContain('view === "hub" && outcome.kind === "ok"');
  });

  it("non-hub renders (Unlinked, Denied, SignIn) are byte-for-byte unchanged", () => {
    expect(page).toContain('if (view === "unlinked") return <Unlinked />');
    expect(page).toContain('if (view === "denied") return <Denied />');
    expect(page).toContain("return <SignIn />");
    expect(page).toContain("function SignIn()");
    expect(page).toContain("function Unlinked()");
    expect(page).toContain("function Denied()");
  });

  it("/ stays force-dynamic (ƒ — server-authoritative, never statically cached)", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("AppShell wrapping + active='home' are preserved on the hub branch", () => {
    expect(page).toContain('<AppShell active="home"');
    expect(page).toContain("signedInAs={displayName}");
  });
});

describe("dashboard — loadDashboard reuses loadDraftRoom (no second draft source)", () => {
  it("imports and calls loadDraftRoom directly (no re-derivation)", () => {
    expect(loader).toContain('from "../draft/loadDraftRoom"');
    expect(loader).toContain("await loadDraftRoom(sessionManagerId)");
  });

  it("imports selectDashboardPhase to resolve the phase", () => {
    expect(loader).toContain("selectDashboardPhase");
    expect(loader).toContain('from "../../src/dashboard/selectDashboardPhase"');
  });

  it("returns DashboardData with phase + draft fields", () => {
    expect(loader).toContain("DashboardData");
    expect(loader).toContain("phase:");
    expect(loader).toContain("draft:");
  });

  it("handles null draft (no draft row yet) by returning pre-draft", () => {
    expect(loader).toContain('"pre-draft"');
    expect(loader).toContain("if (!draft)");
  });
});

describe("dashboard — phase selector has never guard + all phases covered", () => {
  it("exhaustiveness guard via 'never' prevents silent fall-through on new DraftStatus", () => {
    expect(phaseSelector).toContain("const _exhaustive: never = status");
    expect(phaseSelector).toContain("return _exhaustive");
  });

  it("maps all three phase outcomes: pre-draft, draft, post-draft", () => {
    expect(phaseSelector).toContain('"pre-draft"');
    expect(phaseSelector).toContain('"draft"');
    expect(phaseSelector).toContain('"post-draft"');
  });

  it("paused draft maps to draft phase (paused is still a live draft)", () => {
    expect(phaseSelector).toContain('case "paused"');
  });
});

describe("dashboard — CSS is fully tokenised, no literal hex", () => {
  it("dashboard.css contains no literal hex values (gold-free per BRAND §1/§5)", () => {
    // color-mix() and var() are fine — only raw hex is disallowed.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?:[^0-9a-fA-F]|$)/m);
  });

  it("dashboard.css uses --phc custom property for phase colour", () => {
    expect(css).toContain("var(--phc)");
  });

  it("dashboard.css uses ds.css tokens (--surface-*, --accent, --live, --info)", () => {
    expect(css).toContain("var(--surface-1)");
    expect(css).toContain("var(--accent)");
    expect(css).toContain("var(--hairline)");
  });
});

describe("dashboard — pre-draft + draft phase modules are built", () => {
  it("modulesFor pre-draft returns info + ready module keys", () => {
    expect(dashboard).toContain('"info"');
    expect(dashboard).toContain('"ready"');
    expect(dashboard).toContain('case "pre-draft"');
  });

  it("modulesFor draft returns forming + picks + ready module keys", () => {
    expect(dashboard).toContain('"forming"');
    expect(dashboard).toContain('"picks"');
    expect(dashboard).toContain('case "draft"');
  });

  it("LeagueInfoModule renders the league format (managers, rounds, clock, squad)", () => {
    expect(dashboard).toContain("LeagueInfoModule");
    expect(dashboard).toContain("League & format");
    expect(dashboard).toContain("2 GK / 5 DEF / 5 MID / 3 FWD");
  });

  it("ReadinessModule has STOP seam documented — no server-side ready flag", () => {
    expect(dashboard).toContain("STOP(P37)");
    expect(dashboard).toContain("no server-side readiness concept");
  });

  it("DraftFormingModule reads from draft.picks + sessionManagerId (no re-derivation)", () => {
    expect(dashboard).toContain("draft.picks");
    expect(dashboard).toContain("draft.sessionManagerId");
    expect(dashboard).toContain("SQUAD_COMPOSITION");
  });

  it("RecentPicksModule sorts picks by pickNo descending for recency", () => {
    expect(dashboard).toContain("sort((a, b) => b.pickNo - a.pickNo)");
  });
});

describe("dashboard — PrimaryBanner uses --phc (not hardcoded colour)", () => {
  it("sets --phc as inline CSS variable on the banner container", () => {
    expect(banner).toContain('"--phc": phcColor');
    expect(banner).toContain("--phc");
  });

  it("PHASE_COLOR maps phases to functional CSS tokens (no hex)", () => {
    expect(banner).toContain("var(--info)");
    expect(banner).toContain("var(--live)");
  });

  it("pre-draft countdown STOP seam is documented in the banner source", () => {
    expect(banner).toContain("STOP(P37)");
    expect(banner).toContain("No scheduledStartAt");
  });
});

describe("dashboard — no regression on existing landing/shell/draft/lineup/vsfield", () => {
  it("page.tsx still imports selectLandingView (the existing pure selector)", () => {
    expect(page).toContain("selectLandingView");
    expect(page).toContain("@/src/landing/selectLandingView");
  });

  it("page.tsx still imports AppShell (the global shell wrapping the hub)", () => {
    expect(page).toContain("AppShell");
    expect(page).toContain("./shell/AppShell");
  });

  it("page.tsx still imports getSessionManager (the thin IO edge)", () => {
    expect(page).toContain("getSessionManager");
    expect(page).toContain("@/lib/auth/manager");
  });
});

// ─── P38: tournament phase extension ────────────────────────────────────────────────────────

const tournamentSelector = readSrc("selectTournamentPhase.ts");
const loader38 = readApp("_dashboard/loadDashboard.ts");

describe("dashboard — P38 DashboardPhase widened to include tournament phases", () => {
  it("DashboardPhase now includes pre-kickoff, group, playoff, complete", () => {
    expect(phaseSelector).toContain('"pre-kickoff"');
    expect(phaseSelector).toContain('"group"');
    expect(phaseSelector).toContain('"playoff"');
    expect(phaseSelector).toContain('"complete"');
  });

  it("post-draft is still present as a loader-internal intermediate (not a render phase)", () => {
    expect(phaseSelector).toContain('"post-draft"');
  });
});

describe("dashboard — selectTournamentPhase is pure, exhaustive, with never guard", () => {
  it("returns TournamentPhase from match summaries (pre-kickoff | group | playoff | complete)", () => {
    expect(tournamentSelector).toContain('"pre-kickoff"');
    expect(tournamentSelector).toContain('"group"');
    expect(tournamentSelector).toContain('"playoff"');
    expect(tournamentSelector).toContain('"complete"');
  });

  it("uses status + period.kind/label fields only — no kickoffAt for phase detection", () => {
    expect(tournamentSelector).toContain("status");
    expect(tournamentSelector).toContain("periodKind");
    expect(tournamentSelector).toContain("periodLabel");
    // Phase logic reads status + period.kind/label; kickoffAt is NOT used in selectTournamentPhase.
    expect(tournamentSelector).not.toContain("kickoffAt");
  });

  it("distinguishes knockout matches by period.kind (not round / stage / periodId)", () => {
    expect(tournamentSelector).toContain('periodKind === "knockout_round"');
    // Prompt 44: the retired round-based discriminator is gone — the selector never reads m.round
    // (the live feed labels group games with the matchday number, so round !== null mis-fires).
    expect(tournamentSelector).not.toContain("m.round");
  });

  it("never returns complete for an in_progress Final (only completed)", () => {
    expect(tournamentSelector).toContain('periodLabel === "Final"');
    expect(tournamentSelector).toContain('status === "completed"');
  });
});

describe("dashboard — loadDashboard P38 composition + vsField population", () => {
  it("imports selectTournamentPhase for the post-draft refinement", () => {
    expect(loader38).toContain("selectTournamentPhase");
    expect(loader38).toContain('from "../../src/dashboard/selectTournamentPhase"');
  });

  it("imports loadVsField for the group phase module data (READ-ONLY)", () => {
    expect(loader38).toContain("loadVsField");
    expect(loader38).toContain('from "../vsfield/loadVsField"');
  });

  it("DashboardData now has vsField + earliestGroupKickoff fields", () => {
    expect(loader38).toContain("vsField:");
    expect(loader38).toContain("earliestGroupKickoff:");
  });

  it("only loads vsField when the tournament phase is 'group' (not for other phases)", () => {
    // The loader names the raw selectTournamentPhase result `tournamentPhase`; the final render phase
    // is `resolveKnockoutPhase(tournamentPhase, …)` in the knockout branch.
    expect(loader38).toContain('tournamentPhase === "group"');
    expect(loader38).toContain("loadVsField(sessionManagerId)");
  });

  it("queries fifa_match for tournament phase + earliest kickoff — minimal select", () => {
    expect(loader38).toContain("prisma.fifaMatch.findMany");
    expect(loader38).toContain("status: true");
    expect(loader38).toContain("period: { select: { kind: true, label: true } }");
    expect(loader38).toContain("kickoffAt: true");
  });

  it("knockout window attaches playoffs READ-ONLY via loadPlayoffs + resolveKnockoutPhase", () => {
    expect(loader38).toContain("loadPlayoffs");
    expect(loader38).toContain('from "../playoffs/loadPlayoffs"');
    expect(loader38).toContain("resolveKnockoutPhase");
    // PlayoffsView.complete is the authoritative playoff↔complete discriminator (not the Final-FT signal).
    expect(loader38).toContain("playoffs?.complete");
    // DashboardData carries the playoff view, mirroring the vsField attach (group-only stays group-only).
    expect(loader38).toContain("playoffs:");
  });
});

describe("dashboard — group phase modules are built (P38)", () => {
  it("RecordModule renders season W-L record + rank (db-record CSS class)", () => {
    expect(dashboard).toContain("RecordModule");
    expect(dashboard).toContain("db-record");
    expect(dashboard).toContain("allPlayAllW");
    expect(dashboard).toContain("totalPoints");
  });

  it("StandingsModule renders season standings table (db-stand CSS class)", () => {
    expect(dashboard).toContain("StandingsModule");
    expect(dashboard).toContain("db-stand");
    expect(dashboard).toContain("db-stand-row");
  });

  it("MatchdayModule renders current-period fixtures + my XI lock status (db-match-list)", () => {
    expect(dashboard).toContain("MatchdayModule");
    expect(dashboard).toContain("db-match-list");
    expect(dashboard).toContain("db-md-lock");
    expect(dashboard).toContain("lockedCount");
  });

  it("each match row links to the real-match detail view (T5)", () => {
    // The MatchRow is now an <a> to /games/<matchId> (matchId is a real fifa_match id).
    // T15-CUT rider F-P3-A4: the link carries ?from=home so the match page lights the Dashboard tab.
    expect(dashboard).toContain("href={`/games/${match.matchId}?from=home`}");
  });

  it("modulesFor 'group' returns record + standings + matchday", () => {
    expect(dashboard).toContain('case "group"');
    expect(dashboard).toContain('"record"');
    expect(dashboard).toContain('"standings"');
    expect(dashboard).toContain('"matchday"');
  });

  it("group phase uses the spotlight layout (db-spotlight: wide standings + rail)", () => {
    expect(dashboard).toContain("db-spotlight");
    expect(dashboard).toContain("db-spot-main");
    expect(dashboard).toContain("db-spot-rail");
  });

  it("modulesFor 'playoff' returns the survival bracket + reinforce reminder", () => {
    expect(dashboard).toContain('case "playoff"');
    expect(dashboard).toContain('"survival"');
    expect(dashboard).toContain('"reinforce"');
  });

  it("modulesFor 'complete' returns the champion podium + the viewer's run", () => {
    expect(dashboard).toContain('case "complete"');
    expect(dashboard).toContain('"champion"');
    expect(dashboard).toContain('"finish"');
  });
});

describe("dashboard — PrimaryBanner extended for tournament phases (P38)", () => {
  it("PHASE_COLOR covers all 6 DashboardPhase values", () => {
    expect(banner).toContain('"pre-kickoff"');
    expect(banner).toContain('"group"');
    expect(banner).toContain('"playoff"');
    expect(banner).toContain('"complete"');
  });

  it("PHASE_EYEBROW covers all 6 DashboardPhase values", () => {
    // Eyebrow labels for new phases
    expect(banner).toContain("Group stage");
    expect(banner).toContain("Knockouts");
    expect(banner).toContain("Tournament complete");
  });

  it("pre-kickoff banner renders the real kickoff datetime (earliestGroupKickoff prop)", () => {
    expect(banner).toContain("earliestGroupKickoff");
    expect(banner).toContain("formatKickoffDate");
  });

  it("group banner uses vsField season data for rank + record", () => {
    expect(banner).toContain("vsField?.season");
    expect(banner).toContain("allPlayAllW");
  });

  it("playoff + complete banners render real PlayoffsView data (no STOP interim)", () => {
    expect(banner).toContain("selectSurvivalView");
    expect(banner).toContain("selectChampionPodium");
    expect(banner).toContain("selectViewerFinish");
    expect(banner).not.toContain("STOP(P38)");
  });

  it("complete-arm banner surfaces the viewer's season recap (total pts + power record + best week)", () => {
    expect(banner).toContain("totalTitlePoints");
    expect(banner).toContain("total pts");
    expect(banner).toContain("Power record");
    expect(banner).toContain("Best week");
  });

  it("PrimaryBanner signature accepts vsField + playoffs + earliestGroupKickoff props", () => {
    expect(banner).toContain("vsField:");
    expect(banner).toContain("playoffs:");
    expect(banner).toContain("earliestGroupKickoff:");
  });
});

describe("dashboard — CSS is fully tokenised (P38 additions)", () => {
  it("dashboard.css has no literal hex values after P38 additions", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?:[^0-9a-fA-F]|$)/m);
  });

  it("new group module CSS rules are present (matchday + record utilities)", () => {
    expect(css).toContain("db-match-row");
    expect(css).toContain("db-match-list");
    expect(css).toContain("db-md-lock");
    expect(css).toContain("db-empty-note");
  });
});

// ─── this prompt: dashboard playoff + complete arms (PlayoffsView, READ-ONLY) ────────────────

const resolver = readSrc("resolveKnockoutPhase.ts");
const playoffModules = readSrc("playoffModules.ts");

describe("dashboard — playoff arm modules (survival + reinforce, from PlayoffsView)", () => {
  it("SurvivalModule reuses the pre-stubbed bracket CSS (.db-bracket / .db-br-*)", () => {
    expect(dashboard).toContain("SurvivalModule");
    expect(dashboard).toContain("selectSurvivalView");
    expect(dashboard).toContain("db-bracket");
    expect(dashboard).toContain("db-br-row");
  });

  it("SurvivalModule links into the /playoffs theater (one live surface, not two)", () => {
    expect(dashboard).toContain('href: "/playoffs"');
  });

  it("ReinforceModule is the FAAB-reset reminder sourced from reinforcement → /waivers", () => {
    expect(dashboard).toContain("ReinforceModule");
    expect(dashboard).toContain("reinforcement");
    expect(dashboard).toContain('href: "/waivers"');
    expect(dashboard).toContain("db-reinforce");
  });
});

describe("dashboard — complete arm modules (champion + season recap, from PlayoffsView.seasonStats)", () => {
  it("ChampionModule reuses the pre-stubbed podium CSS + shows each finisher's total title points", () => {
    expect(dashboard).toContain("ChampionModule");
    expect(dashboard).toContain("selectChampionPodium");
    expect(dashboard).toContain("db-podium");
    expect(dashboard).toContain("db-pod-row");
    // Total title points on each podium row (reuses the pre-stubbed .db-pod-pts) — no role pill.
    expect(dashboard).toContain("db-pod-pts");
    expect(dashboard).toContain("totalTitlePoints");
  });

  it("MyFinishModule renders the season recap — finish · power record · total pts · best week (db-myrecap)", () => {
    expect(dashboard).toContain("MyFinishModule");
    expect(dashboard).toContain("selectViewerFinish");
    expect(dashboard).toContain("db-myrecap");
    expect(dashboard).toContain("power record");
    expect(dashboard).toContain("total pts");
    expect(dashboard).toContain("best week");
  });

  it("the complete-arm season-stats recap gap is CLOSED — no TODO(confirm); stats from PlayoffsView.seasonStats", () => {
    // The recap site no longer flags a gap; the figures are derived in the pure read-model pass.
    expect(dashboard).not.toContain("TODO(confirm)");
    expect(playoffModules).toContain("seasonStats");
    expect(playoffModules).toContain("totalTitlePoints");
    expect(playoffModules).toContain("bestWeek");
  });
});

describe("dashboard — resolveKnockoutPhase is pure, PlayoffsView.complete authoritative", () => {
  it("resolves the knockout render phase from playoffsComplete (not the Final-FT signal)", () => {
    expect(resolver).toContain("export function resolveKnockoutPhase");
    expect(resolver).toContain("playoffsComplete");
  });

  it("non-knockout phases pass through (total over TournamentPhase)", () => {
    expect(resolver).toContain('tournamentPhase !== "playoff"');
    expect(resolver).toContain('tournamentPhase !== "complete"');
  });
});

describe("dashboard — playoffModules pure derivations stay read-model-faithful", () => {
  it("exports the three derivations the modules + banner consume", () => {
    expect(playoffModules).toContain("export function selectSurvivalView");
    expect(playoffModules).toContain("export function selectChampionPodium");
    expect(playoffModules).toContain("export function selectViewerFinish");
  });

  it("imports its types from @app/recompute and stays IO-free (no @app/db / prisma)", () => {
    expect(playoffModules).toContain('from "@app/recompute"');
    expect(playoffModules).not.toContain("@app/db");
    expect(playoffModules).not.toContain("prisma");
  });

  it("CSS: new reinforce + myrecap rules present; bracket + podium reused (still hex-free)", () => {
    expect(css).toContain("db-reinforce");
    expect(css).toContain("db-myrecap");
    expect(css).toContain("db-bracket");
    expect(css).toContain("db-podium");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?:[^0-9a-fA-F]|$)/m);
  });
});

// ─── this prompt: dashboard standings rows link to the manager's scores (dead-click fix) ─────

describe("dashboard — StandingsModule rows link to the manager's scores", () => {
  it("each standings row is a navigable <a> to /vsfield?manager=<id> (no longer an inert <div>)", () => {
    // The dead click is fixed: the former `<div className={"db-stand-row"...}>` is now an anchor
    // wired with a template-literal href to the live scores cockpit, keyed on the row's managerId.
    expect(dashboard).toContain("href={`/vsfield?manager=");
    expect(dashboard).toContain("db-stand-row");
    expect(dashboard).not.toContain('<div className={"db-stand-row"');
  });

  it("the row link carries the clicked manager's id (the per-manager scores key)", () => {
    // `?manager=<id>` is the exact key VsFieldClient's H2H selection (`effSel`) is keyed on, so the
    // cockpit can deep-link to that opponent's score sheet. The row still keys on e.managerId.
    expect(dashboard).toContain("/vsfield?manager=");
    expect(dashboard).toContain("key={e.managerId}");
  });

  it("the StandingsModule CTA target is unchanged (still /vsfield — no regression)", () => {
    expect(dashboard).toContain('cta={{ label: "Vs the field", href: "/vsfield" }}');
  });

  it("the row-link affordance CSS is present and hex-free", () => {
    expect(css).toContain(".db-stand-row:hover");
    expect(css).toContain("text-decoration: none");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?:[^0-9a-fA-F]|$)/m);
  });
});
