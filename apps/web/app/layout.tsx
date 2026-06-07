import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
