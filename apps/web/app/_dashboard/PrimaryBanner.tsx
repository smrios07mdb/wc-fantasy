/**
 * Phase-aware primary banner — ported from `dashboard/components.jsx` `PrimaryBanner` /
 * `bannerFor()`. The phase accent colour is NEVER hardcoded; it is set as a single `--phc`
 * CSS custom property on the container and all children inherit it (the eyebrow pill, the
 * inset box-shadow stripe). This keeps per-phase styling to ONE injection point.
 *
 * BRAND §1/§5: accent (cobalt) is reserved for "you + primary actions". Phase banners use
 * FUNCTIONAL colours via --phc: info (pre-draft), live-red (draft), info (post-draft interim).
 * No gold, no cobalt in the banner stripe.
 *
 * Server component — no "use client" needed; all data comes from the server loader.
 */
import type { DashboardPhase } from "../../src/dashboard/selectDashboardPhase";
import type { DraftRoomState } from "../../src/draft/types";

// Phase → CSS custom-property value (functional colours from ds.css, not hex).
const PHASE_COLOR: Record<DashboardPhase, string> = {
  "pre-draft": "var(--info)",
  draft: "var(--live)",
  "post-draft": "var(--info)",
};

// Phase → eyebrow label
const PHASE_EYEBROW: Record<DashboardPhase, string> = {
  "pre-draft": "Draft day",
  draft: "Draft is live",
  "post-draft": "Tournament underway",
};

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

interface BannerContent {
  eyebrow: string;
  title: string;
  sub: string;
  big: string;
  bigMono?: boolean;
  ctaLabel: string;
  ctaHref: string;
  secondary: Array<{ l: string; v: string }>;
}

/** Derive the banner content from phase + draft state. Pure — no IO. */
function bannerContent(phase: DashboardPhase, draft: DraftRoomState | null): BannerContent {
  const N = draft?.managers.length ?? 0;

  if (phase === "pre-draft") {
    const rounds = 15; // SQUAD_SIZE (constant, locked in DECISIONS)
    const perPick = draft?.draftPickSeconds ?? 60;
    return {
      eyebrow: PHASE_EYEBROW["pre-draft"],
      title: "Your draft starts soon",
      // STOP(P37): No scheduledStartAt on draft table — countdown unavailable.
      // Renders "Waiting for commissioner" instead of a formatted time countdown.
      sub: `Snake order · ${N} manager${N !== 1 ? "s" : ""} · ${rounds} rounds · ${perPick}s per pick — commissioner will start when everyone is ready.`,
      big: `${N}`,
      bigMono: true,
      ctaLabel: "Enter draft room",
      ctaHref: "/draft",
      secondary: [
        { l: "Managers", v: `${N}` },
        { l: "Format", v: `Snake · ${rounds} rounds` },
      ],
    };
  }

  if (phase === "draft" && draft) {
    const currentPick = draft.currentPickNo ?? 1;
    const onClock = draft.managers.find((m) => m.id === draft.currentManagerId);
    const onClockName = onClock ? (onClock.isMe ? "You" : onClock.displayName) : "…";

    const round = Math.ceil(currentPick / Math.max(N, 1));
    const myPick = draft.managers.find((m) => m.id === draft.sessionManagerId);
    const myPickCount = draft.picks.filter((p) => p.managerId === draft.sessionManagerId).length;

    // Picks until my turn: walk the snake order from currentPick+1 to find my next slot.
    let picksUntilMine: number | null = null;
    if (myPick && N > 0) {
      const mySlot = myPick.draftSlot; // 1-based
      const totalPicks = N * 15;
      for (let p = currentPick + 1; p <= totalPicks; p++) {
        const posInRound = ((p - 1) % N) + 1;
        const roundNum = Math.ceil(p / N);
        const slot = roundNum % 2 === 1 ? posInRound : N - posInRound + 1;
        if (slot === mySlot) {
          picksUntilMine = p - currentPick;
          break;
        }
      }
    }

    const subParts: string[] = [];
    if (picksUntilMine !== null) {
      subParts.push(
        picksUntilMine === 0
          ? "You are on the clock!"
          : `Your pick in ${picksUntilMine} pick${picksUntilMine !== 1 ? "s" : ""}`,
      );
    }
    subParts.push(`${currentPick} of ${N * 15} overall`);

    return {
      eyebrow: PHASE_EYEBROW.draft,
      title: `${onClockName} is on the clock`,
      sub: subParts.join(" · "),
      big: `R${round} · P${currentPick}`,
      bigMono: true,
      ctaLabel: "Go to draft room",
      ctaHref: "/draft",
      secondary: [
        { l: "Your squad", v: `${myPickCount} / 15` },
        { l: "On the clock", v: onClockName },
      ],
    };
  }

  // post-draft: draft complete, group/playoff/complete are the next prompts.
  const myPickCount =
    draft?.picks.filter((p) => p.managerId === draft.sessionManagerId).length ?? 0;
  return {
    eyebrow: PHASE_EYEBROW["post-draft"],
    title: "Draft complete — squad set",
    sub: "Head to Set Lineup to prepare your starting XI for the group stage.",
    big: `${myPickCount}/15`,
    bigMono: true,
    ctaLabel: "Set lineup",
    ctaHref: "/lineup",
    secondary: [
      { l: "Your squad", v: `${myPickCount} / 15` },
      { l: "Next", v: "Group stage" },
    ],
  };
}

export function PrimaryBanner({
  phase,
  draft,
}: {
  phase: DashboardPhase;
  draft: DraftRoomState | null;
}) {
  const content = bannerContent(phase, draft);
  const phcColor = PHASE_COLOR[phase];

  return (
    <div className="db-banner" style={{ "--phc": phcColor } as React.CSSProperties}>
      <div className="db-banner-main">
        <span className="db-eyebrow">
          <span className="db-eyebrow-dot" />
          {content.eyebrow}
        </span>
        <h2 className="db-banner-title display">{content.title}</h2>
        <p className="db-banner-sub t-body text-secondary">{content.sub}</p>
        <div className="db-banner-cta">
          <a className="btn btn-primary" href={content.ctaHref}>
            {content.ctaLabel}
            <ArrowIcon />
          </a>
        </div>
      </div>

      <div className="db-banner-side">
        <div className={"db-banner-big" + (content.bigMono ? " mono" : " display")}>
          {content.big}
        </div>
        {content.secondary.length > 0 && (
          <div className="db-banner-secs">
            {content.secondary.map((s) => (
              <div className="db-bsec" key={s.l}>
                <span className="t-micro text-tertiary">{s.l}</span>
                <b className="mono">{s.v}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
