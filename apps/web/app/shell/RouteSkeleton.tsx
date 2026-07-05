/**
 * RouteSkeleton — the shared, cheap loading placeholder rendered by each authenticated route's
 * `loading.tsx` while its slow server component (auth + multi-table loaders) resolves. NAV-LAT thread:
 * the bottom-tab / More destinations are plain MPA `<a>`s with zero `loading.tsx`, so on live Render
 * TTFB a tap paints NOTHING for seconds and reads as a dead tap (F-P0-A1 / walkthrough N1 + step 7).
 * These skeletons make the *content* start painting the instant the response streams — a structural,
 * shell-framed placeholder instead of the frozen previous screen. (T15-2 already added the touch-down
 * `:active` feedback; this layer is the content-level companion.)
 *
 * ADDITIVE + SELF-CONTAINED by design (thread fences): styling is inline + the ONE existing global
 * `.skeleton` shimmer class from `ds.css` (dark-correct: `--surface-2`/`--surface-3`). No new
 * stylesheet, no touch to `shell.css` or any ds.css copy, no JS shipped (pure server component). The
 * skeleton lives in the layout's `.sh-content`, so the AppShell (top strip + bottom nav + the
 * active-tab highlight) stays painted around it for every layout-mounted route — see the per-route
 * `loading.tsx` files. (`/` mounts the shell inside `page.tsx`, so its `loading.tsx` renders its own
 * static shell chrome around this component — see `app/loading.tsx`.)
 *
 * Structural honesty (not a spinner): each variant roughly mirrors its destination's real frame — a
 * leading header/tab band (every screen leads with one) over the body archetype — so the real page
 * paints INTO the same frame with no layout-shift class of jump. Variants map:
 *   list      → /players /standings /pool /waivers /scoring /commish  (band + stacked rows)
 *   pitch     → /lineup                                               (band + field block)
 *   cockpit   → /vsfield /draft                                       (band + board + side rail)
 *   board     → /playoffs                                             (band + bracket tiles)
 *   form      → /settings                                             (band + form cards)
 *   dashboard → /  (composed by app/loading.tsx inside its own shell)  (banner + spotlight + grid)
 */
import type { CSSProperties, ReactElement } from "react";

export type SkeletonVariant = "list" | "pitch" | "cockpit" | "board" | "form" | "dashboard";

/* ── token-driven inline style helpers (no fixed pixel widths that could overflow a phone) ── */

const bar = (
  width: string,
  height: number,
  radius = "var(--r-sm)",
  extra: CSSProperties = {},
): CSSProperties => ({
  width,
  height,
  borderRadius: radius,
  maxWidth: "100%",
  ...extra,
});

// Every block is border-box + max-width:100% so no row can push the document horizontally.
const box: CSSProperties = { boxSizing: "border-box", maxWidth: "100%" };

const card: CSSProperties = {
  ...box,
  width: "100%",
  background: "var(--surface-1)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--r-lg)",
  padding: "var(--sp-4)",
};

/** Shimmer block — the one visible skeleton unit. `.skeleton` supplies the dark-correct gradient. */
function Block({ style }: { style: CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ ...box, ...style }} />;
}

/** The leading header / tab / toolbar band every screen opens with. */
function HeaderBand() {
  return (
    <div
      data-skeleton-band=""
      style={{
        ...box,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--sp-3)",
        width: "100%",
        paddingBottom: "var(--sp-4)",
        borderBottom: "1px solid var(--hairline)",
        marginBottom: "var(--sp-4)",
      }}
    >
      <Block style={bar("min(220px, 55%)", 26, "var(--r-md)")} />
      <Block style={bar("84px", 30, "var(--r-pill)")} />
    </div>
  );
}

/** A strip of tab / segment pills (tab-led screens: pool, waivers, standings, players). */
function TabStrip() {
  return (
    <div
      style={{
        ...box,
        display: "flex",
        gap: "var(--sp-2)",
        width: "100%",
        marginBottom: "var(--sp-4)",
      }}
    >
      {[96, 110, 88].map((w, i) => (
        <Block key={i} style={bar(`${w}px`, 34, "var(--r-pill)")} />
      ))}
    </div>
  );
}

/** A full-width list row (~44px, a real tappable row's height). */
function ListRows({ count }: { count: number }) {
  return (
    <div
      style={{
        ...box,
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-2)",
        width: "100%",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            padding: "var(--sp-3) var(--sp-4)",
          }}
        >
          <Block style={bar("34px", 34, "var(--r-pill)", { flex: "0 0 auto" })} />
          <Block style={bar("min(180px, 46%)", 14)} />
          <Block style={bar("48px", 14, "var(--r-sm)", { marginLeft: "auto", flex: "0 0 auto" })} />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      <TabStrip />
      <ListRows count={9} />
    </>
  );
}

function PitchSkeleton() {
  return (
    <>
      {/* period tabs + lock hero band */}
      <div
        style={{
          ...box,
          display: "flex",
          gap: "var(--sp-2)",
          width: "100%",
          marginBottom: "var(--sp-3)",
        }}
      >
        {[110, 110, 96].map((w, i) => (
          <Block key={i} style={bar(`${w}px`, 32, "var(--r-pill)")} />
        ))}
      </div>
      <Block style={{ ...bar("100%", 56, "var(--r-lg)"), marginBottom: "var(--sp-4)" }} />
      {/* the pitch / field */}
      <Block style={bar("100%", 360, "var(--r-xl)", { background: "var(--surface-1)" })} />
      <div
        style={{
          ...box,
          display: "flex",
          gap: "var(--sp-2)",
          justifyContent: "center",
          marginTop: "var(--sp-3)",
          width: "100%",
        }}
      >
        {[70, 70, 70, 70].map((w, i) => (
          <Block key={i} style={bar(`${w}px`, 20, "var(--r-pill)")} />
        ))}
      </div>
    </>
  );
}

function CockpitSkeleton() {
  // board / leaderboard beside a side rail — collapses to a single column under the ds breakpoint,
  // so the flex-wrap keeps it honest at phone width without a fixed 2-col track that could overflow.
  return (
    <div style={{ ...box, display: "flex", flexWrap: "wrap", gap: "var(--sp-4)", width: "100%" }}>
      <div
        style={{
          ...box,
          flex: "1 1 260px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-2)",
        }}
      >
        <Block style={bar("min(160px, 50%)", 16, "var(--r-md)", { marginBottom: "var(--sp-1)" })} />
        {Array.from({ length: 6 }).map((_, i) => (
          <Block
            key={i}
            style={bar("100%", 46, "var(--r-md)", { background: "var(--surface-1)" })}
          />
        ))}
      </div>
      <div
        style={{
          ...box,
          flex: "1 1 200px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-2)",
        }}
      >
        <Block style={bar("min(140px, 55%)", 16, "var(--r-md)", { marginBottom: "var(--sp-1)" })} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Block
            key={i}
            style={bar("100%", 64, "var(--r-lg)", { background: "var(--surface-1)" })}
          />
        ))}
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div style={{ ...box, display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", width: "100%" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            ...card,
            flex: "1 1 240px",
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-2)",
          }}
        >
          <Block style={bar("70%", 16)} />
          <Block style={bar("100%", 40, "var(--r-md)", { background: "var(--surface-2)" })} />
          <Block style={bar("100%", 40, "var(--r-md)", { background: "var(--surface-2)" })} />
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div
      style={{
        ...box,
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-4)",
        width: "100%",
      }}
    >
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          style={{ ...card, display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}
        >
          <Block style={bar("min(180px, 50%)", 18, "var(--r-md)")} />
          <Block style={bar("min(240px, 70%)", 13)} />
          <Block
            style={{
              ...bar("100%", 44, "var(--r-md)", { background: "var(--surface-2)" }),
              marginTop: "var(--sp-2)",
            }}
          />
          <Block style={bar("120px", 40, "var(--r-md)")} />
        </div>
      ))}
    </div>
  );
}

/**
 * Dashboard body — the `/` hub's PrimaryBanner + spotlight (wide main + rail) + module grid. Rendered
 * by `app/loading.tsx` INSIDE its own static shell chrome (home mounts AppShell in `page.tsx`).
 */
function DashboardSkeleton() {
  return (
    <>
      {/* PrimaryBanner phase headline strip */}
      <Block
        style={{
          ...bar("100%", 72, "var(--r-lg)", { background: "var(--surface-1)" }),
          marginBottom: "var(--sp-4)",
        }}
      />
      {/* spotlight: wide main + rail (wraps to one column on phones) */}
      <div
        style={{
          ...box,
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--sp-4)",
          width: "100%",
          marginBottom: "var(--sp-4)",
        }}
      >
        <Block
          style={bar("min(360px, 100%)", 150, "var(--r-lg)", {
            flex: "2 1 300px",
            background: "var(--surface-1)",
          })}
        />
        <Block
          style={bar("min(220px, 100%)", 150, "var(--r-lg)", {
            flex: "1 1 200px",
            background: "var(--surface-1)",
          })}
        />
      </div>
      {/* module grid */}
      <div style={{ ...box, display: "flex", flexWrap: "wrap", gap: "var(--sp-4)", width: "100%" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              ...card,
              flex: "1 1 240px",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2)",
            }}
          >
            <Block style={bar("60%", 16)} />
            <Block style={bar("100%", 30, "var(--r-md)", { background: "var(--surface-2)" })} />
            <Block style={bar("100%", 30, "var(--r-md)", { background: "var(--surface-2)" })} />
          </div>
        ))}
      </div>
    </>
  );
}

const BODY: Record<SkeletonVariant, () => ReactElement> = {
  list: ListSkeleton,
  pitch: PitchSkeleton,
  cockpit: CockpitSkeleton,
  board: BoardSkeleton,
  form: FormSkeleton,
  dashboard: DashboardSkeleton,
};

/**
 * The route content skeleton. `label` names the destination for assistive tech ("Loading Standings…").
 * `variant` picks the body archetype. `bare` drops the leading HeaderBand (the dashboard variant leads
 * with its own banner) — every other variant opens with the band.
 */
export function RouteSkeleton({
  variant = "list",
  label = "page",
  bare = false,
}: {
  variant?: SkeletonVariant;
  label?: string;
  bare?: boolean;
}) {
  const Body = BODY[variant];
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={`Loading ${label}`}
      data-skeleton=""
      data-skeleton-variant={variant}
      style={{
        ...box,
        width: "100%",
        padding: "var(--sp-4)",
        overflowX: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        Loading {label}…
      </span>
      {!bare && <HeaderBand />}
      <Body />
    </div>
  );
}

export default RouteSkeleton;
