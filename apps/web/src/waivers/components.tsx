/**
 * Presentational pieces for the FAAB waivers screen — ported from `design/design_reference/waivers/
 * components.jsx` into the codebase's conventions (typed props, ds.css classes). No IO, no data fetching;
 * the client shell owns state + the `/api/faab/bid` round-trips and passes everything down.
 *
 * KIT CHIP: the design's flag-kit (`FaKit` + `JERSEY_BG`) was never ported into the app, so per the
 * prompt we render the simple fallback — a nation code over a position-tinted chip. Critically this uses
 * NO multi-layer `background` shorthand, so the project-wide "never `background-size: cover` on a kit
 * chip" gotcha cannot bite here (there are no background layers to collapse).
 */
import type { Position } from "@app/shared";
import { Flag } from "../../app/draft/Flag";
import { toIso2 } from "../draft/flag";
import type { OpponentInfo, WvBatchWindow, WvPlayer } from "./types";
import { isPlayerCutoffPassed } from "./waiversLogic";

// ── icons (ported 1:1 from the design glyphs) ──────────────────────────────────
function Sealed() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
function Refund() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
    </svg>
  );
}
function IconX() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
export { Sealed, Refund };

// ── atoms ──────────────────────────────────────────────────────────────────────
export function Pos({ p }: { p: Position }) {
  return <span className={`pos pos-${p}`}>{p}</span>;
}

/** Nation code on a position-tinted chip (the no-image kit fallback). */
export function KitChip({ player, sm }: { player: WvPlayer; sm?: boolean }) {
  const code = (player.nation ?? "—").slice(0, 3).toUpperCase();
  return (
    <span
      className={`wv-kit pos-${player.position}` + (sm ? " is-sm" : "")}
      title={player.nation ?? undefined}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}

/**
 * A waivers player's country flag — reuses the sole `<Flag>` render surface + `toIso2` resolver
 * (Prompts 33/35/36): emoji for ISO nations, the hand-authored England/Scotland SVGs for home nations.
 * Nation values are country NAMES (from the fifa_team join); unknown/empty degrades to a glyph-less,
 * alignment-preserving placeholder. Same `.flag-emoji` sizing the draft/lineup surfaces use.
 */
export function NationFlag({ nation, lg }: { nation: string | null; lg?: boolean }) {
  return <Flag code={toIso2(nation)} label={nation ?? undefined} lg={lg} />;
}

/**
 * A free agent's NEXT fixture opponent on the picker row — "vs 🇫🇷 France" (his team is home) /
 * "@ 🇧🇷 Brazil" (away), mirroring the set-lineup `OpponentTag` field-for-field. Reuses the SAME
 * `<NationFlag>` surface as every other flag on the screen. Renders "TBD" when the player's team has no
 * still-acquirable fixture this period (eliminated / knockout side undecided) — never a broken glyph.
 */
export function OpponentLine({ opponent }: { opponent: OpponentInfo | null | undefined }) {
  if (!opponent) {
    return (
      <span className="wv-fa-opp t-micro text-tertiary" aria-label="Next opponent TBD">
        TBD
      </span>
    );
  }
  const prefix = opponent.isHome ? "vs" : "@";
  return (
    <span
      className="wv-fa-opp t-micro text-tertiary"
      title={`Next: ${prefix} ${opponent.opponentName}`}
    >
      {prefix} <NationFlag nation={opponent.opponentNation} />
      {opponent.opponentName}
    </span>
  );
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Acquisition-cutoff status for a player: countdown to his kickoff, or "cutoff passed". */
export function CutoffTag({ player, now }: { player: WvPlayer; now: Date }) {
  if (player.kickoffAt === null) return null;
  if (isPlayerCutoffPassed(player, now)) {
    return <span className="wv-cutoff is-closed">cutoff passed</span>;
  }
  const ms = new Date(player.kickoffAt).getTime() - now.getTime();
  const urgent = ms <= 18 * 60000;
  return (
    <span className={"wv-cutoff" + (urgent ? " is-urgent" : "")}>{fmtCountdown(ms)} to cutoff</span>
  );
}

// ── free-agent picker row ────────────────────────────────────────────────────────
/**
 * One row in the free-agent picker (shared by `BidComposer` + `FreeAgentPanel`, whose `wv-comp-fa`
 * markup was byte-identical). The select path is UNCHANGED: the `<button className="wv-comp-fa">` keeps
 * its exact markup + `onSelect` handler. A dedicated SIBLING control (`.wv-comp-fa-info`) opens the
 * view-only player card via `onOpen` — its `stopPropagation` keeps the open tap from also selecting the
 * player for acquisition (Prompt 56's open-vs-add resolution).
 */
export function FaPickRow({
  player,
  selected,
  onSelect,
  onOpen,
}: {
  player: WvPlayer;
  selected: boolean;
  onSelect: (player: WvPlayer) => void;
  onOpen: (player: WvPlayer) => void;
}) {
  return (
    <div className="wv-comp-fa-wrap">
      <button
        className={"wv-comp-fa" + (selected ? " is-sel" : "")}
        onClick={() => onSelect(player)}
      >
        <KitChip player={player} sm />
        <NationFlag nation={player.nation} />
        <div className="wv-comp-fa-id">
          <b className="wv-name">{player.shortName}</b>
          <span className="t-micro text-tertiary">
            {player.teamName ?? player.nation ?? ""} ·{" "}
            {player.seasonPoints === null ? "—" : `${player.seasonPoints} pts`}
          </span>
          <OpponentLine opponent={player.opponent ?? null} />
        </div>
        <Pos p={player.position} />
      </button>
      <button
        className="wv-comp-fa-info"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(player);
        }}
        aria-label="View player card"
        title="View player card"
      >
        <IconInfo />
      </button>
    </div>
  );
}

// ── next-batch header ──────────────────────────────────────────────────────────
/**
 * The "next waiver batch" element: phase-aware copy + the existing countdown (sealed-bid only). The
 * window is computed server-side from the current period's `effectiveBatchAt` / `acquisitionWindowState`
 * (`@app/faab`) so it names the EXACT instant the worker fires; only the countdown ticks client-side off
 * `now`. Reuses the design's `wv-batchbar` element + `fmtCountdown` — data wiring, not a re-skin.
 */
export function BatchBar({ w, now }: { w: WvBatchWindow; now: Date }) {
  const countdown =
    w.countdownToIso !== null
      ? fmtCountdown(new Date(w.countdownToIso).getTime() - now.getTime())
      : null;
  return (
    <div className="wv-batchbar" data-phase={w.phase}>
      <div className="wv-batchbar-l">
        <span className="t-label">{w.caption}</span>
        <b className="wv-batchbar-when">{w.value}</b>
        {w.sub !== null && <span className="t-micro text-tertiary">{w.sub}</span>}
      </div>
      {countdown !== null && (
        <div className="wv-batchbar-r">
          <span className="t-label">Processes in</span>
          <b className="wv-batchbar-cd mono">{countdown}</b>
        </div>
      )}
    </div>
  );
}

// ── FAAB budget bar ──────────────────────────────────────────────────────────────
export function FaabBar({
  available,
  pending,
  after,
  budget,
  compact,
}: {
  available: number;
  pending: number;
  after: number;
  /** The full FAAB allotment ($100) — the track denominator. */
  budget: number;
  compact?: boolean;
}) {
  const leftPct = Math.min(100, Math.max(0, (available / budget) * 100));
  const pendPct = Math.min(100, Math.max(0, (pending / budget) * 100));
  const low = after <= budget * 0.2;
  return (
    <div className={"wv-faab" + (compact ? " is-compact" : "")}>
      <div className="wv-faab-top">
        <div className="wv-faab-stat">
          <span className="t-label">FAAB available</span>
          <b className="wv-faab-big mono">${available}</b>
        </div>
        <div className="wv-faab-stat is-right">
          <span className="t-label">After pending</span>
          <b className={"wv-faab-big mono" + (low ? " is-low" : "")}>${after}</b>
        </div>
      </div>
      <div className="wv-faab-track">
        <span className="wv-faab-fill" style={{ width: leftPct + "%" }} />
        <span
          className="wv-faab-pend"
          style={{ width: pendPct + "%" }}
          title={`$${pending} committed across pending bids`}
        />
      </div>
      <div className="wv-faab-legend">
        <span>
          <span className="wv-dot wv-dot-left" />${available} budget
        </span>
        <span>
          <span className="wv-dot wv-dot-pend" />${pending} in pending
        </span>
      </div>
    </div>
  );
}

// ── rolling waiver order ─────────────────────────────────────────────────────────
export function WaiverOrderRail({
  order,
  myPosition,
}: {
  order: ReadonlyArray<{ managerId: string; name: string; position: number; isMe: boolean }>;
  myPosition: number | null;
}) {
  return (
    <div className="wv-order">
      <div className="wv-order-head">
        <span className="t-label">Rolling waiver order</span>
        {myPosition !== null && <span className="wv-order-mine">You&rsquo;re #{myPosition}</span>}
      </div>
      <div className="wv-order-list">
        {order.map((seat) => (
          <div key={seat.managerId} className={"wv-order-item" + (seat.isMe ? " is-me" : "")}>
            <span className="wv-order-n">{seat.position}</span>
            <span className="wv-order-name">{seat.name}</span>
          </div>
        ))}
      </div>
      <div className="wv-order-note t-micro">
        Order rotates as claims are won · <b>equal bids break on this order</b>
      </div>
    </div>
  );
}

// ── a single pending claim ───────────────────────────────────────────────────────
export function ClaimRow({
  claim,
  now,
  voided,
  onEdit,
  onCancel,
  busy,
}: {
  claim: { bidId: string; amount: number; add: WvPlayer; drop: WvPlayer | null };
  now: Date;
  voided: boolean;
  onEdit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className={"wv-claim" + (voided ? " is-void" : "")}>
      {/* TODO(confirm): pending-claim reorder (the design's up/down arrows) needs a `faab_bid.priority`
          migration — deferred with the engine's priority-vs-amount tiebreak (Prompt 25). Claims render
          amount-descending (the engine's own-bid resolution order) until then. */}
      <div className="wv-claim-body">
        <div className="wv-claim-line">
          <span className="wv-claim-tag wv-tag-add">ADD</span>
          <KitChip player={claim.add} sm />
          <NationFlag nation={claim.add.nation} />
          <b className="wv-name">{claim.add.shortName}</b>
          <Pos p={claim.add.position} />
          <CutoffTag player={claim.add} now={now} />
        </div>
        {claim.drop && (
          <div className="wv-claim-line is-drop">
            <span className="wv-claim-tag wv-tag-drop">DROP</span>
            <KitChip player={claim.drop} sm />
            <NationFlag nation={claim.drop.nation} />
            <b className="wv-name wv-name-drop">{claim.drop.shortName}</b>
            <Pos p={claim.drop.position} />
          </div>
        )}
      </div>

      <div className="wv-claim-bid">
        <span className="wv-bid-amt mono">${claim.amount}</span>
        <span className="wv-bid-sealed">
          <Sealed />
          sealed bid
        </span>
      </div>

      <div className="wv-claim-act">
        {voided ? (
          <span className="wv-void-tag">
            <Refund />
            Void · refund ${claim.amount}
          </span>
        ) : (
          <>
            <button
              className="wv-icon-btn"
              onClick={onEdit}
              disabled={busy}
              title="Edit bid"
              aria-label="Edit bid"
            >
              <IconEdit />
            </button>
            <button
              className="wv-icon-btn is-danger"
              onClick={onCancel}
              disabled={busy}
              title="Cancel claim"
              aria-label="Cancel claim"
            >
              <IconX />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── results history ──────────────────────────────────────────────────────────────
function ResultRow({
  result,
}: {
  result: {
    bidId: string;
    managerName: string;
    isMine: boolean;
    add: WvPlayer;
    drop: WvPlayer | null;
    amount: number;
    outcome: "won" | "lost" | "void";
  };
}) {
  const { outcome } = result;
  return (
    <div className={"wv-res" + (result.isMine ? " is-mine" : "")}>
      <div className="wv-res-add">
        <KitChip player={result.add} sm />
        <NationFlag nation={result.add.nation} />
        <div className="wv-res-id">
          <b className="wv-name">{result.add.shortName}</b>
          <span className="t-micro text-tertiary">
            <Pos p={result.add.position} /> {result.add.nation ?? ""}
          </span>
        </div>
      </div>
      <div className="wv-res-mid">
        {outcome === "void" ? (
          <span className="wv-res-out wv-out-void">
            <Refund />
            Voided · refund ${result.amount}
          </span>
        ) : (
          <span className="wv-res-winner">
            <span className="wv-res-wname">{result.isMine ? "You" : result.managerName}</span>
            <span className={"wv-res-out " + (outcome === "won" ? "wv-out-won" : "wv-out-lost")}>
              {outcome === "won" ? "won" : "lost"}
            </span>
          </span>
        )}
      </div>
      <div className="wv-res-bid">
        {outcome !== "void" && <span className="wv-res-amt mono">${result.amount}</span>}
        {outcome === "won" && result.drop && (
          <span className="t-micro text-tertiary">dropped {result.drop.shortName}</span>
        )}
      </div>
    </div>
  );
}

export function ResultsBatch({
  batch,
  formatRunAt,
}: {
  batch: {
    batchId: string;
    runAt: string;
    results: ReadonlyArray<{
      bidId: string;
      managerName: string;
      isMine: boolean;
      add: WvPlayer;
      drop: WvPlayer | null;
      amount: number;
      outcome: "won" | "lost" | "void";
    }>;
  };
  formatRunAt: (iso: string) => string;
}) {
  return (
    <section className="wv-batch">
      <header className="wv-batch-head">
        <b className="wv-batch-when">{formatRunAt(batch.runAt)}</b>
        <span className="t-micro text-tertiary">{batch.results.length} claims</span>
      </header>
      <div className="wv-batch-list">
        {batch.results.map((r) => (
          <ResultRow key={r.bidId} result={r} />
        ))}
      </div>
    </section>
  );
}
