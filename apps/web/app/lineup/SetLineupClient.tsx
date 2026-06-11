"use client";

/**
 * The set-lineup client shell. It owns the working per-period XI edits, the tap-to-swap interaction, and
 * the ONE write path (the gated `POST /api/lineup`). Locked players are frozen here (presentation), but
 * the server is the real latch: `submitLineup` posts the session manager id and the route re-validates
 * against the authoritative lock state. Legality feedback comes from the SAME `evaluateProposal`
 * (→ `@app/lineup` `validateLineup`) the server enforces, so "Save" is disabled exactly when the server
 * would reject. Live points / realtime belong to the "vs the field" surface (a later prompt).
 */
import { useCallback, useMemo, useState } from "react";
import { submitLineup } from "../../src/lineup/lineupClient";
import {
  buildPitch,
  canSwap,
  evaluateProposal,
  formationKeyOf,
  GROUP_FORMATIONS,
  isMovable,
  offeredFormations,
  reshapeToFormation,
  swapStarters,
} from "../../src/lineup/view";
import type { SetLineupState } from "../../src/lineup/types";
import { Bench, FormationPicker, LockHero, PeriodTabs, Pitch, SaveBar } from "./components";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export function SetLineupClient({ initialState }: { initialState: SetLineupState }) {
  const { squad, sessionManagerId, periods, timezone } = initialState;

  const [activeId, setActiveId] = useState(initialState.activePeriodId);
  const [lineups, setLineups] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(periods.map((p) => [p.periodId, p.starterIds])),
  );
  const [savedLineups, setSavedLineups] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(periods.map((p) => [p.periodId, p.starterIds])),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const period = useMemo(() => periods.find((p) => p.periodId === activeId)!, [periods, activeId]);
  const starterIds = lineups[activeId] ?? period.starterIds;

  const view = useMemo(
    () => buildPitch(squad, { ...period, starterIds }),
    [squad, period, starterIds],
  );

  // Re-sample the clock on each edit / period switch so the window check stays fresh (presentation only;
  // the server clock is authoritative).
  const now = useMemo(() => new Date(), [activeId, starterIds]);
  const validation = useMemo(
    () => evaluateProposal(squad, period, starterIds, now),
    [squad, period, starterIds, now],
  );

  const editable =
    period.status !== "closed" &&
    (!period.closesAt || now.getTime() < new Date(period.closesAt).getTime());
  const dirty = !sameSet(starterIds, savedLineups[activeId] ?? period.starterIds);
  const reason = validation.ok ? null : validation.error.message;

  const eligibleIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (const p of squad) if (canSwap(period, squad, starterIds, selected, p.id)) set.add(p.id);
    return set;
  }, [selected, squad, period, starterIds]);

  // The shapes this manager can actually field right now = roster-fillable ∩ lock-legal. Only these are
  // offered, so every pick lands on a complete, immediately-savable XI (the fix for an unfieldable default).
  const offered = useMemo(() => offeredFormations(squad, period.locks), [squad, period.locks]);
  const activeFormation = useMemo(() => formationKeyOf(squad, starterIds), [squad, starterIds]);

  // Pick a formation → reshape the starter set to it (locked starters kept, movable reserves promoted),
  // then the existing swap + validate + save flow takes over. No new write path.
  const onPickFormation = useCallback(
    (formation: string) => {
      const counts = GROUP_FORMATIONS[formation as keyof typeof GROUP_FORMATIONS];
      if (!counts) return;
      const next = reshapeToFormation(squad, starterIds, period.locks, counts);
      setLineups((all) => ({ ...all, [activeId]: next }));
      setSelected(null);
      setJustSaved(false);
    },
    [squad, period.locks, starterIds, activeId],
  );

  const onSelect = useCallback(
    (playerId: string) => {
      if (!isMovable(period, playerId)) return; // locked → frozen, ignore taps
      if (selected === null) {
        setSelected(playerId);
        return;
      }
      if (selected === playerId) {
        setSelected(null);
        return;
      }
      if (canSwap(period, squad, starterIds, selected, playerId)) {
        // canSwap guarantees exactly one of the two is a starter — swap the starter out for the bench one.
        const selStarter = starterIds.includes(selected);
        const next = selStarter
          ? swapStarters(starterIds, selected, playerId)
          : swapStarters(starterIds, playerId, selected);
        setLineups((all) => ({ ...all, [activeId]: next }));
        setJustSaved(false);
        setSelected(null);
        return;
      }
      setSelected(playerId); // not a legal target → move the selection instead
    },
    [period, squad, selected, starterIds, activeId],
  );

  const onSelectPeriod = useCallback((periodId: string) => {
    setActiveId(periodId);
    setSelected(null);
    setJustSaved(false);
    setToast(null);
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    setToast(null);
    const res = await submitLineup(
      { managerId: sessionManagerId, periodId: activeId, starterIds },
      { fetch: (input, init) => fetch(input, init) },
    );
    setSaving(false);
    if (res.ok) {
      setSavedLineups((all) => ({ ...all, [activeId]: [...starterIds] }));
      setJustSaved(true);
      setToast({ kind: "success", text: "Lineup saved." });
    } else {
      setToast({ kind: "error", text: res.error.message });
    }
  }, [sessionManagerId, activeId, starterIds]);

  const movable = squad.filter((p) => isMovable(period, p.id)).length;

  return (
    <div className="sl-screen">
      <header className="sl-topbar between">
        <div className="sl-topbar-id">
          <h1 className="t-h2">Set lineup</h1>
          <span className="t-sm text-tertiary">{initialState.displayName}</span>
        </div>
        <PeriodTabs periods={periods} activeId={activeId} onSelect={onSelectPeriod} />
      </header>

      <LockHero
        formationLabel={view.formationLabel}
        movable={movable}
        locked={squad.length - movable}
        dirty={dirty}
        justSaved={justSaved && !dirty}
      />

      <div className="sl-body">
        <section className="sl-pitchcol">
          <FormationPicker
            offered={offered}
            active={activeFormation}
            disabled={!editable}
            onPick={onPickFormation}
          />
          <Pitch
            view={view}
            selected={selected}
            eligibleIds={eligibleIds}
            timezone={timezone}
            onSelect={onSelect}
          />
          {/* Two-state legend: the authoritative lock is the binary `lineup_slot.locked_at` projection
              (movable vs locked) — the design's third "Locked · playing" row needs the live feed (the
              vs-the-field surface), so it's deferred. The locked label matches the LockTag chip ("Locked")
              rather than over-claiming "played": a locked-on-play man may still be on the pitch. */}
          <div className="sl-legend t-caption text-tertiary">
            <span>
              <span className="sl-dot sl-dot-movable" /> Movable — still swappable
            </span>
            <span>
              <span className="sl-dot sl-dot-locked" /> Locked — has played, frozen
            </span>
          </div>
        </section>

        <aside className="sl-rail">
          <p className="sl-hint t-sm">
            {selected
              ? "Tap a highlighted teammate to swap start/bench — this can change your formation."
              : "Tap a movable player, then a teammate to swap start ↔ bench (the formation updates; Save locks if it’s illegal). Locked players are frozen."}
          </p>
          <Bench
            bench={view.bench}
            selected={selected}
            eligibleIds={eligibleIds}
            timezone={timezone}
            onSelect={onSelect}
          />
        </aside>
      </div>

      <SaveBar
        canSave={validation.ok && editable}
        reason={reason}
        saving={saving}
        editable={editable}
        onSave={onSave}
      />

      {toast && (
        <div
          role="status"
          className={`toast ${toast.kind === "success" ? "toast-success" : "toast-danger"}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
