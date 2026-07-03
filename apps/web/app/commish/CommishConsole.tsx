"use client";
/**
 * CommishConsole — the commissioner console shell (`/commish`), Thread 1. Ported from the design reference
 * (design/design_reference/admin) into ONE responsive client component. The distinctive slate "elevated
 * privileges" treatment rides `--adm-edge` (commish.css); cobalt (`--accent`) is reserved for the tab
 * selection + the view-as action, warning is `--ytp` orange, never gold.
 *
 * Four live tabs (Playoff cuts / Stat corrections / Roster & lineup / Game operations) are wired panels;
 * the Audit-log rail and the View-as inspector (a read-only manager inspector, NOT session impersonation
 * — the switcher navigates to `?as=<id>` and the server loads that manager's public-ish state) round out
 * the console. The Draft-setup tab (a control that could only ever run once, pre-tournament) was retired
 * in Thread 6 — the historical draft room at `/draft` is unaffected.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Position } from "@app/shared";
import "./commish.css";
import type { AdvancePlan } from "@app/commish-core";
import {
  STAT_FIELD_META,
  type CommishAdvancePreview,
  type CommishAdvanceView,
  type CommishAuditView,
  type CommishConsoleView,
  type CommishFreezePeriodView,
  type CommishManagerInspector,
  type CommishManagerOption,
  type CommishOpsView,
  type CommishRepairView,
  type CommishRosterPlayer,
  type CommishStatCorrectionsView,
  type CommishStatCurrent,
  type CommishSystemStatus,
} from "@/src/commish/commishView";

const TABS = [
  {
    id: "field",
    label: "Playoff cuts",
    copy: "Review the knockout cut ladder and apply each round's guillotine cut. Applying a cut is irreversible.",
  },
  {
    id: "stats",
    label: "Stat corrections",
    copy: "Correct a player's match stat line; the change re-scores through the engine and records an audit entry.",
  },
  {
    id: "repair",
    label: "Roster & lineup",
    copy: "SAFE roster/lineup repairs: add, add/drop, trim of unlocked players, and past-window lineup edits.",
  },
  {
    id: "ops",
    label: "Game operations",
    copy: "Scoring source, lock-on-play fallback, and per-period freeze / unfreeze controls.",
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
              ) : tab === "repair" ? (
                <RepairPanel view={view.repair} managers={view.managers} />
              ) : tab === "ops" ? (
                <OpsPanel view={view.ops} />
              ) : (
                <AdvancePanel view={view.advance} />
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

// ── game operations (Thread 4): period freeze / unfreeze ────────────────────────────────────────
//
// COPY CONTRACT (Step-0 discovery — the design prototype's "Lineups locked · scoring paused" is WRONG
// and must not ship): `frozen_at` gates AUTO-RESTATEMENT only. Freeze = results final now (late feed /
// rating corrections stop auto-restating); unfreeze = re-open auto-restatement (pending corrections
// apply on the worker's next sweep) and the hourly close job RE-FREEZES the period on its next pass.

const FREEZE_CONFIRM_WORD = "FREEZE";

function OpsPanel({ view }: { view: CommishOpsView }) {
  const router = useRouter();
  // One inline confirm open at a time: the period being acted on + which action.
  const [confirm, setConfirm] = useState<{ periodId: string; mode: "freeze" | "unfreeze" } | null>(
    null,
  );
  const [msg, setMsg] = useState<FormMsg>(null);

  const openConfirm = (periodId: string, mode: "freeze" | "unfreeze") => {
    setMsg(null);
    setConfirm((c) =>
      c && c.periodId === periodId && c.mode === mode ? null : { periodId, mode },
    );
  };

  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Game operations</h3>
          <span className="adm-card-sub">Period freeze — results finality</span>
        </div>
        <span className="adm-badge adm-badge-sm">Restatement gate · logged</span>
      </div>
      <div className="adm-card-b">
        <p className="adm-ops-copy">
          Freezing a period marks its results <b>final</b>: late feed or rating corrections stop
          auto-restating its scores. It does <b>not</b> lock lineups and does <b>not</b> pause live
          scoring. The hourly close job freezes settled periods on its own; freeze early to finalize
          now, unfreeze to let a pending correction restate.
        </p>
        <div className="adm-freezes">
          {view.periods.length === 0 && (
            <p className="adm-hint">No periods yet — the schedule hasn&apos;t been provisioned.</p>
          )}
          {view.periods.map((p) => (
            <FreezeRow
              key={p.periodId}
              period={p}
              confirmMode={confirm?.periodId === p.periodId ? confirm.mode : null}
              onToggleConfirm={openConfirm}
              onClose={() => setConfirm(null)}
              onResult={(m) => {
                setMsg(m);
                if (m.ok) {
                  setConfirm(null);
                  router.refresh();
                }
              }}
            />
          ))}
        </div>
        {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
      </div>
    </section>
  );
}

function FreezeRow({
  period,
  confirmMode,
  onToggleConfirm,
  onClose,
  onResult,
}: {
  period: CommishFreezePeriodView;
  confirmMode: "freeze" | "unfreeze" | null;
  onToggleConfirm: (periodId: string, mode: "freeze" | "unfreeze") => void;
  onClose: () => void;
  onResult: (m: NonNullable<FormMsg>) => void;
}) {
  const frozen = period.frozenAtIso != null;
  const kindLabel = period.kind === "group_md" ? "Group" : "Knockout";
  const frozenSince = period.frozenAtIso ? period.frozenAtIso.slice(0, 10) : null;

  return (
    <div className={frozen ? "adm-freeze is-frozen" : "adm-freeze"}>
      <div className="adm-freeze-row">
        <div className="adm-freeze-id">
          <span className="adm-freeze-label">{period.label}</span>
          <span className="adm-freeze-sub">
            {kindLabel} · {period.status}
            {frozenSince ? ` · frozen since ${frozenSince}` : ""}
            {frozen && period.pendingDirty > 0
              ? ` · ${period.pendingDirty} pending correction${period.pendingDirty === 1 ? "" : "s"} held`
              : ""}
          </span>
        </div>
        {period.live && (
          <span className="adm-livedot-pill">
            <span className="adm-livedot" />
            live
          </span>
        )}
        {frozen ? (
          <button
            type="button"
            className="adm-freeze-btn is-frozen"
            onClick={() => onToggleConfirm(period.periodId, "unfreeze")}
          >
            Frozen — unfreeze
          </button>
        ) : (
          <button
            type="button"
            className="adm-freeze-btn"
            disabled={!period.freezable}
            title={
              period.freezable
                ? undefined
                : "Live or unplayed fixtures — a period can be frozen only after every fixture has finished."
            }
            onClick={() => onToggleConfirm(period.periodId, "freeze")}
          >
            Freeze…
          </button>
        )}
      </div>
      {confirmMode === "freeze" && (
        <FreezeConfirm period={period} onClose={onClose} onResult={onResult} />
      )}
      {confirmMode === "unfreeze" && (
        <UnfreezeConfirm period={period} onClose={onClose} onResult={onResult} />
      )}
    </div>
  );
}

/** Type-to-confirm FREEZE (the design's confirmWord pattern, with the CORRECTED effect copy). */
function FreezeConfirm({
  period,
  onClose,
  onResult,
}: {
  period: CommishFreezePeriodView;
  onClose: () => void;
  onResult: (m: NonNullable<FormMsg>) => void;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const armed = typed.trim() === FREEZE_CONFIRM_WORD && reason.trim() !== "";

  async function submit() {
    setPending(true);
    try {
      const res = await fetch("/api/commish/freeze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodId: period.periodId, reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (res.ok) {
        onResult({ ok: true, text: `${period.label} frozen — results are final now.` });
      } else {
        onResult({ ok: false, text: errorText(res.status, body) });
      }
    } catch {
      onResult({ ok: false, text: "Network error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-freeze-confirm">
      <p className="adm-freeze-confirm-copy">
        Freezing marks <b>{period.label}</b>&apos;s results <b>final now</b> — late feed or rating
        corrections stop auto-restating this period until it is unfrozen. Lineups and live scoring
        are unaffected.
      </p>
      <div className="adm-field">
        <label className="t-label" htmlFor={`fz-word-${period.periodId}`}>
          Type <b>{FREEZE_CONFIRM_WORD}</b> to confirm
        </label>
        <input
          id={`fz-word-${period.periodId}`}
          className="adm-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={FREEZE_CONFIRM_WORD}
          autoComplete="off"
        />
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor={`fz-reason-${period.periodId}`}>
          Reason (logged)
        </label>
        <input
          id={`fz-reason-${period.periodId}`}
          className="adm-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. results verified — finalize ahead of the window"
        />
      </div>
      <div className="adm-form-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!armed || pending}
          onClick={() => void submit()}
        >
          {pending ? "Freezing…" : "Freeze period"}
        </button>
      </div>
    </div>
  );
}

/** Plain confirm for unfreeze — reason REQUIRED; carries the re-freeze + pending-corrections copy. */
function UnfreezeConfirm({
  period,
  onClose,
  onResult,
}: {
  period: CommishFreezePeriodView;
  onClose: () => void;
  onResult: (m: NonNullable<FormMsg>) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      const res = await fetch("/api/commish/unfreeze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodId: period.periodId, reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        pendingDirty?: number;
      };
      if (res.ok) {
        const n = body.pendingDirty ?? 0;
        const restate =
          n > 0
            ? `${n} pending correction${n === 1 ? "" : "s"} will restate on the next sweep.`
            : "No pending corrections right now.";
        onResult({
          ok: true,
          text: `${period.label} unfrozen — ${restate} Re-freezes automatically on the next hourly pass.`,
        });
      } else {
        onResult({ ok: false, text: errorText(res.status, body) });
      }
    } catch {
      onResult({ ok: false, text: "Network error." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-freeze-confirm">
      <p className="adm-freeze-confirm-copy">
        Unfreezing re-opens auto-restatement for <b>{period.label}</b>: pending corrections apply on
        the worker&apos;s next sweep. It re-freezes automatically on the close job&apos;s next
        hourly pass (up to ~1h window to let corrections restate).
        {period.pendingDirty > 0
          ? ` ${period.pendingDirty} pending correction${period.pendingDirty === 1 ? "" : "s"} currently held.`
          : ""}
      </p>
      <div className="adm-field">
        <label className="t-label" htmlFor={`uf-reason-${period.periodId}`}>
          Reason (required, logged)
        </label>
        <input
          id={`uf-reason-${period.periodId}`}
          className="adm-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. late rating correction for MD2 needs to restate"
        />
      </div>
      <div className="adm-form-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={reason.trim() === "" || pending}
          onClick={() => void submit()}
        >
          {pending ? "Unfreezing…" : "Unfreeze"}
        </button>
      </div>
    </div>
  );
}

// ── playoff cuts (Thread 5): the guillotine ladder + per-round cut application ──────────────────
//
// The SSR dry-run (loadCommish → runRoundAdvance apply:false over the VERBATIM store) renders the
// plan; every write goes through POST /api/commish/advance, which re-runs the SAME orchestrator
// guards. `allowIncomplete` never rides this surface (pinned false server-side). A residual boundary
// tie is NEVER auto-cut: the picker requires exactly `cutsRemaining` choices, then a breakTie DRY-RUN
// names the full eliminated set before the type-to-confirm apply.

const CUT_CONFIRM_WORD = "CUT";

type AdvanceResolution = NonNullable<AdvancePlan["resolution"]>;

/** The pre-confirm irreversibility copy — MUST name the eliminated managers + counts (thread spec). */
function advanceConfirmCopy(plan: AdvancePlan, eliminatedNames: string[], champion: string | null) {
  return (
    `Applying the ${plan.round} cut permanently eliminates ${eliminatedNames.length} manager` +
    `${eliminatedNames.length === 1 ? "" : "s"}: ${eliminatedNames.join(", ")}.` +
    (champion ? ` ${champion} becomes the champion.` : "") +
    " This cannot be undone."
  );
}

function AdvancePanel({ view }: { view: CommishAdvanceView }) {
  const router = useRouter();
  const [msg, setMsg] = useState<FormMsg>(null);

  if (!view.seeded) {
    return (
      <section className="adm-card">
        <div className="adm-card-h">
          <div className="adm-card-ht">
            <h3 className="adm-card-title">Playoff cuts</h3>
            <span className="adm-card-sub">Guillotine ladder — one cut per knockout round</span>
          </div>
        </div>
        <div className="adm-card-b">
          <p className="adm-hint">
            The playoff field isn&apos;t seeded yet — the group → playoff transition
            (commish:transition) locks the field and seeds each round&apos;s cut count first.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="adm-adv">
      <section className="adm-card">
        <div className="adm-card-h">
          <div className="adm-card-ht">
            <h3 className="adm-card-title">Playoff cuts</h3>
            <span className="adm-card-sub">Guillotine ladder — one cut per knockout round</span>
          </div>
          <span className="adm-badge adm-badge-sm">Irreversible · logged</span>
        </div>
        <div className="adm-card-b">
          {view.championName && (
            <p className="adm-adv-champion">
              🏆 <b>{view.championName}</b> is the champion — the ladder is complete.
            </p>
          )}
          <div className="adm-adv-rounds">
            {view.rounds.map((r) => (
              <div
                key={r.periodId}
                className={
                  "adm-adv-round" + (r.alreadyCut ? " is-cut" : r.isNext ? " is-next" : "")
                }
              >
                <span className="adm-adv-round-label">{r.label}</span>
                <span className="adm-adv-round-bar mono">
                  {r.enters}{" "}
                  <span className="adm-adv-round-cutn">
                    −{r.alreadyCut ? r.enters - r.survives : (r.cutCount ?? "?")} cut
                  </span>{" "}
                  → {r.survives}{" "}
                  {r.label === "Final" ? (r.survives === 1 ? "champion" : "survive") : "survive"}
                </span>
                {r.alreadyCut ? (
                  <span className="adm-adv-chip is-done">cut ✓</span>
                ) : (
                  <>
                    {r.isNext && <span className="adm-adv-chip is-next">next up</span>}
                    <span className={r.frozen ? "adm-adv-chip is-frozen" : "adm-adv-chip"}>
                      {r.frozen ? "frozen ✓" : "not frozen"}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="adm-hint">
            {view.aliveCount} of {view.fieldSize} managers alive. Cut counts were seeded at the
            group → playoff transition; a round can be cut once its results are frozen.
          </p>
        </div>
      </section>

      {view.nextRoundLabel && view.preview && (
        <AdvanceCutCard
          roundLabel={view.nextRoundLabel}
          preview={view.preview}
          onResult={(m) => {
            setMsg(m);
            if (m.ok) router.refresh();
          }}
        />
      )}
      {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
    </div>
  );
}

/** The next round's cut plan: the sorted alive field with the cut zone marked, the refusal banner,
 *  the tie picker (exactly `cutsRemaining` selections), and the type-to-confirm apply. */
function AdvanceCutCard({
  roundLabel,
  preview,
  onResult,
}: {
  roundLabel: string;
  preview: CommishAdvancePreview;
  onResult: (m: NonNullable<FormMsg>) => void;
}) {
  const [plan, setPlan] = useState<AdvancePlan | null>(preview.plan);
  const [blocked, setBlocked] = useState<string | null>(
    preview.status === "planned" ? null : preview.reason,
  );
  const [chosenTie, setChosenTie] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const resolution: AdvanceResolution | null = plan?.resolution ?? null;
  const nameOf = new Map((plan?.field ?? []).map((f) => [f.managerId, f.name] as const));
  const label = (id: string): string => nameOf.get(id) ?? id;

  async function post(body: Record<string, unknown>): Promise<{
    status: number;
    body: {
      status?: string;
      reason?: string;
      error?: string;
      plan?: AdvancePlan;
      auditId?: string;
    };
  }> {
    const res = await fetch("/api/commish/advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as {
      status?: string;
      reason?: string;
      error?: string;
      plan?: AdvancePlan;
      auditId?: string;
    };
    return { status: res.status, body: out };
  }

  /** Tie chosen → re-DRY-RUN with breakTie so the SERVER names the full eliminated set. */
  async function previewTieCut() {
    setPending(true);
    setBlocked(null);
    try {
      const { status, body } = await post({ roundLabel, apply: false, breakTie: chosenTie });
      if (status === 200 && body.plan) {
        setPlan(body.plan);
      } else {
        setBlocked(body.reason ?? body.error ?? `Request failed (${status}).`);
      }
    } catch {
      setBlocked("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Next cut: {roundLabel}</h3>
          <span className="adm-card-sub">
            {plan ? `Cut ${plan.cutCount ?? "?"} of ${plan.field.length} alive` : "Cut plan"} ·
            lowest round score is eliminated
          </span>
        </div>
        {plan && (
          <span className={plan.frozen ? "adm-adv-chip is-frozen" : "adm-adv-chip"}>
            {plan.frozen ? "frozen ✓" : "not frozen"}
          </span>
        )}
      </div>
      <div className="adm-card-b">
        {blocked && (
          <div className="adm-adv-blocked" role="alert">
            <b>Blocked:</b> {blocked}
          </div>
        )}

        {plan && <AdvanceFieldTable plan={plan} resolution={resolution} chosenTie={chosenTie} />}

        {resolution?.kind === "needsCommissioner" && (
          <div className="adm-adv-tie">
            <p className="adm-adv-tie-copy">
              Boundary tie — select exactly <b>{resolution.cutsRemaining}</b> of the tied managers
              to cut, then preview.
            </p>
            <div className="adm-adv-tie-chips">
              {resolution.tied.map((id) => {
                const on = chosenTie.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={on ? "adm-adv-tiechip is-on" : "adm-adv-tiechip"}
                    aria-pressed={on}
                    onClick={() =>
                      setChosenTie((c) =>
                        on
                          ? c.filter((x) => x !== id)
                          : c.length < resolution.cutsRemaining
                            ? [...c, id]
                            : c,
                      )
                    }
                  >
                    {label(id)}
                  </button>
                );
              })}
            </div>
            <div className="adm-form-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={chosenTie.length !== resolution.cutsRemaining || pending}
                onClick={() => void previewTieCut()}
              >
                {pending ? "Previewing…" : "Preview this cut"}
              </button>
            </div>
          </div>
        )}

        {resolution?.kind === "determined" && plan && (
          <AdvanceApplyConfirm
            plan={plan}
            eliminated={resolution.eliminated}
            champion={resolution.champion}
            breakTie={chosenTie.length > 0 ? chosenTie : null}
            label={label}
            post={post}
            onBlocked={setBlocked}
            onResult={onResult}
          />
        )}
      </div>
    </section>
  );
}

/** The alive field, highest score first, with the cut zone (or the tied set) marked. */
function AdvanceFieldTable({
  plan,
  resolution,
  chosenTie,
}: {
  plan: AdvancePlan;
  resolution: AdvanceResolution | null;
  chosenTie: string[];
}) {
  const cutSet = new Set(resolution?.kind === "determined" ? resolution.eliminated : []);
  const tiedSet = new Set(resolution?.kind !== "determined" ? (resolution?.tied ?? []) : []);
  const rows = [...plan.field].reverse(); // field arrives ascending; render leaderboard-style
  const firstCutIdx = rows.findIndex((r) => cutSet.has(r.managerId));
  return (
    <div className="adm-adv-field">
      <div className="adm-adv-fieldhead">
        <span>Manager</span>
        <span className="mono">{plan.round} pts</span>
        <span className="mono">Total</span>
        <span />
      </div>
      {rows.map((f, i) => {
        const cls = cutSet.has(f.managerId)
          ? "adm-adv-row is-cut"
          : tiedSet.has(f.managerId)
            ? "adm-adv-row is-tied"
            : "adm-adv-row";
        return (
          <div key={f.managerId}>
            {i === firstCutIdx && firstCutIdx > 0 && (
              <div className="adm-adv-cutline" aria-hidden="true">
                <span>cut line</span>
              </div>
            )}
            <div className={cls}>
              <span className="adm-adv-row-name">{f.name}</span>
              <span className="mono">{f.roundPoints}</span>
              <span className="mono adm-adv-row-total">{f.cumulativeTotal}</span>
              <span>
                {cutSet.has(f.managerId) && <span className="adm-adv-chip is-elim">CUT</span>}
                {tiedSet.has(f.managerId) && (
                  <span
                    className={
                      chosenTie.includes(f.managerId)
                        ? "adm-adv-chip is-elim"
                        : "adm-adv-chip is-tie"
                    }
                  >
                    {chosenTie.includes(f.managerId) ? "CUT (your pick)" : "TIED"}
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Type-to-confirm apply (the design's confirmWord pattern): names the eliminated + counts first. */
function AdvanceApplyConfirm({
  plan,
  eliminated,
  champion,
  breakTie,
  label,
  post,
  onBlocked,
  onResult,
}: {
  plan: AdvancePlan;
  eliminated: string[];
  champion: string | null;
  breakTie: string[] | null;
  label: (id: string) => string;
  post: (body: Record<string, unknown>) => Promise<{
    status: number;
    body: { status?: string; reason?: string; error?: string; auditId?: string };
  }>;
  onBlocked: (reason: string) => void;
  onResult: (m: NonNullable<FormMsg>) => void;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const armed = typed.trim() === CUT_CONFIRM_WORD && reason.trim() !== "";
  const eliminatedNames = eliminated.map(label);
  const championName = champion ? label(champion) : null;

  async function submit() {
    setPending(true);
    try {
      const { status, body } = await post({
        roundLabel: plan.round,
        reason: reason.trim(),
        apply: true,
        breakTie,
      });
      if (status === 200 && body.status === "applied") {
        onResult({
          ok: true,
          text:
            `${plan.round} cut applied — ${eliminatedNames.length} eliminated` +
            (championName ? `, ${championName} crowned champion.` : "."),
        });
      } else {
        onBlocked(body.reason ?? body.error ?? `Request failed (${status}).`);
      }
    } catch {
      onBlocked("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="adm-freeze-confirm">
      <p className="adm-freeze-confirm-copy">
        {advanceConfirmCopy(plan, eliminatedNames, championName)}
      </p>
      <div className="adm-field">
        <label className="t-label" htmlFor="adv-word">
          Type <b>{CUT_CONFIRM_WORD}</b> to confirm
        </label>
        <input
          id="adv-word"
          className="adm-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CUT_CONFIRM_WORD}
          autoComplete="off"
        />
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor="adv-reason">
          Reason (required, logged)
        </label>
        <input
          id="adv-reason"
          className="adm-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={`e.g. ${plan.round} results frozen — applying the scheduled cut`}
        />
      </div>
      <div className="adm-form-actions">
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={!armed || pending}
          onClick={() => void submit()}
        >
          {pending ? "Applying…" : `Apply ${plan.round} cut`}
        </button>
      </div>
    </div>
  );
}

// ── stat corrections (Thread 2): penalty entry + rating override ────────────────────────────────
function errorText(status: number, body: { error?: string; message?: string }): string {
  // Repair rejections carry the runner's own reason (409-class) — surface it verbatim.
  if (body.message) return body.message;
  const map: Record<string, string> = {
    reason_required: "A reason is required.",
    rating_out_of_range: "Rating must be between 0 and 10.",
    unknown_stat_key: "That stat can't be corrected here.",
    invalid_match_player: "That player isn't part of the selected match.",
    bad_request: "Invalid input — stat values must be whole numbers ≥ 0.",
    forbidden: "Not permitted.",
    no_session: "Your session expired — sign in again.",
    no_league: "Could not resolve your league.",
    unknown_manager: "That manager isn't in your league.",
    invalid_player: "Unknown player.",
    invalid_period: "Unknown period.",
    already_frozen: "That period is already frozen.",
    not_frozen: "That period isn't frozen.",
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
  const selectedPlayer = players.find((p) => p.playerId === selectedPlayerId) ?? null;

  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Stat corrections</h3>
          <span className="adm-card-sub">Penalty · rating · stat line</span>
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
            <StatLineEditor
              key={`stat:${selKey}`}
              target={{ selectedMatchId, selectedPlayerId }}
              current={current}
              role={selectedPlayer?.position ?? null}
              onDone={refresh}
            />
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

// ── roster / lineup repair (Thread 3a): SAFE repairs only ────────────────────────────────────────
/**
 * The SAFE repair surface. By design there are NO dangerous-bypass controls here (not even disabled):
 * post-kickoff adds and locked-slot moves are the deferred 3b capabilities (CLI-only). Every form is
 * dry-run-first (Preview = the runner's `planned` status), requires a reason, and reports the
 * audit_pending / restate_pending partial-success outcomes loudly.
 */
type RepairApplied = {
  ok?: boolean;
  status?: string;
  reason?: string;
  auditPending?: boolean;
  restatePending?: boolean;
  audit?: unknown;
  error?: string;
  message?: string;
};

/** Shared outcome → message mapping for the three repair forms (loud on partial success). */
function repairMsg(
  res: Response,
  body: RepairApplied,
  planText: (b: RepairApplied) => string,
): FormMsg {
  if (!res.ok) return { ok: false, text: errorText(res.status, body) };
  if (body.status === "planned") {
    return {
      ok: true,
      text: `Dry-run OK — ${planText(body)} Nothing applied; hit Apply to execute.`,
    };
  }
  if (body.status === "skipped") {
    return { ok: true, text: `Skipped — ${body.reason ?? "already in the desired end state"}.` };
  }
  if (body.auditPending) {
    return {
      ok: false,
      text:
        "APPLIED, but the audit write FAILED (audit_pending). Recover the ledger row manually with this payload: " +
        JSON.stringify(body.audit),
    };
  }
  if (body.restatePending) {
    return {
      ok: false,
      text:
        "Applied + logged, but the automatic restate FAILED (restate_pending) — re-submit the identical " +
        "repair (it skips idempotently) or run the recompute job.",
    };
  }
  return { ok: true, text: "Applied, logged, and restated." };
}

function RepairPanel({
  view,
  managers,
}: {
  view: CommishRepairView;
  managers: CommishManagerOption[];
}) {
  const router = useRouter();
  const goManager = (id: string) =>
    router.push(id ? `/commish?tab=repair&rmanager=${id}` : "/commish?tab=repair");
  const goPeriod = (pid: string) => {
    if (!view.selectedManagerId) return;
    const base = `/commish?tab=repair&rmanager=${view.selectedManagerId}`;
    router.push(pid ? `${base}&rperiod=${pid}` : base);
  };
  const refresh = () => router.refresh();
  const selKey = `${view.selectedManagerId ?? "-"}:${view.selectedPeriodId ?? "-"}`;

  return (
    <section className="adm-card">
      <div className="adm-card-h">
        <div className="adm-card-ht">
          <h3 className="adm-card-title">Roster &amp; lineup repair</h3>
          <span className="adm-card-sub">Add · add/drop · trim · past-window lineup</span>
        </div>
        <span className="adm-badge adm-badge-sm">SAFE only · logged</span>
      </div>
      <div className="adm-card-b">
        <p className="adm-hint">
          SAFE repairs only: the kickoff guard and the lock-on-play latch stay armed. A post-kickoff
          add or any move of a locked-by-play slot is refused here by design (CLI-only, deferred).
        </p>
        <div className="adm-field">
          <label className="t-label" htmlFor="rp-manager">
            Manager
          </label>
          <select
            id="rp-manager"
            className="adm-select"
            value={view.selectedManagerId ?? ""}
            onChange={(e) => goManager(e.target.value)}
          >
            <option value="">Select a manager…</option>
            {managers.map((m) => (
              <option key={m.managerId} value={m.managerId}>
                {m.displayName}
                {m.isCommissioner ? " (commissioner)" : ""}
              </option>
            ))}
          </select>
        </div>

        {view.selectedManagerId ? (
          <>
            <RosterAddForm key={`add:${selKey}`} view={view} onDone={refresh} />
            <TrimForm key={`trim:${selKey}`} view={view} onDone={refresh} />
            <LineupRepairForm
              key={`xi:${selKey}`}
              view={view}
              onPeriod={goPeriod}
              onDone={refresh}
            />
          </>
        ) : (
          <p className="adm-hint">Pick a manager to repair their roster or lineup.</p>
        )}
      </div>
    </section>
  );
}

function RosterAddForm({ view, onDone }: { view: CommishRepairView; onDone: () => void }) {
  const managerId = view.selectedManagerId!;
  const [search, setSearch] = useState("");
  const [addId, setAddId] = useState("");
  const [dropId, setDropId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  const q = search.trim().toLowerCase();
  const matchesQ = (p: { name: string; teamName: string | null }) =>
    q === "" || p.name.toLowerCase().includes(q) || (p.teamName ?? "").toLowerCase().includes(q);
  const shown = view.pool.filter((p) => p.playerId === addId || matchesQ(p)).slice(0, 40);

  async function submit(apply: boolean) {
    if (!addId) return setMsg({ ok: false, text: "Pick a player to add." });
    if (reason.trim() === "") return setMsg({ ok: false, text: "A reason is required." });
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/commish/roster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "add",
          managerId,
          addPlayerId: addId,
          dropPlayerId: dropId || null,
          periodId: periodId || null,
          reason,
          apply,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as RepairApplied & {
        plan?: {
          add?: string;
          drop?: string | null;
          addMatch?: { label: string; kickoffAt: string } | null;
        };
      };
      const m = repairMsg(res, body, (b) => {
        const plan = (
          b as {
            plan?: {
              add?: string;
              drop?: string | null;
              addMatch?: { label: string; kickoffAt: string } | null;
            };
          }
        ).plan;
        return `+${plan?.add ?? "?"}${plan?.drop ? ` / −${plan.drop}` : " (open slot)"}${
          plan?.addMatch ? ` · ${plan.addMatch.label} @ ${plan.addMatch.kickoffAt}` : ""
        }.`;
      });
      setMsg(m);
      if (res.ok && body.status === "applied") {
        setReason("");
        onDone();
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
        void submit(true);
      }}
    >
      <div className="adm-form-h">
        Roster add / add-drop{" "}
        <span className="adm-form-sub">window + eligibility bypass · cap and ownership kept</span>
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor="rp-add-search">
          Add (live-unowned pool)
        </label>
        <input
          id="rp-add-search"
          className="adm-input"
          placeholder="Search the free-agent pool…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="adm-select"
          value={addId}
          onChange={(e) => setAddId(e.target.value)}
          size={Math.min(8, Math.max(3, shown.length))}
        >
          {shown.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name} · {p.position}
              {p.teamName ? ` · ${p.teamName}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor="rp-drop">
          Drop (unlocked only — a locked-by-play drop is refused)
        </label>
        <select
          id="rp-drop"
          className="adm-select"
          value={dropId}
          onChange={(e) => setDropId(e.target.value)}
        >
          <option value="">(none — open slot)</option>
          {view.roster.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name} · {p.position}
            </option>
          ))}
        </select>
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor="rp-pin">
          Period pin (optional — scopes the snapshot + kickoff guard)
        </label>
        <select
          id="rp-pin"
          className="adm-select"
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
        >
          <option value="">(none — the add&rsquo;s next fixture)</option>
          {view.periods.map((p) => (
            <option key={p.periodId} value={p.periodId}>
              {p.label}
              {p.frozen ? " ❄ frozen" : ""}
            </option>
          ))}
        </select>
      </div>
      <input
        className="adm-input"
        placeholder="Reason (required — recorded to the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="adm-form-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          Preview (dry-run)
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Apply
        </button>
        {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
      </div>
    </form>
  );
}

function TrimForm({ view, onDone }: { view: CommishRepairView; onDone: () => void }) {
  const managerId = view.selectedManagerId!;
  const [dropIds, setDropIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  const after = view.roster.length - dropIds.size;
  const toggle = (id: string) =>
    setDropIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(apply: boolean) {
    if (dropIds.size === 0)
      return setMsg({ ok: false, text: "Pick at least one player to release." });
    if (reason.trim() === "") return setMsg({ ok: false, text: "A reason is required." });
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/commish/roster", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "trim",
          managerId,
          dropPlayerIds: [...dropIds],
          reason,
          apply,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as RepairApplied & {
        plan?: {
          before?: number;
          after?: number;
          rosterCap?: number;
          dropNames?: string[];
          unfillable?: boolean;
        };
      };
      const m = repairMsg(res, body, (b) => {
        const plan = (
          b as {
            plan?: {
              before?: number;
              after?: number;
              rosterCap?: number;
              dropNames?: string[];
              unfillable?: boolean;
            };
          }
        ).plan;
        return `${plan?.before ?? "?"} → ${plan?.after ?? "?"} (cap ${plan?.rosterCap ?? "?"}): −${(plan?.dropNames ?? []).join(", −")}.${
          plan?.unfillable ? " ⚠ the remaining squad cannot field a legal playoff XI." : ""
        }`;
      });
      setMsg(m);
      if (res.ok && body.status === "applied") {
        setDropIds(new Set());
        setReason("");
        onDone();
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
        void submit(true);
      }}
    >
      <div className="adm-form-h">
        Trim / multi-drop{" "}
        <span className="adm-form-sub">
          playoff phase only · unlocked players only · {view.roster.length} → {after} (cap{" "}
          {view.rosterCap})
        </span>
      </div>
      {!view.playoffPhase && (
        <p className="adm-hint">The league is not in its playoff phase — a trim will be refused.</p>
      )}
      <div className="adm-checklist" role="group" aria-label="Players to release">
        {view.roster.map((p) => (
          <label key={p.playerId} className="adm-check">
            <input
              type="checkbox"
              checked={dropIds.has(p.playerId)}
              onChange={() => toggle(p.playerId)}
            />
            <span>
              {p.name} · {p.position}
            </span>
          </label>
        ))}
      </div>
      <input
        className="adm-input"
        placeholder="Reason (required — recorded to the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="adm-form-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          Preview (dry-run)
        </button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Apply trim
        </button>
        {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
      </div>
    </form>
  );
}

function LineupRepairForm({
  view,
  onPeriod,
  onDone,
}: {
  view: CommishRepairView;
  onPeriod: (periodId: string) => void;
  onDone: () => void;
}) {
  const managerId = view.selectedManagerId!;
  const [starters, setStarters] = useState<Set<string>>(new Set(view.currentStarterIds));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  const period = view.periods.find((p) => p.periodId === view.selectedPeriodId) ?? null;
  const xiSize = period?.kind === "knockout_round" ? 7 : 11;
  const toggle = (id: string) =>
    setStarters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(apply: boolean) {
    if (!view.selectedPeriodId) return setMsg({ ok: false, text: "Pick a period first." });
    if (reason.trim() === "") return setMsg({ ok: false, text: "A reason is required." });
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/commish/lineup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          managerId,
          periodId: view.selectedPeriodId,
          starterIds: [...starters],
          reason,
          apply,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as RepairApplied & {
        plan?: { before?: string[]; after?: string[] };
      };
      const m = repairMsg(res, body, (b) => {
        const plan = (b as { plan?: { before?: string[]; after?: string[] } }).plan;
        return `XI set for ${period?.label ?? "?"} (${plan?.after?.length ?? starters.size} starters).`;
      });
      setMsg(m);
      if (res.ok && body.status === "applied") {
        setReason("");
        onDone();
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setPending(false);
    }
  }

  const byPosition = new Map<string, CommishRosterPlayer[]>();
  for (const p of view.roster) {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }

  return (
    <form
      className="adm-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(true);
      }}
    >
      <div className="adm-form-h">
        Lineup repair{" "}
        <span className="adm-form-sub">
          edit-window bypass · formation/XI kept · locked-by-play slots never moved
        </span>
      </div>
      <div className="adm-field">
        <label className="t-label" htmlFor="rp-period">
          Period
        </label>
        <select
          id="rp-period"
          className="adm-select"
          value={view.selectedPeriodId ?? ""}
          onChange={(e) => onPeriod(e.target.value)}
        >
          <option value="">Select a period…</option>
          {view.periods.map((p) => (
            <option key={p.periodId} value={p.periodId}>
              {p.label} · {p.status}
              {p.frozen ? " ❄ frozen" : ""}
            </option>
          ))}
        </select>
      </div>
      {view.selectedPeriodId ? (
        <>
          <p className="adm-hint">
            Starters: {starters.size} / {xiSize} required.
          </p>
          {[...byPosition.entries()].map(([pos, list]) => (
            <div key={pos} className="adm-checklist" role="group" aria-label={`${pos} starters`}>
              {list.map((p) => (
                <label key={p.playerId} className="adm-check">
                  <input
                    type="checkbox"
                    checked={starters.has(p.playerId)}
                    onChange={() => toggle(p.playerId)}
                  />
                  <span>
                    {p.name} · {p.position}
                  </span>
                </label>
              ))}
            </div>
          ))}
          <input
            className="adm-input"
            placeholder="Reason (required — recorded to the audit log)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="adm-form-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => void submit(false)}
            >
              Preview (dry-run)
            </button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
              Apply lineup
            </button>
            {msg && <span className={msg.ok ? "adm-msg is-ok" : "adm-msg is-err"}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <p className="adm-hint">Pick a period to edit that matchday&rsquo;s XI.</p>
      )}
    </form>
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

// ── general stat-line editor (2b): override any SCORED feed stat ───────────────────────────────────
const STAT_GROUPS: string[] = [...new Set(STAT_FIELD_META.map((f) => f.group))];

/** Does a field score for the role actually played? A value entered for a non-scoring role is a points
 *  no-op (the engine role-gates GK / outfield lines); we dim it rather than block it. */
function scoresForRole(scoresFor: "all" | "outfield" | "gk", role: Position | null): boolean {
  if (scoresFor === "all" || role === null) return true;
  return scoresFor === "gk" ? role === "GK" : role !== "GK";
}

function emptyStatValues(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const f of STAT_FIELD_META) m[f.key] = "";
  return m;
}

function StatLineEditor({
  target,
  current,
  role,
  onDone,
}: {
  target: FormTarget;
  current: CommishStatCurrent;
  role: Position | null;
  onDone: () => void;
}) {
  // Prefill each input with the CURRENT override (blank = no override → the field falls back to the feed).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const m = emptyStatValues();
    for (const f of STAT_FIELD_META) {
      const ov = current.statOverrides[f.key];
      if (ov != null) m[f.key] = String(ov);
    }
    return m;
  });
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<FormMsg>(null);

  const overrideCount = STAT_FIELD_META.filter((f) => (values[f.key] ?? "").trim() !== "").length;

  async function submit(clearAll: boolean) {
    if (reason.trim() === "") {
      setMsg({ ok: false, text: "A reason is required." });
      return;
    }
    // The overlay is ABSOLUTE: every non-blank input is a SET; a blanked field is simply omitted → cleared
    // (feed passthrough). "Clear all overrides" posts an empty map.
    const overrides: Record<string, number> = {};
    if (!clearAll) {
      for (const f of STAT_FIELD_META) {
        const raw = (values[f.key] ?? "").trim();
        if (raw === "") continue;
        const num = Number(raw);
        if (!Number.isInteger(num) || num < 0) {
          setMsg({ ok: false, text: `${f.label} must be a whole number ≥ 0.` });
          return;
        }
        overrides[f.key] = num;
      }
    }
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/commish/stat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: target.selectedMatchId,
          playerId: target.selectedPlayerId,
          overrides,
          reason,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        delta?: string;
        error?: string;
        scored?: boolean;
      };
      if (res.ok) {
        if (clearAll) setValues(emptyStatValues());
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
        Stat line{" "}
        <span className="adm-form-sub">
          override any scored feed stat · re-scores through the engine
        </span>
      </div>
      {!current.hasStatRow && (
        <div className="adm-hint">
          No feed stat line for this player yet — an override is stored and applies once the feed
          records them.
        </div>
      )}
      {STAT_GROUPS.map((group) => (
        <div className="adm-statgroup" key={group}>
          <div className="adm-statgroup-h t-label">{group}</div>
          <div className="adm-statgrid">
            {STAT_FIELD_META.filter((f) => f.group === group).map((f) => {
              const feed = current.feedStats[f.key];
              const dim = !scoresForRole(f.scoresFor, role);
              return (
                <label className={dim ? "adm-statfield is-dim" : "adm-statfield"} key={f.key}>
                  <span className="adm-statfield-l">
                    {f.label}
                    {dim && <span className="adm-statfield-gate"> · n/a for {role}</span>}
                  </span>
                  <span className="adm-statfield-feed">feed {feed ?? "—"}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="adm-num adm-statfield-in"
                    placeholder={feed != null ? String(feed) : "—"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <input
        className="adm-input"
        placeholder="Reason (required — recorded to the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="adm-form-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Save stat line
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending || overrideCount === 0}
          onClick={() => void submit(true)}
        >
          Clear all overrides
        </button>
        <span className="adm-preview">
          {overrideCount} override{overrideCount === 1 ? "" : "s"}
        </span>
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
  round_advance: { label: "Round cut applied", tone: "danger" },
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
