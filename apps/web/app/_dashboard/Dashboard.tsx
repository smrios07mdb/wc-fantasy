/**
 * Dashboard home — the phase-aware hub replacing the Prompt-16 nav-card section in page.tsx.
 * Ported from `design_reference/Dashboard.html` + `dashboard/{components,desktop}.jsx`.
 *
 * Architecture:
 *   - Pure SERVER component — no "use client". All data comes from `DashboardData` (loadDashboard).
 *   - `modulesFor(phase)` → `renderModule(key, data)` mirrors the design's desktop.jsx exactly.
 *   - `PrimaryBanner` (in ./PrimaryBanner.tsx) handles the phase-coloured headline strip.
 *   - Module components are defined below — small enough to live inline; each maps to one
 *     key in `modulesFor`. Only pre-draft + draft modules are built this prompt; group/playoff/
 *     complete return null (their data doesn't exist yet — see STOP seams below).
 *
 * STOP seams (data not available in production this prompt):
 *   1. No scheduledStartAt on draft — pre-draft countdown renders as "waiting for commissioner".
 *      (flagged in PrimaryBanner.tsx)
 *   2. No per-manager "ready" flag — ReadinessModule renders all dots off (presence-only in the
 *      draft room via Realtime; server-side there is no readiness concept).
 *      (flagged in ReadinessModule below)
 */
import type { Position } from "@app/shared";
import { SQUAD_COMPOSITION } from "@app/shared";
import { toIso2 } from "../../src/draft/flag";
import { Flag } from "../draft/Flag";
import type { DraftRoomState } from "../../src/draft/types";
import type { DashboardPhase } from "../../src/dashboard/selectDashboardPhase";
import type { DashboardData } from "./loadDashboard";
import { PrimaryBanner } from "./PrimaryBanner";
import "./dashboard.css";

// ─── shared atoms ─────────────────────────────────────────────────────────────────────────

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Lightweight server-side avatar: initials + deterministic hue, same algorithm as draft Avatar. */
function MgrAvatar({
  id,
  displayName,
  size = "sm",
}: {
  id: string;
  displayName: string;
  size?: "sm" | "md";
}) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const parts = displayName.trim().split(/\s+/);
  const ints =
    parts.length >= 2 && parts[0] && parts[1]
      ? (parts[0][0]! + parts[1][0]!).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: `hsl(${h} 42% 46%)` }}
      aria-hidden="true"
    >
      {ints}
    </span>
  );
}

function PosBadge({ pos }: { pos: Position }) {
  return <span className={`pos pos-${pos}`}>{pos}</span>;
}

/** Generic module shell — mirrors the design's `Module` component. */
function Module({
  title,
  cta,
  children,
}: {
  title: string;
  cta?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section className="db-mod">
      <header className="db-mod-head">
        <span className="db-mod-title t-label">{title}</span>
        {cta && (
          <a className="db-mod-cta" href={cta.href}>
            {cta.label}
            <ArrowIcon />
          </a>
        )}
      </header>
      <div className="db-mod-body">{children}</div>
    </section>
  );
}

// ─── pre-draft modules ────────────────────────────────────────────────────────────────────

/** League format info — managers, rounds, clock, squad shape. */
function LeagueInfoModule({ draft }: { draft: DraftRoomState | null }) {
  const N = draft?.managers.length ?? 0;
  const perPick = draft?.draftPickSeconds ?? 60;
  const rounds = 15;
  return (
    <Module title="League & format" cta={{ label: "Draft room", href: "/draft" }}>
      <div className="db-info">
        <div className="db-info-row">
          <span className="text-tertiary">Managers</span>
          <b>{N}</b>
        </div>
        <div className="db-info-row">
          <span className="text-tertiary">Draft</span>
          <b>
            Snake · {rounds} rounds · {N * rounds} picks
          </b>
        </div>
        <div className="db-info-row">
          <span className="text-tertiary">Clock</span>
          <b>{perPick}s per pick · server-synced</b>
        </div>
        <div className="db-info-row">
          <span className="text-tertiary">Squad</span>
          <b>2 GK / 5 DEF / 5 MID / 3 FWD</b>
        </div>
        <div className="db-info-row">
          <span className="text-tertiary">Scoring</span>
          <b>All-play-all power record</b>
        </div>
      </div>
    </Module>
  );
}

/**
 * Manager readiness grid.
 *
 * STOP(P37): No per-manager "ready" flag exists on the draft or manager table.
 * The design's `PREDRAFT.ready` count + per-manager `isReady` state comes from Realtime
 * presence in the draft room — there is no server-side readiness concept. All dots render
 * off (gray). The note below explains this to the user honestly.
 * If a ready flag is added later, wire it here: file apps/web/app/_dashboard/Dashboard.tsx.
 */
function ReadinessModule({ draft }: { draft: DraftRoomState | null }) {
  const managers = draft?.managers ?? [];
  const N = managers.length;
  return (
    <Module title={`Managers · ${N} total`}>
      <div className="db-ready">
        {managers.map((m) => (
          <div className="db-ready-chip" key={m.id}>
            <MgrAvatar id={m.id} displayName={m.displayName} size="sm" />
            <span className="db-ready-name">{m.isMe ? "You" : m.displayName}</span>
            {/* STOP(P37): dot stays off — no server-side readiness concept. */}
            <span className="db-ready-dot" aria-hidden="true" />
          </div>
        ))}
      </div>
      <p className="db-ready-note">Live status visible in the draft room.</p>
    </Module>
  );
}

// ─── draft modules ────────────────────────────────────────────────────────────────────────

/** Squad forming — position counts vs requirement (2/5/5/3). */
function DraftFormingModule({ draft }: { draft: DraftRoomState }) {
  const sessionId = draft.sessionManagerId;
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pick of draft.picks) {
    if (pick.managerId === sessionId && pick.player) {
      const pos = pick.player.position;
      counts[pos] = (counts[pos] ?? 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

  return (
    <Module title="Your squad forming" cta={{ label: "Draft room", href: "/draft" }}>
      <div className="db-forming">
        {POSITIONS.map((pos) => (
          <div className="db-forming-cell" key={pos}>
            <PosBadge pos={pos} />
            <span className="mono">
              <b>{counts[pos] ?? 0}</b>
              <span className="text-tertiary">/{SQUAD_COMPOSITION[pos]}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="db-forming-note">
        {total} of 15 drafted · need {SQUAD_COMPOSITION.GK} GK / {SQUAD_COMPOSITION.DEF} DEF /{" "}
        {SQUAD_COMPOSITION.MID} MID / {SQUAD_COMPOSITION.FWD} FWD
      </p>
    </Module>
  );
}

/** Recent picks — last N picks across all managers. */
function RecentPicksModule({ draft }: { draft: DraftRoomState }) {
  // Show the 6 most recent picks (reverse pick order = highest pickNo first).
  const recent = [...draft.picks]
    .filter((p) => p.player !== null)
    .sort((a, b) => b.pickNo - a.pickNo)
    .slice(0, 6);

  const managerById = new Map(draft.managers.map((m) => [m.id, m]));

  if (recent.length === 0) {
    return (
      <Module title="Recent picks">
        <p className="t-caption text-secondary" style={{ padding: "8px 0" }}>
          No picks made yet.
        </p>
      </Module>
    );
  }

  return (
    <Module title="Recent picks">
      <div className="db-picks">
        {recent.map((p) => {
          const mgr = managerById.get(p.managerId);
          const isMe = p.managerId === draft.sessionManagerId;
          const player = p.player!;
          return (
            <div className={"db-pick-row" + (isMe ? " is-me" : "")} key={p.pickNo}>
              <span className="db-pick-no mono">#{p.pickNo}</span>
              <Flag code={toIso2(player.country)} label={player.country ?? undefined} />
              <PosBadge pos={player.position} />
              <span className="db-pick-player">{player.displayName}</span>
              <span className="db-pick-by">{isMe ? "You" : (mgr?.displayName ?? "—")}</span>
            </div>
          );
        })}
      </div>
    </Module>
  );
}

// ─── module router ────────────────────────────────────────────────────────────────────────

type ModuleKey = "info" | "ready" | "forming" | "picks";

/** Which modules render for each phase — mirrors design's `modulesFor()`. */
function modulesFor(phase: DashboardPhase): ModuleKey[] {
  switch (phase) {
    case "pre-draft":
      return ["info", "ready"];
    case "draft":
      return ["forming", "picks", "ready"];
    case "post-draft":
      // Group/playoff/complete modules are the next prompts.
      return [];
  }
}

function renderModule(key: ModuleKey, draft: DraftRoomState | null) {
  switch (key) {
    case "info":
      return <LeagueInfoModule key={key} draft={draft} />;
    case "ready":
      return <ReadinessModule key={key} draft={draft} />;
    case "forming":
      return draft ? <DraftFormingModule key={key} draft={draft} /> : null;
    case "picks":
      return draft ? <RecentPicksModule key={key} draft={draft} /> : null;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

// ─── main export ─────────────────────────────────────────────────────────────────────────

export function Dashboard({ data }: { data: DashboardData }) {
  const { phase, draft } = data;
  const keys = modulesFor(phase);

  return (
    <div className="db-page">
      <PrimaryBanner phase={phase} draft={draft} />

      {phase === "post-draft" && (
        // STOP: group/playoff/complete module sets are the next prompts.
        // For now, show a minimal "tournament underway" interim state.
        <div className="db-interim">
          <p className="t-body text-secondary">
            Group stage dashboard modules are coming in the next prompt.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn btn-ghost" href="/lineup">
              Set lineup
            </a>
            <a className="btn btn-ghost" href="/vsfield">
              Vs the field
            </a>
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <div className="db-grid">
          {keys.map((k) => {
            const mod = renderModule(k, draft);
            return mod ? (
              <div className="db-grid-cell" key={k}>
                {mod}
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
