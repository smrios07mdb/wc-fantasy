# BRAND.md — XI

> **Audience:** Claude Code (Next.js App Router + React + TS + Tailwind).
> **Scope:** the app's identity — name, mark, mascot, wordmark, the production icon/manifest set,
> and exactly where the brand renders in-product. Pairs with `COMPONENT_MAP.md` (component vocabulary)
> and `ds/ds.css` (tokens). Visual reference: **`XI Brand.html`** (browsable asset sheet).

---

## 1. The identity in one paragraph
The app is **XI** — the Roman numeral for the starting eleven. Tagline: **"The Starting Eleven."**
The mark is a pixel-art World Cup trophy with a small green **parrot** peeking out from behind the
figures — the parrot is the personality; keep it. The mark is **gold + green**; the wordmark is
**ivory/ink, never gold**.

### The one color rule that matters
**Gold lives _only_ inside the trophy mark.** It must never leak into UI chrome, text, or functional
state. The product's functional accent stays **cobalt `#4D8DFF`** (see `ds/ds.css`), and the
"gold is removed project-wide" rule in `COMPONENT_MAP.md §0` still holds for everything that isn't
the logo image itself.

---

## 2. Asset inventory
Source-of-truth files live in `logo/`. Production placement assumes a Next.js `app/` + `public/` layout.

| File (this repo) | Size | Format | Purpose | Next.js placement |
|---|---|---|---|---|
| `logo/trophy.png` | 502×1322 | PNG, transparent | **Primary mark.** Lockups, splash, any large display. | `public/brand/trophy.png` |
| `logo/icon-tile.png` | 512×512 | PNG, opaque | Master app-icon art (trophy on deep cobalt-night field). Also the source for the small brand badge. | `public/brand/icon-tile.png` |
| `logo/parrot-round.png` | 254×254 | PNG, circular | **Mascot roundel** (see §6 — mascot only, not an avatar). | `public/brand/parrot.png` |
| `logo/icons/favicon-16.png` · `-32.png` · `-48.png` | 16/32/48 | PNG | Browser favicons | `app/icon.png` (Next auto-derives sizes) **or** `public/icons/` |
| `logo/icons/apple-touch-icon.png` | 180×180 | PNG, opaque | iOS home-screen icon | `app/apple-icon.png` |
| `logo/icons/icon-192.png` · `icon-512.png` | 192/512 | PNG | PWA install icons, `purpose:"any"` | `public/icons/` (referenced by manifest) |
| `logo/icons/icon-maskable-192.png` · `-512.png` | 192/512 | PNG | PWA **maskable** icons (trophy inside the 80% safe zone) | `public/icons/` (referenced by manifest) |
| `logo/icons/site.webmanifest` | — | JSON | Web-app manifest | `public/site.webmanifest` **or** generate via `app/manifest.ts` |

> All icon tiles share one recipe: trophy at ~78% height on a radial **`#1B2E52 → #101A2E → #0A0D14`**
> cobalt-night field. Maskable variants drop the trophy to ~55% so it survives circular/rounded masks.
> Regenerate from `logo/trophy.png` if you need other sizes — don't re-key the mark from the JPEG.

---

## 3. Manifest & Next.js head wiring
`logo/icons/site.webmanifest` (icon `src` paths assume the files sit in **`public/icons/`**):

```jsonc
{
  "name": "XI — The Starting Eleven",
  "short_name": "XI",
  "description": "Private World Cup fantasy league.",
  "id": "/", "start_url": "/", "display": "standalone",
  "background_color": "#0A0D12", "theme_color": "#0A0D12",
  "icons": [
    { "src": "/icons/favicon-32.png",        "sizes": "32x32",   "type": "image/png" },
    { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

In **`app/layout.tsx`**, the App-Router-native way (no manual `<link>` tags needed once files use the
`app/icon.png` / `app/apple-icon.png` convention):

```ts
export const metadata: Metadata = {
  title: { default: "XI", template: "XI · %s" },   // tab titles: "XI · Set Lineup", etc.
  description: "Private World Cup fantasy league.",
  manifest: "/site.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0A0D12" };
```

The prototypes wire the equivalent by hand (`<link rel="icon|apple-touch-icon|manifest">` +
`<meta name="theme-color">` after `<title>`, and titles prefixed `XI · …`) — that's prototype-only;
prefer the `app/` conventions in production.

---

## 4. Components (port from `logo/logo.jsx`)
All are thin wrappers over the raster mark — no procedural drawing. Pixel values below are the
reference; convert to your component API / Tailwind as you like.

| Component | Props | Notes |
|---|---|---|
| **BrandMark** (`Trophy`) | `h` (height px) | `<img src=trophy.png>`, width auto. The mark on transparency. |
| **AppIcon** | `size`, `radius` (≈0.224) | the squircle tile (`icon-tile.png`). |
| **Wordmark** | `size`, `dark`, `tagline` | "XI" in **Schibsted Grotesk 900**, letter-spacing −0.01em; tagline "THE STARTING ELEVEN" in **Schibsted Grotesk 600**, uppercase, tracking 0.32em. Color = `--text-primary` (ivory/ink) — **never gold**. |
| **LockupH** | `dark`, `h`, `tagline` | trophy · hairline rule · wordmark. Nav/header use. |
| **LockupStacked** | `dark`, `h`, `tagline` | trophy over "XI" over tagline. Splash / loading / auth panel. |
| **NavLockup** | `dark`, `h` | compact: small trophy + "XI". Top bars. |
| **Parrot** | `size`, `ring` | mascot roundel (`parrot-round.png`). |

---

## 5. Where the brand renders in-product
| Surface | Treatment | Wired in (reference) |
|---|---|---|
| Desktop sidebar / top bar | trophy badge + **"XI"** with the **league name** as the secondary line | `shell/components.jsx` `ShellBrand` |
| Mobile header | trophy badge + **"XI"** | `shell/mobile.jsx` |
| Auth / Join | trophy badge + **"XI"** + `{league} · {season}`; split layout = brand-panel splash | `auth/components.jsx` `AuthLogo` + brand rows |
| Splash / loading | `LockupStacked` | see `XI Brand.html` → "Launch splash" |
| Browser tab | favicon (`icon-tile` reads down to 16px) | every prototype head |
| Small brand badge (everywhere) | the shared **`.vf-logo`** 28px chip is now the trophy on a night field (was a letter "W") | per-screen `<style>` `.vf-logo` (and `.dr-logo` / `.cm-logo` / `.logo` / `.au-logo` variants) |
| Landing CTA card | `parrot.png` roundel, `.lp-cta-parrot` (66px, ring) | `app/_landing/MarketingLanding.tsx`, `landing.css` |
| `/playoffs` Guillotine screenhead | `parrot.png` roundel, `.po-parrot` (24px, inline header chip — route-scoped, NOT a second brand lockup) | `app/playoffs/PlayoffsClient.tsx`, `playoffs.css` |

**App name vs league name:** **XI** is the product (fixed). The **league name** is still the
`"WC Fantasy League"` placeholder (`COMPONENT_MAP.md §0` — a 4-spot swap, +`SHELL_LEAGUE_NAME`).
The nav shows **XI** as the brand and the league name as context; don't conflate them.

---

## 6. The parrot is a MASCOT, not an avatar (decision)
Use the parrot for **personality** moments only: a notification/empty-state glyph, a loading wink,
a fun alt-favicon, splash flourish. **Do not** use it as the default manager avatar — manager avatars
stay the initials `Avatar` (`vsfield/components.jsx`). (User decision, locked.)

First two personality moments shipped: the landing CTA card and the `/playoffs` screenhead (§5
table above). Both are decorative `<img alt="">`, route-scoped CSS, no avatar surface touched —
`vsFieldSkin.test.ts`'s no-parrot-on-avatars guard still passes.

---

## 7. Type & color quick-ref
- **Wordmark "XI":** Schibsted Grotesk **900**, `letter-spacing −0.01em`.
- **Tagline:** Schibsted Grotesk **600**, uppercase, `letter-spacing 0.32em`, color `--text-tertiary/secondary`.
- **Brand badge field:** `#0A0D12` base behind `icon-tile.png` (the tile's own field is the cobalt-night gradient above).
- **Wordmark color:** `--text-primary`. **Never gold, never the accent.**

---

## 8. Provenance / IP note
The mark is the league's **own uploaded image**, used as-is for a private friends' league (parody mascot
added). It was processed (background removed, retiled), **not redrawn**. If a fully original, IP-clean cup
is ever wanted as the public mark, that's a separate design task — flag it and it'll be drawn from scratch.
