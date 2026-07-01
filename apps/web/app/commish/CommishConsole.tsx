"use client";
/**
 * CommishConsole — the commissioner console shell (`/commish`), Thread 1. Ported from the design reference
 * (design/design_reference/admin) into ONE responsive client component. The distinctive slate "elevated
 * privileges" treatment rides `--adm-edge` (commish.css); cobalt (`--accent`) is reserved for the tab
 * selection + the view-as action, warning is `--ytp` orange, never gold.
 *
 * SCOPE (Thread 1): read-only. The four task tabs render as INERT placeholders ("coming in a later thread").
 * The two live read-only pieces are the Audit-log panel (real rows, empty until later slices populate) and
 * the View-as inspector (a read-only manager inspector, NOT session impersonation — the switcher navigates
 * to `?as=<id>` and the server loads that manager's public-ish state). No write action is wired.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./commish.css";
import type {
  CommishAuditView,
  CommishConsoleView,
  CommishManagerInspector,
  CommishManagerOption,
  CommishStatCorrectionsView,
  CommishStatCurrent,
  CommishSystemStatus,
} from "@/src/commish/commishView";

const TABS = [
  {
    id: "field",
    label: "Playoff field",
    copy: "Set the playoff field size and per-round cut schedule, then lock the bracket. Locking is irreversible.",
  },
  {
    id: "stats",
    label: "Stat corrections",
    copy: "Correct a player's match stat line; the change re-scores through the engine and records an audit entry.",
  },
  {
    id: "ops",
    label: "Game operations",
    copy: "Scoring source, lock-on-play fallback, and per-period freeze / unfreeze controls.",
  },
  {
    id: "draft",
    label: "Draft setup",
    copy: "Draft date, order, pick clock, and autopick configuration.",
  },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function CommishConsole({
  view,
  initialTab,
}: {
  view: CommishConsoleView;
  initialTab?: string | null;
}) {
  // The initial tab is URL-derived (Stat-corrections deep-links via ?tab=stats&match=…); default to the field tab.
  const [tab, setTab] = useState<TabId>(TABS.find((t) => t.id === initialTab)?.id ?? "field");
  const inspector = view.inspector;
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="adm-console">
      <div className="adm-ribbon" role="note">
        <span className="adm-ribbon-badge">
          <ShieldIcon />
          Commissioner mode
        </span>
        <span className="adm-ribbon-copy">
          Elevated privileges — every action is logged to the audit trail.
        </span>
        <ViewAsSwitcher managers={view.managers} inspectingId={inspector?.managerId ?? null} />
      </div>

      {inspector ? (
        <ManagerView inspector={inspector} />
      ) : (
        <>
          <div className="adm-tabs" role="tablist" aria-label="Commissioner tasks">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tab}
                className={t.id === tab ? "adm-tab is-active" : "adm-tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="adm-body">
            <div className="adm-main">
              {tab === "stats" ? (
                <StatCorrectionsPanel view={view.statCorrections} />
              ) : (
                <TaskPlaceholder title={activeTab.label} copy={activeTab.copy} />
              )}
            </div>
            <div className="adm-rail">
              <SystemStatusCard status={view.status} leagueName={view.leagueName} />
              <AuditLogCard audit={view.audit} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── inert task placeholder ──────────────────────────────────────────────────────────────────────
function TaskPlaceholder({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">{title}</h3>
          <span className="adm-card-sub">Commissioner task</span>
        </div>
        <span className="adm-badge adm-badge-sm">Read-only</span>
      </div>
      <div className="adm-card-b">
        <div className="adm-placeholder">
          <span className="adm-placeholder-title">{title}</span>
          <span className="adm-placeholder-copy">{copy}</span>
          <span className="adm-placeholder-tag">Coming in a later thread</span>
        </div>
      </div>
    </section>
  );
}

// ── stat corrections (Thread 2): penalty entry + rating override ────────────────────────────────
function errorText(status: number, body: { error?: string }): string {
  const map: Record<string, string> = {
    reason_required: "A reason is required.",
    rating_out_of_range: "Rating must be between 0 and 10.",
    invalid_match_player: "That player isn't part of the selected match.",
    bad_request: "Invalid input.",
    forbidden: "Not permitted.",
    no_session: "Your session expired — sign in again.",
    no_league: "Could not resolve your league.",
  };
  return map[body.error ?? ""] ?? `Request failed (${status}).`;
}

type FormMsg = { ok: boolean; text: string } | null;

function StatCorrectionsPanel({ view }: { view: CommishStatCorrectionsView }) {
  const router = useRouter();
  const { matches, selectedMatchId, selectedPlayerId, players, current } = view;

  const goMatch = (matchId: string) =>
    router.push(matchId ? `/commish?tab=stats&match=${matchId}` : "/commish?tab=stats");
  const goPlayer = (playerId: string) => {
    if (!selectedMatchId) return;
    const base = `/commish?tab=stats&match=${selectedMatchId}`;
    router.push(playerId ? `${base}&player=${playerId}` : base);
  };
  const refresh = () => router.refresh();
  const selKey = `${selectedMatchId ?? "-"}:${selectedPlayerId ?? "-"}`;

  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Stat corrections</h3>
          <span className="adm-card-sub">Penalty entry · rating override</span>
        </div>
        <span className="adm-badge adm-badge-sm">Re-scores + logged</span>
      </div>
      <div className="adm-card-b">
        <div className="adm-field">
          <label className="t-label" htmlFor="sc-match">
            Match
          </label>
          <select
            id="sc-match"
            className="adm-select"
            value={selectedMatchId ?? ""}
            onChange={(e) => goMatch(e.target.value)}
          >
            <option value="">Select a match…</option>
            {matches.map((m) => (
              <option key={m.matchId} value={m.matchId}>
                {m.label}
                {m.periodLabel ? ` — ${m.periodLabel}` : ""}
                {m.periodFrozen ? " ❄ frozen" : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedMatchId && (
          <div className="adm-field">
            <label className="t-label" htmlFor="sc-player">
              Player
            </label>
            <select
              id="sc-player"
              className="adm-select"
              value={selectedPlayerId ?? ""}
              onChange={(e) => goPlayer(e.target.value)}
            >
              <option value="">Select a player…</option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name} · {p.position}
                  {p.teamName ? ` · ${p.teamName}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedMatchId && selectedPlayerId && current ? (
          <>
            {current.periodFrozen && (
              <div className="adm-frozen" role="note">
                This match&rsquo;s period is <b>frozen</b>. A correction still re-scores via
                commissioner override — the leaderboard is restated and the action is logged.
              </div>
            )}
            <PenaltyForm
              key={`pen:${selKey}`}
              target={{ selectedMatchId, selectedPlayerId }}
              current={current}
              onDone={refresh}
            />
            <RatingForm
              key={`rat:${selKey}`}
              target={{ selectedMatchId, selectedPlayerId }}
              current={current}
              onDone={refresh}
            />
            {/* TODO(2b): general stat-line editor (any feed stat via manual_stat_player_match.extra + an adapter overlay). */}
          </>
        ) : (
          <p className="adm-hint">
            {selectedMatchId
              ? "Pick a player to correct their penalty entry or match rating."
              : "Pick a match, then a player, to enter a penalty or override the rating."}
          </p>
        )}
      </div>
    </section>
  );
}

interface FormTarget {
  selectedMatchId: string;
  selectedPlayerId: string;
}

function PenaltyForm({
  target,
  current,
  onDone,
}: {
  target: FormTarget;
  current: CommishStatCurrent;
  onDone: () => void;
}) {
  const [won, setWon] = useState(String(current.penaltyWon));
  const [committed, setCommitted] = useState(String(current.penaltyCommitted));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  const net = (Number(won) || 0) * 2 - (Number(committed) || 0) * 2;
  const preview = net === 0 ? "0 pts" : net > 0 ? `+${net} pts` : `−${Math.abs(net)} pts`;

  async function submit(clear: boolean) {
    if (reason.trim() === "") {
      setMsg({ ok: false, text: "A reason is required." });
      return;
    }
    setPending(true);
    setMsg(null);
    const payload = {
      matchId: target.selectedMatchId,
      playerId: target.selectedPlayerId,
      penaltyWon: clear ? 0 : Math.max(0, Math.trunc(Number(won) || 0)),
      penaltyCommitted: clear ? 0 : Math.max(0, Math.trunc(Number(committed) || 0)),
      reason,
    };
    try {
      const res = await fetch("/api/commish/penalty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        delta?: string;
        error?: string;
        scored?: boolean;
      };
      if (res.ok) {
        // Sync the inputs to what was just written — otherwise "Clear (0/0)" leaves stale non-zero counts that
        // read as un-cleared and would re-apply the old penalty on the next Save.
        setWon(String(payload.penaltyWon));
        setCommitted(String(payload.penaltyCommitted));
        setReason("");
        setMsg({
          ok: true,
          text:
            body.scored === false
              ? "Saved + logged — pending: this player has no match data yet; it applies once the feed records them."
              : `Saved (${body.delta ?? "updated"}). Re-scored + logged.`,
        });
        onDone();
      } else {
        setMsg({ ok: false, text: errorText(res.status, body) });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <div className="adm-form-h">
        Penalty entry <span className="adm-form-sub">+2 won / −2 committed</span>
      </div>
      <div className="adm-form-row">
        <label className="adm-inline">
          <span className="t-label">Won</span>
          <input
            type="number"
            min={0}
            step={1}
            className="adm-num"
            value={won}
            onChange={(e) => setWon(e.target.value)}
          />
        </label>
        <label className="adm-inline">
          <span className="t-label">Committed</span>
          <input
            type="number"
            min={0}
            step={1}
            className="adm-num"
            value={committed}
            onChange={(e) => setCommitted(e.target.value)}
          />
        </label>
        <span className="adm-preview">{preview}</span>
      </div>
      <input
        className="adm-input"
        placeholder="Reason (required — recorded to the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="adm-form-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Save penalty
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => void submit(true)}
        >
          Clear (0/0)
        </button>
        {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
      </div>
    </form>
  );
}

function RatingForm({
  target,
  current,
  onDone,
}: {
  target: FormTarget;
  current: CommishStatCurrent;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(
    current.resolvedRating != null ? String(current.resolvedRating) : "",
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  async function submit(clear: boolean) {
    if (reason.trim() === "") {
      setMsg({ ok: false, text: "A reason is required." });
      return;
    }
    if (!clear) {
      const r = Number(rating);
      if (rating.trim() === "" || Number.isNaN(r) || r < 0 || r > 10) {
        setMsg({ ok: false, text: "Enter a rating between 0 and 10." });
        return;
      }
    }
    setPending(true);
    setMsg(null);
    const payload = clear
      ? { matchId: target.selectedMatchId, playerId: target.selectedPlayerId, clear: true, reason }
      : {
          matchId: target.selectedMatchId,
          playerId: target.selectedPlayerId,
          rating: Number(rating),
          reason,
        };
    try {
      const res = await fetch("/api/commish/rating", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; scored?: boolean };
      if (res.ok) {
        // Clear empties the override input (the field falls back to balldontlie after refresh); a set keeps the
        // entered value so the form matches the just-written state.
        setRating(clear ? "" : String(Number(rating)));
        setReason("");
        setMsg({
          ok: true,
          text:
            body.scored === false
              ? "Saved + logged — pending: this player has no match data yet; it applies once the feed records them."
              : clear
                ? "Override cleared. Re-scored + logged."
                : "Rating saved. Re-scored + logged.",
        });
        onDone();
      } else {
        setMsg({ ok: false, text: errorText(res.status, body) });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <div className="adm-form-h">
        Rating override <span className="adm-form-sub">0–10 · manual beats balldontlie</span>
      </div>
      <div className="adm-current">
        <span className="t-label">Current (as scored)</span>
        <b>{current.resolvedRating != null ? current.resolvedRating : "—"}</b>
        <span className="adm-src">
          {current.resolvedRatingSource ? `via ${current.resolvedRatingSource}` : "no rating"}
        </span>
      </div>
      <div className="adm-form-row">
        <label className="adm-inline">
          <span className="t-label">Override</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            className="adm-num"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          />
        </label>
      </div>
      <input
        className="adm-input"
        placeholder="Reason (required — recorded to the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="adm-form-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Save rating
        </button>
        {current.hasManualRating && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() => void submit(true)}
          >
            Clear override
          </button>
        )}
        {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
      </div>
    </form>
  );
}

// ── system status ────────────────────────────────────────────────────────────────────────────────
function SystemStatusCard({
  status,
  leagueName,
}: {
  status: CommishSystemStatus;
  leagueName: string;
}) {
  return (
    <section className="adm-card adm-status">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">System status</h3>
          <span className="adm-card-sub">{leagueName}</span>
        </div>
      </div>
      <div className="adm-card-b">
        <div className="adm-status-grid">
          <div className="adm-stat-row">
            <div className="adm-stat-mini">
              <span className="t-label">Managers</span>
              <b>{status.managerCount}</b>
            </div>
            <div className="adm-stat-mini">
              <span className="t-label">Periods</span>
              <b>{status.periodCount}</b>
            </div>
          </div>
          <div className="adm-stat-row">
            <div className="adm-stat-mini">
              <span className="t-label">Frozen periods</span>
              <b className={status.frozenPeriodCount > 0 ? "is-warn" : undefined}>
                {status.frozenPeriodCount || "None"}
              </b>
            </div>
            <div className="adm-stat-mini">
              <span className="t-label">Audit entries</span>
              <b>{status.auditEntryCount}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── audit log ─────────────────────────────────────────────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; tone: "info" | "warn" | "danger" }> = {
  penalty_applied: { label: "Penalty applied", tone: "warn" },
  stat_correction: { label: "Stat correction", tone: "info" },
  rating_override: { label: "Rating override", tone: "info" },
  roster_repair: { label: "Roster repair", tone: "info" },
  lineup_repair: { label: "Lineup repair", tone: "info" },
  period_freeze: { label: "Period freeze", tone: "warn" },
  period_unfreeze: { label: "Period unfrozen", tone: "info" },
  field_locked: { label: "Field locked", tone: "danger" },
  playoff_config: { label: "Playoff config", tone: "info" },
  lock_fallback_changed: { label: "Lock fallback", tone: "warn" },
  scoring_source_changed: { label: "Scoring source", tone: "warn" },
  draft_config: { label: "Draft config", tone: "info" },
  action_reversed: { label: "Action reversed", tone: "info" },
};
function actionMeta(actionType: string): { label: string; tone: "info" | "warn" | "danger" } {
  return (
    ACTION_META[actionType] ?? {
      label: actionType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      tone: "info",
    }
  );
}

function AuditLogCard({ audit }: { audit: CommishAuditView[] }) {
  return (
    <section className="adm-card adm-auditcard">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Audit log</h3>
          <span className="adm-card-sub">Append-only history</span>
        </div>
        <span className="adm-audit-allflag">all actions recorded</span>
      </div>
      <div className="adm-card-b">
        {audit.length === 0 ? (
          <div className="adm-empty">No commissioner actions recorded yet.</div>
        ) : (
          <div className="adm-auditlog">
            {audit.map((e) => (
              <AuditEntry key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AuditEntry({ entry }: { entry: CommishAuditView }) {
  const meta = actionMeta(entry.actionType);
  return (
    <div className={`adm-audit tone-${meta.tone}`}>
      <span className="adm-audit-ico" aria-hidden="true">
        <DotIcon />
      </span>
      <div className="adm-audit-main">
        <div className="adm-audit-top">
          <span className="adm-audit-title">{entry.summary}</span>
          {entry.delta && <span className="adm-audit-delta">{entry.delta}</span>}
        </div>
        {entry.detail && <span className="adm-audit-detail">{entry.detail}</span>}
        <div className="adm-audit-foot">
          <span className="adm-audit-type">{meta.label}</span>
          <span className="adm-audit-sep">·</span>
          <span className="adm-audit-actor">{entry.actorLabel ?? "System"}</span>
          <span className="adm-audit-sep">·</span>
          <span className="adm-audit-when" title={entry.createdAtIso}>
            {entry.whenLabel}
          </span>
          {entry.reversible ? (
            <button
              type="button"
              className="adm-audit-undo"
              disabled
              title="Reverse ships in a later thread"
            >
              Reverse
            </button>
          ) : (
            <span className="adm-audit-lockflag">permanent</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── view-as switcher (read-only inspector, NOT impersonation) ─────────────────────────────────────
function ViewAsSwitcher({
  managers,
  inspectingId,
}: {
  managers: CommishManagerOption[];
  inspectingId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const inspected = inspectingId ? managers.find((m) => m.managerId === inspectingId) : null;
  const others = managers.filter((m) => !m.isViewer);

  return (
    <div className="adm-viewas">
      <button
        type="button"
        className={inspected ? "adm-viewas-btn is-active" : "adm-viewas-btn"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <EyeIcon />
        {inspected ? (
          <span>
            Viewing as <b>{inspected.displayName}</b>
          </span>
        ) : (
          <span>View as…</span>
        )}
      </button>
      {open && (
        <div className="adm-viewas-menu" role="menu">
          <div className="adm-viewas-head t-label">Inspect a manager (read-only)</div>
          {inspected && (
            <Link
              href="/commish"
              className="adm-viewas-opt"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="adm-viewas-name">← Back to your console</span>
            </Link>
          )}
          <div className="adm-viewas-scroll">
            {others.map((m) => (
              <Link
                key={m.managerId}
                href={`/commish?as=${m.managerId}`}
                className={
                  m.managerId === inspectingId ? "adm-viewas-opt is-sel" : "adm-viewas-opt"
                }
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="adm-viewas-name">{m.displayName}</span>
                {m.isCommissioner && <span className="adm-badge adm-badge-sm">Commish</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── read-only manager inspector ───────────────────────────────────────────────────────────────────
function ManagerView({ inspector }: { inspector: CommishManagerInspector }) {
  const rec = inspector.record;
  return (
    <div className="adm-mgrview">
      <div className="adm-vab">
        <EyeIcon />
        <span className="adm-vab-txt">
          Viewing the league as <b>{inspector.displayName}</b> — read-only. Nothing here is recorded
          against them.
        </span>
        <Link className="btn btn-sm btn-primary" href="/commish">
          Return to commissioner
        </Link>
      </div>

      <section className="adm-mgrview-card">
        <div className="adm-mgrview-head">
          <div>
            <div className="adm-mgrview-name">{inspector.displayName}</div>
            <div className="adm-mgrview-sub">
              {inspector.isCommissioner ? "Commissioner · " : ""}
              {inspector.rosterCount} owned player{inspector.rosterCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="adm-mgrview-tiles">
          <div className="adm-mvtile">
            <span className="t-label">Seed</span>
            <b>{inspector.seed ?? "—"}</b>
          </div>
          <div className="adm-mvtile">
            <span className="t-label">Record</span>
            <b>{rec ? `${rec.w}–${rec.l}–${rec.d}` : "—"}</b>
          </div>
          <div className="adm-mvtile">
            <span className="t-label">Points for</span>
            <b>{rec ? rec.points : "—"}</b>
          </div>
          <div className="adm-mvtile">
            <span className="t-label">FAAB budget</span>
            <b>${inspector.faabBudget}</b>
          </div>
        </div>

        {inspector.roster.length > 0 && (
          <div className="adm-roster">
            {inspector.roster.map((p) => (
              <div key={p.playerId} className="adm-roster-row">
                <span className={`pos pos-${p.position}`}>{p.position}</span>
                <span className="adm-roster-name">{p.name}</span>
                <span className="adm-roster-team">{p.teamName ?? p.country ?? ""}</span>
              </div>
            ))}
          </div>
        )}

        <div className="adm-mgrview-note">
          <EyeIcon />
          <span>
            You&rsquo;re inspecting <b>{inspector.displayName}</b>&rsquo;s public state. This is a
            read-only inspector — commissioner controls and other managers&rsquo; sealed bids stay
            hidden, and nothing you do here acts on their behalf.
          </span>
        </div>
      </section>
    </div>
  );
}

// ── icons ─────────────────────────────────────────────────────────────────────────────────────────
function ShieldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
