/**
 * Dashboard home — the phase-aware hub replacing the Prompt-16 nav-card section in page.tsx.
 * Ported from `design_reference/Dashboard.html` + `dashboard/{components,desktop}.jsx`.
 *
 * Architecture:
 *   - Pure SERVER component — no "use client". All data comes from `DashboardData` (loadDashboard).
 *   - `modulesFor(phase)` → `renderModule(key, data)` mirrors the design's desktop.jsx exactly.
 *   - `PrimaryBanner` (in ./PrimaryBanner.tsx) handles the phase-coloured headline strip.
 *   - Pre-draft + draft modules: built in Prompt 37.
 *   - Group modules: built in Prompt 38 — record, standings, matchday.
 *   - Playoff + complete: minimal honest interims (Guillotine + recap deferred to later prompts).
 *
 * STOP seams (data not available in production this prompt):
 *   1. No scheduledStartAt on draft — pre-draft countdown renders as "waiting for commissioner".
 *      (flagged in PrimaryBanner.tsx)
 *   2. No per-manager "ready" flag — ReadinessModule renders all dots off (presence-only in the
 *      draft room via Realtime; server-side there is no readiness concept).
 *      (flagged in ReadinessModule below)
 *   3. Playoff bracket / Guillotine — deferred; renders "Knockouts underway" interim only.
 *   4. Tournament-complete recap — deferred; renders "Tournament complete" interim only.
 */
import type { Position } from "@app/shared";
import { SQUAD_COMPOSITION } from "@app/shared";
import type { VsFieldView, FieldEntry, SeasonEntry, MatchView } from "@app/vsfield";
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

// ─── group phase modules ──────────────────────────────────────────────────────────────────

/**
 * My season record + provisional current-period W-L.
 * Data: view.season (my SeasonEntry) + view.field (my FieldEntry).
 * CSS: .db-record (pre-stubbed in dashboard.css).
 */
function RecordModule({ vsField }: { vsField: VsFieldView }) {
  const me: SeasonEntry | undefined = vsField.season.find((e) => e.isMe);
  const meField: FieldEntry | undefined = vsField.field.find((e) => e.isMe);

  if (!me) {
    return (
      <Module title="Your record" cta={{ label: "Vs the field", href: "/vsfield" }}>
        <p className="t-caption text-secondary db-empty-note">Record loading…</p>
      </Module>
    );
  }

  const prov = meField?.record;

  return (
    <Module title="Your record" cta={{ label: "Vs the field", href: "/vsfield" }}>
      <div className="db-record">
        <div className="db-rec-season">
          <div className="db-rec-wl">
            <span>{me.allPlayAllW}</span>
            <span className="db-rec-dash">-</span>
            <span>{me.allPlayAllL}</span>
          </div>
          <span className="t-micro text-tertiary">season W-L</span>
        </div>
        <div className="db-rec-split">
          <div className="db-rec-stat">
            <b>{me.totalPoints}</b>
            <span className="t-micro text-tertiary">total pts</span>
          </div>
          <div className="db-rec-stat">
            <b>#{me.rank}</b>
            <span className="t-micro text-tertiary">rank</span>
          </div>
        </div>
      </div>
      {prov && (
        <div className="db-rec-prov">
          <span className="t-caption text-secondary">
            {vsField.currentPeriod?.label ?? "This period"}
          </span>
          <span className="t-caption">
            <span className="wld-W db-wld-chip">{prov.w}W</span>{" "}
            <span className="wld-L db-wld-chip">{prov.l}L</span>{" "}
            {prov.d > 0 && <span className="wld-D db-wld-chip">{prov.d}D</span>}
          </span>
        </div>
      )}
    </Module>
  );
}

/**
 * Season standings table — all managers ranked by allPlayAllW + totalPoints.
 * Data: view.season (SeasonEntry[]).
 * CSS: .db-stand (pre-stubbed in dashboard.css).
 */
function StandingsModule({ vsField }: { vsField: VsFieldView }) {
  const entries = [...vsField.season].sort((a, b) => a.rank - b.rank);

  if (entries.length === 0) {
    return (
      <Module title="Standings" cta={{ label: "Vs the field", href: "/vsfield" }}>
        <p className="t-caption text-secondary db-empty-note">Standings loading…</p>
      </Module>
    );
  }

  return (
    <Module title="Standings" cta={{ label: "Vs the field", href: "/vsfield" }}>
      <div className="db-stand">
        {entries.map((e) => (
          <div className={"db-stand-row" + (e.isMe ? " is-me" : "")} key={e.managerId}>
            <span className="db-stand-rank mono">{e.rank}</span>
            <MgrAvatar id={e.managerId} displayName={e.displayName} size="sm" />
            <span className="db-stand-name">{e.isMe ? "You" : e.displayName}</span>
            <span className="db-stand-wl">
              {e.allPlayAllW}-{e.allPlayAllL}
            </span>
            <span className="db-stand-pts mono">{e.totalPoints}</span>
          </div>
        ))}
      </div>
    </Module>
  );
}

/**
 * Current matchday match results — fixtures for the current period with live statuses.
 * Also shows my squad's lock ratio (locked starters / total starters).
 * Data: view.matches, view.currentPeriod, view.field (my entry starters).
 * CSS: .db-matchday-* (new rules added to dashboard.css).
 */
function MatchdayModule({ vsField }: { vsField: VsFieldView }) {
  const { matches, currentPeriod } = vsField;
  const meField: FieldEntry | undefined = vsField.field.find((e) => e.isMe);
  const myStarters = meField?.starters ?? [];
  const lockedCount = myStarters.filter((s) => s.locked).length;
  const totalStarters = myStarters.length;

  const title = currentPeriod ? `Matchday · ${currentPeriod.label}` : "Matchday";

  if (!currentPeriod) {
    return (
      <Module title={title}>
        <p className="t-caption text-secondary db-empty-note">No active matchday.</p>
      </Module>
    );
  }

  return (
    <Module title={title} cta={{ label: "Vs the field", href: "/vsfield" }}>
      {totalStarters > 0 && (
        <div className="db-md-lock">
          <span className="t-caption text-secondary">Your XI locked</span>
          <span className="t-caption mono">
            <b>{lockedCount}</b>
            <span className="text-tertiary">/{totalStarters}</span>
          </span>
        </div>
      )}
      {matches.length === 0 ? (
        <p className="t-caption text-secondary db-empty-note">No fixtures this period.</p>
      ) : (
        <div className="db-match-list">
          {matches.map((m) => (
            <MatchRow key={m.matchId} match={m} />
          ))}
        </div>
      )}
    </Module>
  );
}

function MatchStatusPill({ status }: { status: MatchView["status"] }) {
  if (status === "in_progress") return <span className="pill pill-live">Live</span>;
  if (status === "completed") return <span className="pill pill-win">FT</span>;
  if (status === "postponed") return <span className="pill">PPD</span>;
  if (status === "abandoned") return <span className="pill">ABN</span>;
  return null; // scheduled — no pill
}

function MatchRow({ match }: { match: MatchView }) {
  const isLive = match.status === "in_progress";
  const isDone = match.status === "completed";
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <div className={"db-match-row" + (isLive ? " is-live" : "")}>
      <span className="db-match-team db-match-home">{match.homeTeamName ?? "—"}</span>
      <span className="db-match-score mono">
        {hasScore ? (
          <>
            <b>{match.homeScore}</b>
            <span className="text-tertiary"> – </span>
            <b>{match.awayScore}</b>
          </>
        ) : isDone ? (
          <span className="text-tertiary">—</span>
        ) : match.status === "scheduled" && match.startsInMinutes !== null ? (
          <span className="text-tertiary db-match-kick">
            {match.startsInMinutes <= 0
              ? "KO"
              : match.startsInMinutes < 60
                ? `${match.startsInMinutes}m`
                : formatKickoffTime(match.kickoffAt)}
          </span>
        ) : (
          <span className="text-tertiary">vs</span>
        )}
      </span>
      <span className="db-match-team db-match-away">{match.awayTeamName ?? "—"}</span>
      <MatchStatusPill status={match.status} />
    </div>
  );
}

/** Format an ISO datetime string as "HH:mm" (UTC) for scheduled match display. */
function formatKickoffTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ─── module router ────────────────────────────────────────────────────────────────────────

type PreDraftKey = "info" | "ready";
type DraftKey = "forming" | "picks";
type GroupKey = "record" | "standings" | "matchday";
type ModuleKey = PreDraftKey | DraftKey | GroupKey;

/** Which modules render for each phase — mirrors design's `modulesFor()`. */
function modulesFor(phase: DashboardPhase): ModuleKey[] {
  switch (phase) {
    case "pre-draft":
      return ["info", "ready"];
    case "draft":
      return ["forming", "picks", "ready"];
    case "pre-kickoff":
      // No per-module content — the PrimaryBanner carries the countdown; interim is enough.
      return [];
    case "group":
      return ["record", "standings", "matchday"];
    case "playoff":
      // STOP(P38): Guillotine / bracket deferred — no real modules yet.
      return [];
    case "complete":
      // STOP(P38): Tournament-complete recap deferred.
      return [];
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function renderModule(key: ModuleKey, draft: DraftRoomState | null, vsField: VsFieldView | null) {
  switch (key) {
    case "info":
      return <LeagueInfoModule key={key} draft={draft} />;
    case "ready":
      return <ReadinessModule key={key} draft={draft} />;
    case "forming":
      return draft ? <DraftFormingModule key={key} draft={draft} /> : null;
    case "picks":
      return draft ? <RecentPicksModule key={key} draft={draft} /> : null;
    case "record":
      return vsField ? <RecordModule key={key} vsField={vsField} /> : null;
    case "standings":
      return vsField ? <StandingsModule key={key} vsField={vsField} /> : null;
    case "matchday":
      return vsField ? <MatchdayModule key={key} vsField={vsField} /> : null;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

// ─── main export ─────────────────────────────────────────────────────────────────────────

export function Dashboard({ data }: { data: DashboardData }) {
  const { phase, draft, vsField, earliestGroupKickoff } = data;
  const keys = modulesFor(phase);

  // The group layout uses the spotlight (wider main + rail) for standings prominence.
  // All other phases with modules use the masonry grid.
  const useSpotlight = phase === "group";

  return (
    <div className="db-page">
      <PrimaryBanner
        phase={phase}
        draft={draft}
        vsField={vsField}
        earliestGroupKickoff={earliestGroupKickoff}
      />

      {(phase === "pre-kickoff" || phase === "playoff" || phase === "complete") &&
        keys.length === 0 && (
          // Honest interim for phases without modules yet — shows the banner already rendered above.
          // STOP(P38): Playoff bracket + complete recap are deferred.
          <div className="db-interim">
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

      {keys.length > 0 && useSpotlight && vsField && (
        <div className="db-spotlight">
          <div className="db-spot-main">
            {/* Standings gets the wide column */}
            {renderModule("standings", draft, vsField)}
          </div>
          <div className="db-spot-rail">
            {renderModule("record", draft, vsField)}
            {renderModule("matchday", draft, vsField)}
          </div>
        </div>
      )}

      {keys.length > 0 && !useSpotlight && (
        <div className="db-grid">
          {keys.map((k) => {
            const mod = renderModule(k, draft, vsField);
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
