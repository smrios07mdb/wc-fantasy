/**
 * Phase-aware primary banner — ported from `dashboard/components.jsx` `PrimaryBanner` /
 * `bannerFor()`. The phase accent colour is NEVER hardcoded; it is set as a single `--phc`
 * CSS custom property on the container and all children inherit it (the eyebrow pill, the
 * inset box-shadow stripe). This keeps per-phase styling to ONE injection point.
 *
 * BRAND §1/§5: accent (cobalt) is reserved for "you + primary actions". Phase banners use
 * FUNCTIONAL colours via --phc: info (pre-draft/pre-kickoff), live-red (draft/group/playoff),
 * success-green (complete). No gold, no cobalt in the banner stripe.
 *
 * Server component — no "use client" needed; all data comes from the server loader.
 */
import type { DashboardPhase } from "../../src/dashboard/selectDashboardPhase";
import type { DraftRoomState } from "../../src/draft/types";
import type { VsFieldView } from "@app/vsfield";
import type { PlayoffsView } from "../playoffs/loadPlayoffs";
import {
  selectSurvivalView,
  selectChampionPodium,
  selectViewerFinish,
} from "../../src/dashboard/playoffModules";

// Phase → CSS custom-property value (functional colours from ds.css, not hex).
const PHASE_COLOR: Record<DashboardPhase, string> = {
  "pre-draft": "var(--info)",
  draft: "var(--live)",
  "pre-kickoff": "var(--info)",
  group: "var(--live)",
  playoff: "var(--live)",
  complete: "var(--success)",
};

// Phase → eyebrow label
const PHASE_EYEBROW: Record<DashboardPhase, string> = {
  "pre-draft": "Draft day",
  draft: "Draft is live",
  "pre-kickoff": "Group stage",
  group: "Group stage live",
  playoff: "Knockouts live",
  complete: "Tournament complete",
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

/** Derive the banner content from phase + available data. Pure — no IO. */
function bannerContent(
  phase: DashboardPhase,
  draft: DraftRoomState | null,
  vsField: VsFieldView | null,
  playoffs: PlayoffsView | null,
  earliestGroupKickoff: string | null,
): BannerContent {
  const N = draft?.managers.length ?? 0;

  if (phase === "pre-draft") {
    const rounds = 15;
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

    let picksUntilMine: number | null = null;
    if (myPick && N > 0) {
      const mySlot = myPick.draftSlot;
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

  if (phase === "pre-kickoff") {
    const myPickCount =
      draft?.picks.filter((p) => p.managerId === draft.sessionManagerId).length ?? 0;
    // Real kickoff datetime from fifa_match (unlike P37's draft countdown which had no datetime).
    const kickoffLabel = earliestGroupKickoff
      ? formatKickoffDate(earliestGroupKickoff)
      : "fixtures loading…";
    return {
      eyebrow: PHASE_EYEBROW["pre-kickoff"],
      title: "Group stage begins soon",
      sub: `Your squad is set. Head to Set Lineup to lock in your starting XI before the first whistle.`,
      big: kickoffLabel,
      bigMono: false,
      ctaLabel: "Set lineup",
      ctaHref: "/lineup",
      secondary: [
        { l: "Your squad", v: `${myPickCount} / 15` },
        {
          l: "First kick",
          v: earliestGroupKickoff ? formatKickoffShort(earliestGroupKickoff) : "TBD",
        },
      ],
    };
  }

  if (phase === "group") {
    const myEntry = vsField?.field.find((e) => e.isMe);
    const mySeasonEntry = vsField?.season.find((e) => e.isMe);
    const currentLabel = vsField?.currentPeriod?.label ?? null;
    const totalGroupMds = mySeasonEntry?.byPeriod.length ?? 0;
    const mdLabel =
      currentLabel && totalGroupMds > 0
        ? `${currentLabel} of ${totalGroupMds}`
        : (currentLabel ?? "—");
    const W = mySeasonEntry?.allPlayAllW ?? 0;
    const L = mySeasonEntry?.allPlayAllL ?? 0;
    const D = mySeasonEntry?.allPlayAllD ?? 0;
    const pts = mySeasonEntry?.totalPoints ?? 0;
    const rank = mySeasonEntry?.rank ?? 0;
    return {
      eyebrow: PHASE_EYEBROW.group,
      title: myEntry ? `You're ranked #${rank}` : "Group stage underway",
      sub: `All-play-all group stage · ${W}-${L}-${D} record · ${pts} pts total`,
      big: mdLabel,
      bigMono: true,
      ctaLabel: "Vs the field",
      ctaHref: "/vsfield",
      secondary: [
        { l: "Record", v: `${W}-${L}-${D}` },
        { l: "Points", v: `${pts}` },
      ],
    };
  }

  if (phase === "playoff") {
    // Real guillotine state from PlayoffsView (READ-ONLY). Null only in the brief pre-seeding window.
    if (!playoffs) {
      return {
        eyebrow: PHASE_EYEBROW["playoff"],
        title: "Knockouts underway",
        sub: "The guillotine bracket is being seeded.",
        big: "KO",
        bigMono: true,
        ctaLabel: "Playoff theater",
        ctaHref: "/playoffs",
        secondary: [],
      };
    }
    const sv = selectSurvivalView(playoffs);
    const title =
      sv.meSafe === true
        ? "You're alive"
        : sv.meSafe === false
          ? "You're on the block"
          : "Knockouts underway";
    const marginV =
      sv.marginPoints === null
        ? "—"
        : sv.meSafe
          ? `+${sv.marginPoints} clear`
          : `${Math.abs(sv.marginPoints)} short`;
    return {
      eyebrow: PHASE_EYEBROW["playoff"],
      title,
      sub: `${sv.roundLabel ?? "Knockouts"} · ${sv.aliveNow}→${sv.survivesNow} survive · ${sv.cutCount} cut this round · reduced roster, FAAB reset to $100`,
      big: `${sv.aliveNow} left`,
      bigMono: true,
      ctaLabel: "Playoff theater",
      ctaHref: "/playoffs",
      secondary: [
        { l: "Your margin", v: marginV },
        { l: "Cut this round", v: `${sv.cutCount}` },
      ],
    };
  }

  if (phase === "complete") {
    // Real champion + the viewer's finish + SEASON recap from PlayoffsView (READ-ONLY). The complete-arm
    // season stats (power record / total title points / best week) are first-class on
    // PlayoffsView.seasonStats (selectViewerFinish) — surfaced here in the viewer's headline + stats.
    const podium = playoffs ? selectChampionPodium(playoffs) : null;
    const finish = playoffs ? selectViewerFinish(playoffs) : null;
    const champName = podium?.champion?.name ?? null;
    const bigFinish =
      finish?.outcome === "champion"
        ? "1st"
        : finish?.outcome === "runner-up"
          ? "2nd"
          : finish?.outcome === "eliminated"
            ? (finish.roundLabel ?? "—")
            : "—";
    const finishLabel =
      finish?.outcome === "champion"
        ? "Champion"
        : finish?.outcome === "runner-up"
          ? "Runner-up"
          : finish?.outcome === "eliminated"
            ? `Out · ${finish.roundLabel ?? "knockouts"}`
            : "—";
    // The viewer's season-recap phrase (null when they were not a participant → generic copy, no stats).
    const finishPhrase =
      finish?.outcome === "champion"
        ? "as champion"
        : finish?.outcome === "runner-up"
          ? "as runner-up"
          : finish?.outcome === "eliminated"
            ? `out at the ${finish.roundLabel ?? "knockouts"}`
            : null;
    const sub =
      finish && finishPhrase
        ? `You finished ${finishPhrase} · ${finish.totalTitlePoints} total pts`
        : "The tournament has finished.";
    const secondary =
      finish && finishPhrase
        ? [
            { l: "Power record", v: `${finish.powerW}–${finish.powerL}` },
            { l: "Best week", v: `${finish.bestWeek} pts` },
          ]
        : [
            { l: "Champion", v: champName ?? "—" },
            { l: "Your finish", v: finishLabel },
          ];
    return {
      eyebrow: PHASE_EYEBROW["complete"],
      title: champName ? `Champion · ${champName}` : "Tournament complete",
      sub,
      big: bigFinish,
      bigMono: true,
      ctaLabel: "Playoff theater",
      ctaHref: "/playoffs",
      secondary,
    };
  }

  // Fallback — should be unreachable (all phases handled above).
  return {
    eyebrow: PHASE_EYEBROW["pre-draft"],
    title: "Loading…",
    sub: "",
    big: "—",
    bigMono: true,
    ctaLabel: "Home",
    ctaHref: "/",
    secondary: [],
  };
}

/** Format a UTC ISO string as "Thu 12 Jun · 17:00 UTC" for the banner big display. */
function formatKickoffDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = days[d.getUTCDay()];
  const mon = months[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${d.getUTCDate()} ${mon} · ${hh}:${mm}`;
}

/** Shorter kickoff label for the secondary stat: "12 Jun 17:00". */
function formatKickoffShort(iso: string): string {
  const d = new Date(iso);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mon = months[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${mon} ${hh}:${mm}`;
}

export function PrimaryBanner({
  phase,
  draft,
  vsField,
  playoffs,
  earliestGroupKickoff,
}: {
  phase: DashboardPhase;
  draft: DraftRoomState | null;
  vsField: VsFieldView | null;
  playoffs: PlayoffsView | null;
  earliestGroupKickoff: string | null;
}) {
  const content = bannerContent(phase, draft, vsField, playoffs, earliestGroupKickoff);
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
