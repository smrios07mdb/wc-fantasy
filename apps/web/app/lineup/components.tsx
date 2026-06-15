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
import type {
  LineupPlayer,
  OpponentInfo,
  PeriodLineup,
  StarterStatus,
} from "../../src/lineup/types";
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Availability badge (Set Lineup) — design Variation B "corner medallion + kit glow", ported from
// design/design_handoff_availability_badge/availability/badges.jsx. Answers, per rostered player, "is
// he in his country's real starting XI for his next match?" — ORTHOGONAL to lock-on-play (kit dim +
// score line). Two states only; the design's third "TBA" state is intentionally NOT a chip here — a
// null status renders NO badge (the calm, dominant default until the lineup is announced).
//
// Every state carries colour + a distinct icon shape + a word (the design's non-negotiable colorblind
// rule). The state palette (--sl-av / --sl-av-soft / --sl-av-ink) is set by the host (the token / bench
// row) via the `availClass` below, so these pieces just consume the inherited CSS vars. The accent is
// reserved for *you* + primary actions, so this functional badge never uses it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const AVAIL: Record<
  StarterStatus,
  { word: string; cls: string; icon: "check" | "x"; label: string }
> = {
  starting: {
    word: "Starting",
    cls: "sl-av-starting",
    icon: "check",
    label: "Starting — in his country's real XI",
  },
  not_starting: {
    word: "Out",
    cls: "sl-av-out",
    icon: "x",
    label: "Not starting — benched or out of the matchday squad",
  },
};

/** The host className that sets the state palette (or "" for no badge). Applied to the token / bench row. */
export function availClass(status: StarterStatus | null): string {
  return status ? AVAIL[status].cls : "";
}

/** check (Starting) / cross (Not starting) — distinct silhouettes for the colorblind-safe redundancy. */
function AvailIco({ icon }: { icon: "check" | "x" }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return icon === "check" ? (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" strokeWidth={2.6} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" strokeWidth={2.8} {...p}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

/** Pitch token: the corner medallion (icon only) pinned to the avatar's top-right. */
export function AvailabilityMedallion({ status }: { status: StarterStatus }) {
  const a = AVAIL[status];
  return (
    <span className="sl-av-medal" role="img" aria-label={a.label} title={a.label}>
      <AvailIco icon={a.icon} />
    </span>
  );
}

/** Pitch token: the micro word under the token (the design's 9px/800 uppercase label). */
export function AvailabilityWord({ status }: { status: StarterStatus }) {
  return <span className="sl-av-word">{AVAIL[status].word}</span>;
}

/** Bench row: the trailing icon + word tag (the bench treatment's leading chip + word, combined). */
export function AvailabilityTag({ status }: { status: StarterStatus }) {
  const a = AVAIL[status];
  return (
    <span className="sl-av-tag" role="img" aria-label={a.label} title={a.label}>
      <AvailIco icon={a.icon} />
      {a.word}
    </span>
  );
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

/** Compact clickable points badge shown on played/locked tokens (not movable). */
export function ScorePill({
  points,
  playerId,
  isLive,
  onOpen,
}: {
  points: number;
  playerId: string;
  /** True for kicked-off players who haven't appeared yet — shows live dot. */
  isLive: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <span
      className={`sl-scorepill${isLive ? " is-live" : ""}`}
      role="button"
      tabIndex={0}
      title={`${points} pts — tap for breakdown`}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(playerId);
      }}
    >
      {isLive && <span className="sl-score-dot" aria-hidden="true" />}
      <b>{points}</b>
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
  /** Open the score breakdown modal for this player. */
  onScore: (playerId: string) => void;
}

export function PitchToken({ slot, selected, eligible, timezone, onSelect, onScore }: TokenProps) {
  const { player, movable, slotKind, pointsAtStake } = slot;
  // Availability is meaningful ONLY while the player is still movable (pre-kickoff). Once he locks by
  // play, the lock state + score line take over and the badge is dropped (design visibility gate).
  const avail = movable ? slot.starterStatus : null;
  const isPlayedStarter = slotKind === "played-starter";
  // Locked tokens (kicked off, no appearance yet) now open the score modal on tap.
  const isLocked = slotKind === "locked";
  const tappable = movable || eligible || isPlayedStarter || isLocked;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";

  let kindClass: string;
  if (movable) kindClass = "is-movable";
  else if (isPlayedStarter) kindClass = "sl-tok-played";
  else kindClass = "is-locked";

  const title = isPlayedStarter
    ? pointsAtStake > 0
      ? `${player.displayName} · ${player.position} · played — ${pointsAtStake} pts — tap for breakdown`
      : `${player.displayName} · ${player.position} · played — tap for breakdown`
    : isLocked
      ? `${player.displayName} · ${player.position} · locked — tap for score breakdown`
      : `${player.displayName} · ${player.position} · ${movable ? "movable" : "locked"}`;

  // Played/locked tokens open the score modal; forfeit is accessible from within the modal.
  const handleClick = () =>
    isLocked || isPlayedStarter ? onScore(player.id) : onSelect(player.id);

  return (
    <button
      type="button"
      className={`sl-tok st-${state} ${kindClass}${avail ? ` ${availClass(avail)}` : ""}`}
      draggable={false}
      aria-disabled={!tappable}
      disabled={!tappable}
      onClick={handleClick}
      title={title}
    >
      <span className="sl-tok-top">
        {/* Anchor wraps the avatar so the availability medallion pins to ITS top-right + the state glow
            follows the avatar silhouette (the design's kit glow, adapted to the circular avatar). */}
        <span className="sl-av-anchor">
          <PlayerAvatar
            displayName={player.displayName}
            firstName={player.firstName}
            lastName={player.lastName}
            country={player.country}
            position={player.position}
            size="sm"
          />
          {avail && <AvailabilityMedallion status={avail} />}
        </span>
        {/* Padlock for frozen/locked slots; played starters show a clickable ScorePill instead. */}
        {!movable && !isPlayedStarter && <IcoLock />}
        {isPlayedStarter && pointsAtStake > 0 && (
          <ScorePill points={pointsAtStake} playerId={player.id} isLive={false} onOpen={onScore} />
        )}
      </span>
      <span className="sl-tok-name">{shortName(player)}</span>
      {avail && <AvailabilityWord status={avail} />}
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
  onScore: (playerId: string) => void;
}

export function Pitch({ view, selected, eligibleIds, timezone, onSelect, onScore }: PitchProps) {
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
                onScore={onScore}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenchRow({ slot, selected, eligible, timezone, onSelect, onScore }: TokenProps) {
  const { player, movable, slotKind, pointsAtStake } = slot;
  const state = selected ? "selected" : eligible ? "eligible" : "idle";
  // Availability only while movable (pre-kickoff) — the row state class drives the left accent stripe.
  const avail = movable ? slot.starterStatus : null;
  // Non-movable bench rows now open the score modal; the is-locked class is kept for visual dimming.
  const handleClick = () => (movable ? onSelect(player.id) : onScore(player.id));
  return (
    <button
      type="button"
      className={`sl-bench-row st-${state} ${movable ? "is-movable" : "is-locked"}${avail ? ` ${availClass(avail)}` : ""}`}
      draggable={false}
      onClick={handleClick}
    >
      <PlayerAvatar
        displayName={player.displayName}
        firstName={player.firstName}
        lastName={player.lastName}
        country={player.country}
        position={player.position}
        size="sm"
      />
      <span className="sl-bench-main">
        <span className="sl-bench-line1">
          <b className={`sl-bench-name${slotKind === "voided" ? " is-voided" : ""}`}>
            {shortName(player)}
          </b>
          <LockTag slotKind={slotKind} mini />
          {avail && <AvailabilityTag status={avail} />}
          {!movable && (
            <ScorePill
              points={pointsAtStake}
              playerId={player.id}
              isLive={slotKind === "locked"}
              onOpen={onScore}
            />
          )}
        </span>
        {slot.kickoffAt && (
          <span className="sl-bench-sub">
            <KickoffTag kickoffAt={slot.kickoffAt} timezone={timezone} className="sl-bench-ko" />
            <OpponentTag opponent={slot.opponent} className="sl-bench-opp t-micro text-tertiary" />
          </span>
        )}
      </span>
    </button>
  );
}

export interface BenchProps {
  bench: PitchSlot[];
  selected: string | null;
  eligibleIds: ReadonlySet<string>;
  timezone: string;
  onSelect: (playerId: string) => void;
  onScore: (playerId: string) => void;
}

export function Bench({ bench, selected, eligibleIds, timezone, onSelect, onScore }: BenchProps) {
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
            onScore={onScore}
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
  /** The reduced-roster mode descriptor (e.g. "Playoff XI · 7 starters" / "Starting XI · 11 starters")
   *  — period-driven, so a knockout window reads as the 7+2 guillotine squad, not the 11-man group XI. */
  rosterLabel: string;
  movable: number;
  locked: number;
  /** The working XI differs from what's saved. */
  dirty: boolean;
  /** A save just landed (and nothing's been edited since) — distinct from "loaded, untouched". */
  justSaved: boolean;
}

/** Compact summary hero: the formation + roster mode + how many players are movable vs frozen + save status. */
export function LockHero({
  formationLabel,
  rosterLabel,
  movable,
  locked,
  dirty,
  justSaved,
}: LockHeroProps) {
  return (
    <div className="sl-hero card">
      <div className="sl-hero-formation">
        <span className="t-label text-tertiary">Formation</span>
        <span className="t-h2 mono">{formationLabel}</span>
        {/* Period-driven roster mode: makes the reduced playoff XI (7+2) legible vs the group XI (11). */}
        <span className="sl-hero-roster t-micro text-tertiary">{rosterLabel}</span>
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
