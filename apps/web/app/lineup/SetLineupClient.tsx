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
  classifySlot,
  evaluateProposal,
  fillEligibleIds,
  formationKeyOf,
  formationSetForKind,
  isMovable,
  offeredFormations,
  reshapeToFormation,
  swapStarters,
} from "../../src/lineup/view";
import { PLAYOFF_ROSTER, STARTING_XI_SIZE } from "@app/shared";
import type { SetLineupState } from "../../src/lineup/types";
import {
  Bench,
  ForfeitConfirmSheet,
  FormationPicker,
  LockHero,
  PeriodTabs,
  Pitch,
  SaveBar,
} from "./components";
import { PlayerScoreSheet } from "@/components/PlayerScoreSheet";

/** Stable empty set for periods with no forfeit confirms — keeps memo deps referentially clean. */
const EMPTY_FORFEITS: ReadonlySet<string> = new Set();

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
  // Score modal state: which player's breakdown is open (null = closed).
  const [scorePlayerId, setScorePlayerId] = useState<string | null>(null);
  // C2 forfeit state. Confirms are PER-PERIOD (keyed by periodId), exactly like `lineups` above — NOT a
  // single global Set. The benched-and-saved working set in `lineups[periodId]` survives a period switch;
  // its matching forfeit confirm must survive with it (T7). If it didn't, switching away and back would
  // re-validate a benched played starter with NO confirm, and validateLineup rule 4c would paint a spurious
  // `forfeit-requires-confirm` against stale (never-refetched) `slotMeta`/`locks`. `forfeitingPlayer` is the
  // transient in-flight confirm (a modal); it stays a single value (only one sheet is ever open).
  const [forfeitsByPeriod, setForfeitsByPeriod] = useState<Record<string, ReadonlySet<string>>>(
    () => ({}),
  );
  const [forfeitingPlayer, setForfeitingPlayer] = useState<{
    playerId: string;
    displayName: string;
    pointsAtStake: number;
  } | null>(null);

  const period = useMemo(() => periods.find((p) => p.periodId === activeId)!, [periods, activeId]);
  const starterIds = lineups[activeId] ?? period.starterIds;

  // The forfeit confirms for the ACTIVE period (stable empty ref when none → clean memo deps below).
  const pendingForfeits = forfeitsByPeriod[activeId] ?? EMPTY_FORFEITS;
  const setActivePeriodForfeits = useCallback(
    (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) => {
      setForfeitsByPeriod((all) => ({
        ...all,
        [activeId]: update(all[activeId] ?? EMPTY_FORFEITS),
      }));
    },
    [activeId],
  );

  const view = useMemo(
    () => buildPitch(squad, { ...period, starterIds }),
    [squad, period, starterIds],
  );

  // Re-sample the clock on each edit / period switch so the window check stays fresh (presentation only;
  // the server clock is authoritative).
  const now = useMemo(() => new Date(), [activeId, starterIds]);
  // C2: thread pendingForfeits so the Save button enables after the confirm sheet fires.
  const validation = useMemo(
    () => evaluateProposal(squad, period, starterIds, now, pendingForfeits),
    [squad, period, starterIds, now, pendingForfeits],
  );

  const editable =
    period.status !== "closed" &&
    (!period.closesAt || now.getTime() < new Date(period.closesAt).getTime());
  const dirty = !sameSet(starterIds, savedLineups[activeId] ?? period.starterIds);
  const reason = validation.ok ? null : validation.error.message;

  const eligibleIds = useMemo(() => {
    if (!selected) return new Set<string>();
    // Post-confirm fill: selected player is a pending forfeit (still in XI) — show position-legal
    // unplayed bench players as eligible targets (canSwap would fail the isMovable guard for him).
    if (pendingForfeits.has(selected)) return fillEligibleIds(period, squad, starterIds, selected);
    const set = new Set<string>();
    for (const p of squad) if (canSwap(period, squad, starterIds, selected, p.id)) set.add(p.id);
    return set;
  }, [selected, squad, period, starterIds, pendingForfeits]);

  // The formation offer-set is PERIOD-DRIVEN: a knockout_round period switches to the playoff reduced
  // vocabulary (FORMATIONS_PO — 2-3-1 / 3-2-1 / 2-2-2, 7 starters); every other window is the 11-man
  // group set. This is the one switch that turns the screen into the reduced variant.
  const formationSet = useMemo(() => formationSetForKind(period.kind), [period.kind]);

  // The shapes this manager can actually field right now = roster-fillable ∩ lock-legal, within the
  // active mode's offer set. Only these are offered, so every pick lands on a complete, savable XI.
  const offered = useMemo(
    () => offeredFormations(squad, period.locks, formationSet),
    [squad, period.locks, formationSet],
  );
  const activeFormation = useMemo(() => formationKeyOf(squad, starterIds), [squad, starterIds]);

  // Pick a formation → reshape the starter set to it (locked starters kept, movable reserves promoted),
  // then the existing swap + validate + save flow takes over. No new write path. The shape is resolved
  // in the active mode's offer set, so a playoff window reshapes to a FORMATIONS_PO shape (7 starters).
  const onPickFormation = useCallback(
    (formation: string) => {
      const counts = formationSet.formations[formation];
      if (!counts) return;
      const next = reshapeToFormation(squad, starterIds, period.locks, counts);
      setLineups((all) => ({ ...all, [activeId]: next }));
      setSelected(null);
      setJustSaved(false);
    },
    [squad, period.locks, starterIds, activeId, formationSet],
  );

  const onScore = useCallback((playerId: string) => setScorePlayerId(playerId), []);

  // Triggered by the "Bench & forfeit" button inside the PlayerScoreSheet modal. Closes the modal,
  // then either shows a no-fill toast or opens the standalone ForfeitConfirmSheet.
  const onForfeitFromModal = useCallback(() => {
    if (!scorePlayerId) return;
    const p = squad.find((q) => q.id === scorePlayerId);
    if (!p) return;
    const eligibles = fillEligibleIds(period, squad, starterIds, scorePlayerId);
    setScorePlayerId(null);
    if (eligibles.size === 0) {
      setToast({
        kind: "error",
        text: `No unplayed ${p.position} reserve available — can't bench ${p.displayName} right now.`,
      });
      return;
    }
    setForfeitingPlayer({
      playerId: scorePlayerId,
      displayName: p.displayName,
      pointsAtStake: period.slotMeta[scorePlayerId]?.pointsAtStake ?? 0,
    });
  }, [scorePlayerId, period, squad, starterIds]);

  const onSelect = useCallback(
    (playerId: string) => {
      // Played-starter taps are routed to onScore (score modal) by PitchToken.handleClick; this
      // guard is a defensive belt-and-suspenders in case the token calls onSelect directly.
      const kind = classifySlot(period, playerId, starterIds.includes(playerId));
      if (kind === "played-starter") {
        setScorePlayerId(playerId);
        return;
      }

      // C2 path B: post-confirm fill step — selected player is a pending forfeit (still in XI).
      if (selected !== null && pendingForfeits.has(selected)) {
        if (playerId === selected) {
          // Tap same player again → full undo: remove from pendingForfeits, return to played-starter state.
          setActivePeriodForfeits((prev) => {
            const next = new Set(prev);
            next.delete(selected);
            return next;
          });
          setSelected(null);
          return;
        }
        // Check fill eligibility inline (avoids capturing the memoised Set in the dep array).
        if (fillEligibleIds(period, squad, starterIds, selected).has(playerId)) {
          // Swap: forfeit player exits XI, eligible reserve enters.
          const next = swapStarters(starterIds, selected, playerId);
          setLineups((all) => ({ ...all, [activeId]: next }));
          setJustSaved(false);
          setSelected(null);
          return;
        }
        // Non-eligible tap during fill step → ignore (never surface an action the engine rejects).
        return;
      }

      // C1 path: locked / played-bench / voided → frozen, ignore taps.
      if (!isMovable(period, playerId)) return;
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
    [period, squad, selected, starterIds, activeId, pendingForfeits, setActivePeriodForfeits],
  );

  const onConfirmForfeit = useCallback(() => {
    if (!forfeitingPlayer) return;
    const { playerId } = forfeitingPlayer;
    setActivePeriodForfeits((prev) => new Set([...prev, playerId]));
    setSelected(playerId); // enter the fill step: selected = forfeit player, eligibles highlight
    setForfeitingPlayer(null);
    setJustSaved(false);
  }, [forfeitingPlayer, setActivePeriodForfeits]);

  const onCancelForfeit = useCallback(() => {
    // Full undo: if somehow pre-confirmed, remove; always close the sheet.
    if (forfeitingPlayer) {
      setActivePeriodForfeits((prev) => {
        const next = new Set(prev);
        next.delete(forfeitingPlayer.playerId);
        return next;
      });
    }
    setForfeitingPlayer(null);
  }, [forfeitingPlayer, setActivePeriodForfeits]);

  // Props forwarded to PlayerScoreSheet so the in-modal "Bench & forfeit" button appears only for
  // played starters (the one case where forfeit is a legal next action).
  const forfeitPropsForModal = useMemo(() => {
    if (!scorePlayerId) return undefined;
    const kind = classifySlot(period, scorePlayerId, starterIds.includes(scorePlayerId));
    if (kind !== "played-starter") return undefined;
    const p = squad.find((q) => q.id === scorePlayerId);
    if (!p) return undefined;
    return {
      playerName: p.displayName,
      pointsAtStake: period.slotMeta[scorePlayerId]?.pointsAtStake ?? 0,
      onForfeit: onForfeitFromModal,
    };
  }, [scorePlayerId, period, squad, starterIds, onForfeitFromModal]);

  const onSelectPeriod = useCallback((periodId: string) => {
    setActiveId(periodId);
    setSelected(null);
    setJustSaved(false);
    setToast(null);
    // C2/T7: a period switch does NOT clear forfeit confirms — they're per-period state
    // (forfeitsByPeriod), so each period keeps its own and returning here keeps rule 4c green against
    // the stale (never-refetched) slotMeta/locks. Only the in-flight confirm sheet (a single open
    // modal) is dismissed.
    setForfeitingPlayer(null);
    setScorePlayerId(null);
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    setToast(null);
    const forfeitConfirmedPlayerIds = pendingForfeits.size > 0 ? [...pendingForfeits] : undefined;
    const res = await submitLineup(
      { managerId: sessionManagerId, periodId: activeId, starterIds, forfeitConfirmedPlayerIds },
      { fetch: (input, init) => fetch(input, init) },
    );
    setSaving(false);
    if (res.ok) {
      setSavedLineups((all) => ({ ...all, [activeId]: [...starterIds] }));
      setJustSaved(true);
      setToast({ kind: "success", text: "Lineup saved." });
      // Deliberately DO NOT clear pendingForfeits here. The server has committed the forfeits, but the
      // local `period.locks`/`slotMeta` are immutable SSR props that still model the just-benched player
      // as an un-voided played STARTER (they aren't refetched after a save). Clearing the confirm would
      // make the post-save re-validation (evaluateProposal → validateLineup, rule 4c) re-demand a confirm
      // and paint a spurious `forfeit-requires-confirm` error beside the "Lineup saved." toast. Keeping
      // the confirm keeps the no-op re-validation green; it's inert server-side on any re-save (the
      // controller derives voids from its OWN authoritative slot state). Confirms are per-period state
      // (forfeitsByPeriod), so they survive a period switch too (T7) — returning to this period keeps the
      // confirm; a full reload loads the slot as voided + benched, which never re-trips the rule.
    } else {
      setToast({ kind: "error", text: res.error.message });
    }
  }, [sessionManagerId, activeId, starterIds, pendingForfeits]);

  const movable = squad.filter((p) => isMovable(period, p.id)).length;

  // Reduced-roster mode is period-driven (DECISIONS Theme B): a knockout window is the 7+2 guillotine
  // squad, not the 11-man group XI. Surface it in the hero so the manager knows which roster he's setting.
  // The size is the spec constant (PLAYOFF_ROSTER.starters / STARTING_XI_SIZE) — never a second source.
  const isPlayoffMode = period.kind === "knockout_round";
  const rosterLabel = `${isPlayoffMode ? "Playoff XI" : "Starting XI"} · ${
    isPlayoffMode ? PLAYOFF_ROSTER.starters : STARTING_XI_SIZE
  } starters`;

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
        rosterLabel={rosterLabel}
        movable={movable}
        locked={squad.length - movable}
        dirty={dirty}
        justSaved={justSaved && !dirty}
      />

      {/* The formation picker sits directly under the FORMATION panel (the LockHero) — where a manager
          looks to change shape. It offers only fieldable ∩ lock-legal shapes; a pick reshapes the XI. */}
      <FormationPicker
        offered={offered}
        active={activeFormation}
        disabled={!editable}
        onPick={onPickFormation}
      />

      <div className="sl-body">
        <section className="sl-pitchcol">
          <Pitch
            view={view}
            selected={selected}
            eligibleIds={eligibleIds}
            timezone={timezone}
            onSelect={onSelect}
            onScore={onScore}
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
              : "Pick a formation above to reshape your XI, then tap a movable player and a teammate to swap start ↔ bench. Save locks if the shape is illegal; locked players are frozen."}
          </p>
          <Bench
            bench={view.bench}
            selected={selected}
            eligibleIds={eligibleIds}
            timezone={timezone}
            onSelect={onSelect}
            onScore={onScore}
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

      {forfeitingPlayer && (
        <ForfeitConfirmSheet
          playerName={forfeitingPlayer.displayName}
          pointsAtStake={forfeitingPlayer.pointsAtStake}
          onConfirm={onConfirmForfeit}
          onCancel={onCancelForfeit}
        />
      )}

      {scorePlayerId && (
        <PlayerScoreSheet
          periodId={activeId}
          playerId={scorePlayerId}
          onClose={() => setScorePlayerId(null)}
          forfeitProps={forfeitPropsForModal}
        />
      )}
    </div>
  );
}
