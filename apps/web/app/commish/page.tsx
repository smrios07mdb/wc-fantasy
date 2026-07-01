/**
 * `/commish` — the commissioner console (Commissioner console Thread 1). The FIRST commissioner-only PAGE in
 * the app. The gate is the pure `resolveCommishAccess` (mirrors api/draft/timer): logged-out → /sign-in, any
 * non-`ok` or a logged-in non-commissioner → /auth/denied, a commissioner → the console. "Commissioner" is
 * `resolveCommissioner` (the is_commissioner flag OR the commissioner email) — the same gate the worker CLI
 * uses. All reads run through the owner-bypass `loadCommish`; `?as=<managerId>` drives the read-only view-as
 * inspector (NOT session impersonation).
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { resolveCommishAccess } from "@/src/commish/commishGate";
import { loadCommish } from "./loadCommish";
import { CommishConsole } from "./CommishConsole";

export const dynamic = "force-dynamic";

export default async function CommishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const outcome = await getSessionManager();
  const access = resolveCommishAccess(outcome);
  if (access.kind === "redirect") redirect(access.to);

  const params = await searchParams;
  const asParam = params.as;
  const selectedManagerId = typeof asParam === "string" ? asParam : null;

  const view = await loadCommish(access.managerId, selectedManagerId);
  if (!view) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: "48px 18px" }}>
        <div className="card" style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h2 className="t-h3">Console unavailable</h2>
          <p className="t-body text-secondary" style={{ marginTop: 8 }}>
            We couldn&rsquo;t resolve your league. Try again shortly.
          </p>
        </div>
      </div>
    );
  }

  return <CommishConsole view={view} />;
}
