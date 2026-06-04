/**
 * Safe post-auth redirect targets (the open-redirect guard for `/auth/callback`). A pure decision —
 * "is this `next` a same-origin, path-absolute reference?" — so it lives in the @app/auth core
 * (mirrors {@link ./allowlist.isEmailAllowed}), DB/Supabase/clock/env-free and unit-testable.
 *
 * Why this matters: the callback builds `${origin}${next}` where `origin` has NO trailing slash, so a
 * `next` that is not a single-leading-slash path escapes the origin (e.g. `@evil.com` -> host evil.com,
 * `.evil.com`, `//evil.com`, `/\evil.com`). We accept ONLY a path-absolute, same-origin reference.
 */

export function isSafeRelativePath(next: string | null | undefined): next is string {
  if (typeof next !== "string" || next.length === 0) return false;
  if (!next.startsWith("/")) return false; // must be path-absolute (rejects @evil.com / .evil.com / evil.com)
  if (next.startsWith("//")) return false; // protocol-relative -> another host
  if (next.startsWith("/\\")) return false; // backslash trick -> //host after browser normalization
  try {
    // Resolve against a placeholder base (keeps this pure — no real origin needed). Anything that
    // lands off that origin, or smuggles credentials, is unsafe.
    const base = "https://app.invalid";
    const url = new URL(next, base);
    return url.origin === base && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/** The validated `next`, or `fallback` ("/") when it is unsafe/absent. */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  return isSafeRelativePath(next) ? next : fallback;
}
