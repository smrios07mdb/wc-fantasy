/**
 * Presentational components for the set-lineup screen, mapped to the design reference
 * `design/design_reference/setlineup/*` + `shell/*` (see design/COMPONENT_MAP.md):
 *
 *   Pos          ← the canonical position badge (.pos)               · setlineup/components.jsx <Pos/>
 *   LockTag      ← lock-on-play status pill (Movable / Locked)       · setlineup/components.jsx <LockTag/>
 *   PitchToken   ← a player node on the formation pitch              · setlineup/components.jsx <PitchToken/>
 *   Pitch        ← the tall vertical pitch, lanes FWD→GK             · setlineup/components.jsx <Pitch/>
 *   Bench/Row    ← the position-grouped bench rail                   · setlineup/components.jsx <Bench/>
 *   PeriodTabs   ← current + upcoming window tabs                    · setlineup/components.jsx period tabs
 *   LockHero     ← movable/locked summary + save status             · setlineup/components.jsx <LockHero/>
 *   SaveBar      ← save action + live legality reason               · (the explicit-save replacement for
 *                                                                       the prototype's autosave chip)
 *
 * These render only — they hold no lineup truth. The live ScorePill / PlayerScoreSheet (live points) and
 * the flag-kit jerseys belong to the "vs the field" surface (a later prompt) and are intentionally absent
 * here: this is the first lineup surface and live points are out of scope.
 *
 * DELIBERATE SIMPLIFICATION: the design reference's first-class `FormationPicker` (segmented shapes +
 * `reshape()`) is replaced here by direct start↔bench swaps — including CROSS-position outfield swaps
 * (GK kept on its own side) — so the manager reshapes the formation (4-4-2 → 3-4-3 / 4-3-3 / 5-3-2 / …)
 * by swapping, with `validateLineup` surfacing any illegal shape as live "save disabled + why". A
 * dedicated segmented FormationPicker (TODO(prompt-NN)) is a faithful follow-up; the legality core already
 * supports it unchanged.
 */
import type { Position } from "@app/shared";
import { formatInLeagueTz } from "@app/shared";
import type { PitchSlot, PitchView } from "../../src/lineup/view";
import type { LineupPlayer, PeriodLineup } from "../../src/lineup/types";
import { PlayerAvatar } from "../../components/PlayerAvatar";

const LANE_ORDER: Position[] = ["FWD", "MID", "DEF", "GK"];

/** "F. Surname" — first initial + surname (design convention), falling back to the display name. */
export function shortName(p: LineupPlayer): string {
  if (p.firstName && p.lastName) return `${p.firstName[0]}. ${p.lastName}`;
  return p.lastName ?? p.displayName;
}

/** A player's fixture kickoff = his lock/sub deadline, in the league wall clock; "TBD" when unresolved. */
export function KickoffTag({
  kickoffAt,
  timezone,
  className,
}: {
  kickoffAt: string | null;
  timezone: string;
  className: string;
}) {
  const text = kickoffAt ? formatInLeagueTz(new Date(kickoffAt), timezone) : "TBD";
  return (
    <span className={className} title={kickoffAt ? `Kicks off · locks at ${text}` : "Fixture TBD"}>
      {text}
    </span>
  );
}

export function Pos({ position }: { position: Position }) {
  return <span className={`pos pos-${position}`}>{position}</span>;
}

function IcoLock() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path
        fill="currentColor"
        d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z"
      />
    </svg>
  );
}

function IcoOpen() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/** Movable ⇒ yet-to-play caution pill; locked ⇒ steel "locked" pill (always colour + icon + word). */
export function LockTag({ movable, mini }: { movable: boolean; mini?: boolean }) {
  return (
    <span
      className={`pill ${movable ? "pill-ytp" : "pill-locked"} ${mini ? "sl-locktag-mini" : ""}`}
    >
      {movable ? <IcoOpen /> : <IcoLock />}
      {movable ? "Movable" : "Locked"}
    </span>
  );
}

export interface TokenProps {
  slot: PitchSlot;
  selected: boolean;
  eligible: boolean;
  /** League IANA tz — formats the per-player kickoff/lock deadline. */
  timezone: string;
  onSelect: (playerId: string) => void;
}

export function PitchToken({ slot, selected, eligible, timezone, onSelect }: TokenProps) {
  const { player, movable } = slot;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";
  return (
    <button
      type="button"
      className={`sl-tok st-${state} ${movable ? "is-movable" : "is-locked"}`}
      // Locked players are non-draggable / non-selectable — the freeze the manager sees.
      draggable={false}
      aria-disabled={!movable}
      disabled={!movable && !eligible}
      onClick={() => onSelect(player.id)}
      title={`${player.displayName} · ${player.position} · ${movable ? "movable" : "locked"}`}
    >
      <span className="sl-tok-top">
        <PlayerAvatar
          displayName={player.displayName}
          firstName={player.firstName}
          lastName={player.lastName}
          country={player.country}
          position={player.position}
          size="sm"
        />
        {!movable && <IcoLock />}
      </span>
      <span className="sl-tok-name">{shortName(player)}</span>
      <KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-tok-ko" />
    </button>
  );
}

export interface PitchProps {
  view: PitchView;
  selected: string | null;
  eligibleIds: ReadonlySet<string>;
  timezone: string;
  onSelect: (playerId: string) => void;
}

export function Pitch({ view, selected, eligibleIds, timezone, onSelect }: PitchProps) {
  return (
    <div className="sl-pitch">
      <div className="sl-pitch-lines" aria-hidden="true">
        <span className="sl-pl-box sl-pl-box-top" />
        <span className="sl-pl-goal sl-pl-goal-top" />
        <span className="sl-pl-mid" />
        <span className="sl-pl-circle" />
        <span className="sl-pl-box sl-pl-box-bot" />
        <span className="sl-pl-goal sl-pl-goal-bot" />
      </div>
      <div className="sl-pitch-lanes">
        {LANE_ORDER.map((pos) => (
          <div key={pos} className={`sl-lane sl-lane-${pos}`}>
            {view.lanes[pos].map((slot) => (
              <PitchToken
                key={slot.player.id}
                slot={slot}
                selected={selected === slot.player.id}
                eligible={eligibleIds.has(slot.player.id)}
                timezone={timezone}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenchRow({ slot, selected, eligible, timezone, onSelect }: TokenProps) {
  const { player, movable } = slot;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";
  return (
    <button
      type="button"
      className={`sl-bench-row st-${state} ${movable ? "is-movable" : "is-locked"}`}
      draggable={false}
      aria-disabled={!movable}
      disabled={!movable && !eligible}
      onClick={() => onSelect(player.id)}
    >
      <PlayerAvatar
        displayName={player.displayName}
        firstName={player.firstName}
        lastName={player.lastName}
        country={player.country}
        position={player.position}
        size="sm"
      />
      <span className="sl-bench-name">{shortName(player)}</span>
      <KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-bench-ko" />
      <LockTag movable={movable} mini />
    </button>
  );
}

export interface BenchProps {
  bench: PitchSlot[];
  selected: string | null;
  eligibleIds: ReadonlySet<string>;
  timezone: string;
  onSelect: (playerId: string) => void;
}

export function Bench({ bench, selected, eligibleIds, timezone, onSelect }: BenchProps) {
  return (
    <div className="sl-bench card">
      <div className="sl-bench-head between">
        <span className="t-label">Bench</span>
        <span className="t-caption text-tertiary">{bench.length} reserves</span>
      </div>
      <div className="sl-bench-list">
        {bench.map((slot) => (
          <BenchRow
            key={slot.player.id}
            slot={slot}
            selected={selected === slot.player.id}
            eligible={eligibleIds.has(slot.player.id)}
            timezone={timezone}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export interface PeriodTabsProps {
  periods: PeriodLineup[];
  activeId: string;
  onSelect: (periodId: string) => void;
}

export function PeriodTabs({ periods, activeId, onSelect }: PeriodTabsProps) {
  return (
    <div className="tabs sl-period-tabs" role="tablist">
      {periods.map((p) => (
        <button
          key={p.periodId}
          type="button"
          role="tab"
          aria-selected={p.periodId === activeId}
          className={`tab ${p.periodId === activeId ? "is-active" : ""}`}
          onClick={() => onSelect(p.periodId)}
        >
          {p.label}
          {p.status === "pending" && <span className="sl-tab-sub t-micro">upcoming</span>}
        </button>
      ))}
    </div>
  );
}

export interface LockHeroProps {
  formationLabel: string;
  movable: number;
  locked: number;
  /** The working XI differs from what's saved. */
  dirty: boolean;
  /** A save just landed (and nothing's been edited since) — distinct from "loaded, untouched". */
  justSaved: boolean;
}

/** Compact summary hero: the formation + how many players are still movable vs frozen + save status. */
export function LockHero({ formationLabel, movable, locked, dirty, justSaved }: LockHeroProps) {
  return (
    <div className="sl-hero card">
      <div className="sl-hero-formation">
        <span className="t-label text-tertiary">Formation</span>
        <span className="t-h2 mono">{formationLabel}</span>
      </div>
      <div className="sl-hero-stats">
        <div className="sl-hero-stat">
          <span className="sl-hero-num">{movable}</span>
          <span className="t-caption text-tertiary">movable</span>
        </div>
        <div className="sl-hero-stat">
          <span className="sl-hero-num sl-hero-num-locked">{locked}</span>
          <span className="t-caption text-tertiary">locked</span>
        </div>
      </div>
      <div className="sl-hero-saved">
        {dirty ? (
          <span className="pill pill-ytp">Unsaved changes</span>
        ) : justSaved ? (
          <span className="pill pill-win">Saved</span>
        ) : (
          <span className="pill">Up to date</span>
        )}
      </div>
    </div>
  );
}

export interface SaveBarProps {
  canSave: boolean;
  reason: string | null;
  saving: boolean;
  editable: boolean;
  onSave: () => void;
}

export function SaveBar({ canSave, reason, saving, editable, onSave }: SaveBarProps) {
  return (
    <div className="sl-savebar between">
      <span className={`sl-savebar-reason t-sm ${reason ? "is-error" : "text-tertiary"}`}>
        {!editable
          ? "This window is closed — lineups can no longer be edited."
          : (reason ?? "Lineup is legal — ready to save.")}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!canSave || saving || !editable}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save lineup"}
      </button>
    </div>
  );
}
