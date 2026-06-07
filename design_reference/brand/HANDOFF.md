# XI — Brand Handoff for Code

This folder is everything you need to wire the **XI** brand into the Next.js app. Drop the files in,
follow the prompt below, done. Full identity spec is in **`BRAND.md`** — read it first.

## What's in here
```
XI Brand Handoff/
├─ BRAND.md                      ← the spec (identity, color rule, asset table, wiring, decisions)
├─ components/Brand.tsx          ← ready-to-use React/Next components (BrandMark, AppIcon, BrandBadge, Wordmark, LockupH/Stacked, ParrotMascot)
└─ public/
   ├─ brand/trophy.png           ← primary mark (transparent)
   ├─ brand/icon-tile.png        ← master app-icon tile + nav-badge source
   ├─ brand/parrot.png           ← mascot roundel (mascot only — NOT an avatar)
   ├─ icons/favicon-16/32/48.png
   ├─ icons/apple-touch-icon.png (180)
   ├─ icons/icon-192/512.png      (PWA, purpose:any)
   ├─ icons/icon-maskable-192/512.png (PWA, purpose:maskable)
   └─ site.webmanifest            ← icon src paths point at /icons/*
```
**Placement:** copy `public/` into your app's `public/`, and `components/Brand.tsx` into `components/`.
The manifest's icon paths (`/icons/...`) and the component asset paths (`/brand/...`) assume that layout.

---

## PROMPT FOR CODE — paste this

> Wire the **XI** brand into the app. Assets and a `Brand.tsx` component are provided; full spec in `BRAND.md`.
>
> **The one hard rule:** gold appears **only inside the trophy mark image**. Never use gold in UI chrome,
> text, or any functional state. The functional accent stays **cobalt `#4D8DFF`** (already in `ds.css`).
> The wordmark "XI" is **ivory/ink, never gold, never the accent**.
>
> **Tasks:**
> 1. Copy `public/brand/*`, `public/icons/*`, and `public/site.webmanifest` into the app's `public/`.
>    Copy `components/Brand.tsx` into `components/`.
> 2. In `app/layout.tsx` set:
>    ```ts
>    export const metadata: Metadata = {
>      title: { default: "XI", template: "XI · %s" },
>      description: "Private World Cup fantasy league.",
>      manifest: "/site.webmanifest",
>      icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
>    };
>    export const viewport: Viewport = { themeColor: "#0A0D12" };
>    ```
>    Each route sets its own `title` (e.g. `"Set Lineup"`) so tabs read `XI · Set Lineup`.
> 3. **App shell / nav:** brand region = `<BrandBadge/>` + `"XI"` (Schibsted Grotesk 900), with the
>    **league name** on a secondary line as context. Mobile header = `<BrandBadge/>` + `"XI"`.
> 4. **Auth / join:** `<BrandBadge/>` (or `<LockupStacked/>` on the split-panel layout) + `"XI"` +
>    `{leagueName} · {season}`.
> 5. **Splash / loading:** `<LockupStacked/>`.
> 6. Replace any existing small brand chip (the old letter-"W" badge) with `<BrandBadge/>` everywhere.
>
> **Two locked decisions — do not deviate:**
> - **App name = `XI`** (fixed). The **league name is still a placeholder** (`"WC Fantasy League"`) the
>   commissioner will set later — keep them as distinct values; the nav shows XI as brand + league as context.
> - **The parrot is a mascot, not an avatar.** Use `<ParrotMascot/>` only for personality moments
>   (notification glyph, empty states, splash, loading wink). Manager avatars stay the initials avatar.
>
> Map `--font-display` in `Brand.tsx` to the app's Schibsted Grotesk font variable. PWA install,
> favicons, and apple-touch icon should all resolve from the manifest + layout metadata above.

---

## Reference
- **`BRAND.md`** — the canonical spec (in this folder).
- **Live design**: see `XI Brand.html` (asset sheet) and the wired screens (`App Shell.html`, `Join.html`)
  in the design project for intended placement.
- **Provenance**: the mark is the league's own uploaded image (processed, not redrawn) for a private
  friends' league. If a fully original IP-clean cup is ever wanted as the public mark, that's a separate
  design task — flag it.
