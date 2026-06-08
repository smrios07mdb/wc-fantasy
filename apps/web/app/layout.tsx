import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
// The design system, promoted to the single GLOBAL stylesheet (Prompt 20). Imported AFTER globals.css
// so ds.css wins cascade ties against Tailwind Preflight (e.g. the dark `body` surface below). One
// canonical copy lives here; the feature layouts keep their own byte-identical per-route ds.css (they
// double-load harmlessly — de-duping those is a deliberate post-sprint follow-up, out of scope here).
import "./styles/ds.css";

// XI brand identity + PWA wiring (Prompt 18). Every value is sourced from BRAND.md §3 +
// the brand HANDOFF, not guessed: the product name "XI", the "XI · %s" tab template, the
// favicon/app-icon set, the web manifest, and the cobalt-night theme color. App Router puts
// themeColor in the `viewport` export (not `metadata`) — see BRAND.md §3.
export const metadata: Metadata = {
  title: { default: "XI", template: "XI · %s" },
  description: "Private World Cup fantasy league.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "XI",
    // TODO(confirm): BRAND.md doesn't pin an iOS status-bar style; "default" is the neutral
    // choice and matches the standalone manifest. Revisit in the Prompt 19 visual pass.
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = { themeColor: "#0A0D12" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Collision A resolved (Prompt 20): the old Tailwind light classes (`bg-slate-50 text-slate-900`)
    // were CLASS selectors that out-specified ds.css's `body { background/color }` ELEMENT rule, pinning
    // the app light. Dropping them lets the ds dark surface take effect — and dark is the ds DEFAULT
    // (`:root`), so no `data-theme` attribute is needed. `min-h-screen`/`antialiased` are surface-neutral
    // Tailwind utilities, kept intentionally (Tailwind/Preflight coexist; teardown is post-sprint).
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
