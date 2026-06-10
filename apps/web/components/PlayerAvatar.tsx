/**
 * `<PlayerAvatar>` (P46) — deterministic generated avatar for a player. Composes the existing
 * `.avatar` disc with:
 *   • position-color background  (var(--pos-gk/def/mid/fwd), no gold, no accent)
 *   • player initials            (pure {@link playerInitials} helper)
 *   • country flag badge         (reuses {@link toIso2}/{@link flagEmoji}/{@link isHomeNation}
 *                                 from the P35–36 resolver — no network, no image fetch)
 *
 * Null / unknown country → no badge (neutral position-color disc). Home nations (England,
 * Scotland) render a proportionally-scaled inline SVG instead of emoji (same geometry as
 * Flag.tsx, different size context). Never a broken glyph, never a crash.
 */
import type { Position } from "@app/shared";
import { playerInitials } from "../src/draft/playerInitials";
import { toIso2, flagEmoji, isHomeNation } from "../src/draft/flag";

function HomeSvg({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 60 36"
      className="pa-flag-svg"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      aria-hidden="true"
    >
      {name === "England" ? (
        <>
          <rect width="60" height="36" fill="#fff" />
          <rect x="0" y="13" width="60" height="10" fill="#CE1124" />
          <rect x="25" y="0" width="10" height="36" fill="#CE1124" />
        </>
      ) : name === "Scotland" ? (
        <>
          <rect width="60" height="36" fill="#005EB8" />
          <line x1="0" y1="0" x2="60" y2="36" stroke="#fff" strokeWidth="8" />
          <line x1="60" y1="0" x2="0" y2="36" stroke="#fff" strokeWidth="8" />
        </>
      ) : null}
    </svg>
  );
}

function FlagBadge({ country }: { country: string | null | undefined }) {
  if (!country) return null;
  if (isHomeNation(country)) {
    return (
      <span className="pa-flag" aria-hidden="true">
        <HomeSvg name={country} />
      </span>
    );
  }
  const emoji = flagEmoji(toIso2(country));
  if (!emoji) return null;
  return (
    <span className="pa-flag" aria-hidden="true">
      {emoji}
    </span>
  );
}

export interface PlayerAvatarProps {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  position: Position;
  size?: "sm" | "md" | "lg";
}

export function PlayerAvatar({
  displayName,
  firstName,
  lastName,
  country,
  position,
  size = "md",
}: PlayerAvatarProps) {
  return (
    <span
      className={`avatar avatar-${size} player-avatar pos-${position}`}
      title={displayName}
      aria-label={displayName}
    >
      {playerInitials(displayName, firstName, lastName)}
      <FlagBadge country={country} />
    </span>
  );
}
