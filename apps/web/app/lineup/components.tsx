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
 *   FormationPicker ← segmented shape selector (offered set)        · setlineup/components.jsx <FormationPicker/>
 *   SaveBar      ← save action + live legality reason               · (the explicit-save replacement for
 *                                                                       the prototype's autosave chip)
 *
 * These render only — they hold no lineup truth. The live ScorePill / PlayerScoreSheet (live points) and
 * the flag-kit jerseys belong to the "vs the field" surface (a later prompt) and are intentionally absent
 * here: this is the first lineup surface and live points are out of scope.
 *
 * FORMATION CONTROL: the design reference's first-class `FormationPicker` (segmented shapes + `reshape()`)
 * is now implemented — it surfaces only the shapes the squad can actually field (fillable ∩ lock-legal,
 * derived by `offeredFormations`), and a pick `reshape`s the starter set through the SAME `validateLineup`
 * gate. This closes the Prompt-44 cap-lift consequence: a non-4-3-3-shaped squad (e.g. 3 DEF) can now pick
 * a fieldable shape instead of being stuck on a default it can't fill. Direct start↔bench swaps remain for
 * fine-tuning WITHIN a shape (GK kept on its own side); the validator stays the sole legality gate.
 */
import type { Position } from "@app/shared";
import { formatInLeagueTz } from "@app/shared";
import type { PitchSlot, PitchView, SlotKind } from "../../src/lineup/view";
import type { LineupPlayer, OpponentInfo, PeriodLineup } from "../../src/lineup/types";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { Flag } from "../draft/Flag";
import { toIso2 } from "../../src/draft/flag";

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

/** Opponent label: "vs 🇫🇷 France" (home) / "@ 🇫🇷 France" (away), or "TBD" when unresolved. */
export function OpponentTag({
  opponent,
  className,
}: {
  opponent: OpponentInfo | null;
  className: string;
}) {
  if (!opponent) {
    return (
      <span className={className} aria-label="Opponent TBD">
        TBD
      </span>
    );
  }
  const prefix = opponent.isHome ? "vs" : "@";
  return (
    <span className={className} title={`${prefix} ${opponent.opponentName}`}>
      {prefix}{" "}
      <Flag code={toIso2(opponent.opponentNation)} label={opponent.opponentNation ?? undefined} />
      {opponent.opponentName}
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

/** Bench-rail status pill: Movable / Locked / Forfeited — derived from the C2 slot classification. */
export function LockTag({ slotKind, mini }: { slotKind: SlotKind; mini?: boolean }) {
  const cls = mini ? "sl-locktag-mini" : "";
  if (slotKind === "voided") {
    return (
      <span className={`pill pill-danger ${cls}`}>
        <IcoLock />
        Forfeited
      </span>
    );
  }
  const isMovableKind = slotKind === "movable";
  return (
    <span className={`pill ${isMovableKind ? "pill-ytp" : "pill-locked"} ${cls}`}>
      {isMovableKind ? <IcoOpen /> : <IcoLock />}
      {isMovableKind ? "Movable" : "Locked"}
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
  const { player, movable, slotKind, pointsAtStake } = slot;
  const isPlayedStarter = slotKind === "played-starter";
  // Played starters tap into the forfeit-confirm path; all others follow movable/eligible.
  const tappable = movable || eligible || isPlayedStarter;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";

  let kindClass: string;
  if (movable) kindClass = "is-movable";
  else if (isPlayedStarter) kindClass = "sl-tok-played";
  else kindClass = "is-locked";

  const title = isPlayedStarter
    ? pointsAtStake > 0
      ? `${player.displayName} · ${player.position} · played — tap to bench (forfeits ${pointsAtStake} pts)`
      : `${player.displayName} · ${player.position} · played — tap to bench (forfeits points)`
    : `${player.displayName} · ${player.position} · ${movable ? "movable" : "locked"}`;

  return (
    <button
      type="button"
      className={`sl-tok st-${state} ${kindClass}`}
      draggable={false}
      aria-disabled={!tappable}
      disabled={!tappable}
      onClick={() => onSelect(player.id)}
      title={title}
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
        {/* Padlock only for genuinely frozen slots; played starters show pts badge instead. */}
        {!movable && !isPlayedStarter && <IcoLock />}
        {isPlayedStarter && pointsAtStake > 0 && (
          <span className="sl-tok-pts" aria-label={`${pointsAtStake} points`}>
            {pointsAtStake}
          </span>
        )}
      </span>
      <span className="sl-tok-name">{shortName(player)}</span>
      <KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-tok-ko" />
      {slot.kickoffAt && (
        <OpponentTag opponent={slot.opponent} className="sl-tok-opp t-micro text-tertiary" />
      )}
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
  const { player, movable, slotKind } = slot;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";
  return (
    <button
      type="button"
      className={`sl-bench-row st-${state} ${movable ? "is-movable" : "is-locked"}`}
      draggable={false}
      aria-disabled={!movable}
      disabled={!movable}
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
      <span className={`sl-bench-name${slotKind === "voided" ? " is-voided" : ""}`}>
        {shortName(player)}
      </span>
      <KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-bench-ko" />
      {slot.kickoffAt && (
        <OpponentTag opponent={slot.opponent} className="sl-bench-opp t-micro text-tertiary" />
      )}
      <LockTag slotKind={slotKind} mini />
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

export interface FormationPickerProps {
  /** The shapes to offer (fillable ∩ lock-legal), canonical order — produced by `offeredFormations`. */
  offered: readonly string[];
  /** The current outfield shape (`formationKeyOf`); highlighted when it's one of the offered shapes. */
  active: string;
  /** Window closed (or no shape to switch to) → the control is inert. */
  disabled?: boolean;
  onPick: (formation: string) => void;
}

/**
 * Segmented formation selector. Surfaces ONLY shapes the manager can field right now (roster supply +
 * lock-respect already filtered upstream by `offeredFormations`), so every option is one tap to a
 * complete, savable XI. Picking a shape reshapes the starter set; the bench swaps then fine-tune it.
 *
 * When the squad fields exactly ONE shape (or none), there's nothing to choose, so we render a static
 * indicator instead of a single dead tab — the control is never a no-op button.
 */
export function FormationPicker({ offered, active, disabled, onPick }: FormationPickerProps) {
  if (offered.length <= 1) {
    const only = offered[0];
    return (
      <div className="sl-formation" role="group" aria-label="Formation">
        <span className="t-label text-tertiary sl-formation-label">Formation</span>
        <span
          className="sl-formation-static pill mono"
          aria-label={only ? `Only fieldable formation ${only}` : "No fieldable formation"}
        >
          {only ?? "—"}
          <span className="sl-formation-note t-micro text-tertiary">
            {only ? "only fieldable shape" : "no legal shape"}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="sl-formation" role="group" aria-label="Formation">
      <span className="t-label text-tertiary sl-formation-label">Formation</span>
      <div className="tabs sl-formation-tabs" role="tablist" aria-label="Formation options">
        {offered.map((formation) => (
          <button
            key={formation}
            type="button"
            role="tab"
            aria-selected={formation === active}
            className={`tab mono ${formation === active ? "is-active" : ""}`}
            disabled={disabled}
            onClick={() => onPick(formation)}
          >
            {formation}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface ForfeitConfirmSheetProps {
  playerName: string;
  /** Points the manager would forfeit; 0 or null means the score row hasn't landed yet. */
  pointsAtStake: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirm sheet for the destructive bench-played-starter action. Shown when the manager taps a
 * played-starter token; the forfeit is only wired server-side if they explicitly confirm here.
 * Cancel = full undo (the token returns to its played-starter state; re-confirm is required to re-arm).
 */
export function ForfeitConfirmSheet({
  playerName,
  pointsAtStake,
  onConfirm,
  onCancel,
}: ForfeitConfirmSheetProps) {
  const ptsText = pointsAtStake > 0 ? `his ${pointsAtStake} pts` : "his points";
  return (
    // Clicking the overlay backdrop = cancel (same as the Cancel button).
    <div className="sl-forfeit-overlay" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bench ${playerName}`}
        className="sl-forfeit-sheet card"
        // Stop the backdrop's onClick from propagating through the card.
        onClick={(e) => e.stopPropagation()}
      >
        <p className="sl-forfeit-msg t-body">
          Bench <strong>{playerName}</strong> — forfeits {ptsText} this period.{" "}
          <em>Final: he can&apos;t return to your XI this period.</em>
        </p>
        <div className="sl-forfeit-actions">
          {/* Cancel is autoFocused — the safe default for a destructive action. */}
          <button type="button" className="btn btn-ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Bench &amp; forfeit
          </button>
        </div>
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
