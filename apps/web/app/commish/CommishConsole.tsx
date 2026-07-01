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
import "./commish.css";
import type {
  CommishAuditView,
  CommishConsoleView,
  CommishManagerInspector,
  CommishManagerOption,
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

export function CommishConsole({ view }: { view: CommishConsoleView }) {
  const [tab, setTab] = useState<TabId>("field");
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
              <TaskPlaceholder title={activeTab.label} copy={activeTab.copy} />
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
