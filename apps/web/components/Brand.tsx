// components/Brand.tsx — XI brand primitives. Thin wrappers over raster assets in /public/brand.
// Gold lives ONLY inside the mark; wordmark is ivory/ink, never gold. Parrot = mascot, never an avatar.
import Image from "next/image";

const DISPLAY = "var(--font-display, 'Schibsted Grotesk', sans-serif)"; // map to your font var

/** The trophy mark on transparency. Use for lockups, splash, large display. */
export function BrandMark({ h = 120, className = "" }: { h?: number; className?: string }) {
  const w = Math.round((502 / 1322) * h);
  return (
    <Image src="/brand/trophy.png" alt="XI" width={w} height={h} priority className={className} />
  );
}

/** The squircle app-icon tile (also the source of the small nav badge). */
export function AppIcon({
  size = 64,
  radius = 0.224,
  className = "",
}: {
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/icon-tile.png"
      alt="XI"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: size * radius }}
    />
  );
}

/** Small brand badge for nav / top bars (replaces the old letter "W" chip). */
export function BrandBadge({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        flex: "none",
        display: "block",
        background: `#0A0D12 url('/brand/icon-tile.png') center/cover no-repeat`,
        boxShadow: "inset 0 0 0 1px var(--hairline, rgba(255,255,255,.08))",
      }}
      aria-label="XI"
    />
  );
}

/** "XI" wordmark + optional tagline. Color = --text-primary (ivory/ink). NEVER gold/accent. */
export function Wordmark({
  size = 1,
  tagline = true,
  align = "left",
}: {
  size?: number;
  tagline?: boolean;
  align?: "left" | "center";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7 * size,
        alignItems: align === "center" ? "center" : "flex-start",
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: 72 * size,
          lineHeight: 0.8,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        XI
      </span>
      {tagline && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 600,
            fontSize: 12.5 * size,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "var(--text-tertiary)",
            paddingLeft: "0.16em",
          }}
        >
          The&nbsp;Starting&nbsp;Eleven
        </span>
      )}
    </div>
  );
}

/** Horizontal lockup: mark · hairline · wordmark. Nav / headers. */
export function LockupH({ h = 88, tagline = true }: { h?: number; tagline?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <BrandMark h={h} />
      <span
        style={{ width: 1, height: h * 0.62, background: "var(--hairline, rgba(255,255,255,.12))" }}
      />
      <Wordmark size={h / 88} tagline={tagline} />
    </div>
  );
}

/** Stacked lockup: mark over "XI" over tagline. Splash / loading / auth panel. */
export function LockupStacked({ h = 150, tagline = true }: { h?: number; tagline?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <BrandMark h={h} />
      <Wordmark size={0.72} tagline={tagline} align="center" />
    </div>
  );
}

/** The parrot mascot roundel. Personality moments ONLY — NOT a manager avatar. */
export function ParrotMascot({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/parrot.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "50%" }}
    />
  );
}
