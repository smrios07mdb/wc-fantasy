/**
 * Public origin for server-side redirects.
 * Order: explicit env (prod, pinned) → forwarded host (proxy) → request origin (local dev).
 * Never trusts the raw request origin in prod: on Render, request.url's host is the
 * internal bind (localhost:10000).
 */
export function siteOrigin(request: Request): string {
  const env = process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, ""); // pinned + Host-header-injection-proof

  const xfHost = request.headers.get("x-forwarded-host");
  if (xfHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${xfHost}`;
  }

  return new URL(request.url).origin; // local dev: correct scheme + host
}
