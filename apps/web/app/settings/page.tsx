/**
 * The /settings surface — AUTHENTICATED (ARCHITECTURE.md §6). Gates identically to the other
 * shell screens (Prompt 07 primitive): no session → /sign-in; not-allowlisted / no linked
 * manager → /auth/denied. The only built section is "Public profile" (Prompt 39: display-name
 * rename). All other sections are explicit TODO(confirm) seams — same treatment as the AppShell
 * nav entries that aren't built yet. The rename form is a small client island (`SettingsClient`);
 * everything else is server-rendered.
 *
 * Realtime propagation: a rename is NOT broadcast via postgres_changes — it appears to other
 * clients on their next server render / navigation. This is intentional (renames are not
 * time-sensitive like picks) and keeps the scope clean (no publication change needed).
 */
import { redirect } from "next/navigation";
import { getSessionManager } from "@/lib/auth/manager";
import { SettingsClient } from "@/src/settings/SettingsClient";
import "./settings.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  return (
    <div className="se-page">
      <header className="se-head">
        <h1>Settings</h1>
        <p>Manage your profile and preferences.</p>
      </header>

      {/* § Profile — display-name rename (Prompt 39) */}
      <div className="card se-card">
        <SettingsClient currentName={outcome.manager.displayName} />
      </div>

      {/* TODO(confirm): Account section — email / sign-out-all-devices. */}
      {/* TODO(confirm): Notifications section — matchday digest / pick-alert preferences. */}
      {/* TODO(confirm): Appearance section — theme / density preferences. */}
      {/* TODO(confirm): League section — read-only league info + commissioner entry point. */}
      {/* TODO(confirm): Danger section — account removal / data export. */}
    </div>
  );
}
