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

  it("uses status + round fields only — no kickoffAt for phase detection", () => {
    expect(tournamentSelector).toContain("status");
    expect(tournamentSelector).toContain("round");
    // Phase logic reads status/round; kickoffAt is NOT used in selectTournamentPhase.
    expect(tournamentSelector).not.toContain("kickoffAt");
  });

  it("distinguishes knockout matches by round !== null (not stage or periodId)", () => {
    expect(tournamentSelector).toContain("round !== null");
  });

  it("never returns complete for an in_progress Final (only completed)", () => {
    expect(tournamentSelector).toContain('round === "Final"');
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

  it("only loads vsField when phase is 'group' (not for other tournament phases)", () => {
    expect(loader38).toContain('phase === "group"');
    expect(loader38).toContain("loadVsField(sessionManagerId)");
  });

  it("queries fifa_match for tournament phase + earliest kickoff — minimal select", () => {
    expect(loader38).toContain("prisma.fifaMatch.findMany");
    expect(loader38).toContain("status: true");
    expect(loader38).toContain("round: true");
    expect(loader38).toContain("kickoffAt: true");
  });

  it("STOP(P38) seams documented for playoff and complete interims", () => {
    expect(loader38).toContain("STOP(P38)");
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

  it("playoff and complete phases return empty module lists (minimal interim only)", () => {
    expect(dashboard).toContain('case "playoff"');
    expect(dashboard).toContain('case "complete"');
    // STOP seam comments present
    expect(dashboard).toContain("STOP(P38)");
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

  it("playoff + complete banners have STOP(P38) seams documented", () => {
    expect(banner).toContain("STOP(P38)");
  });

  it("PrimaryBanner signature accepts vsField + earliestGroupKickoff props", () => {
    expect(banner).toContain("vsField:");
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
