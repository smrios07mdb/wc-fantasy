/**
 * Re-export shim. The flag-kit primitive (`JERSEY_BG_V2` / `KIT_FALLBACK` / `kitOf`) was NEUTRALIZED out
 * of this route into the shared, surface-agnostic home `apps/web/src/kit/kitOf.ts`, so no single screen
 * "owns" it: vsfield + game-detail keep importing `./kitOf` (this shim) byte-identically, and the lineup
 * screen imports the neutral module directly. Public API is unchanged — see apps/web/src/kit/kitOf.ts.
 */
export * from "@/src/kit/kitOf";
