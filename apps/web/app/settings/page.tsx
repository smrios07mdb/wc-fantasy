/**
 * The /settings surface — AUTHENTICATED (ARCHITECTURE.md §6). Gates identically to the other
 * shell screens (Prompt 07 primitive): no session → /sign-in; not-allowlisted / no linked
 * manager → /auth/denied. Built sections: "Public profile" (Prompt 39: display-name rename) and
 * "Notifications" (Prompt 41a: Web Push opt-in + per-channel toggles). The remaining sections are
 * explicit TODO(confirm) seams. The rename + notifications forms are small client islands; everything
 * else is server-rendered.
 *
 * Realtime propagation: neither a rename nor a preference change is broadcast via postgres_changes —
 * they apply on the next server render / navigation. Push notifications themselves are server→device
 * (no Realtime), so this whole surface keeps the scope clean (no publication change needed).
 */
import { redirect } from "next/navigation";
import { prisma } from "@app/db";
import { createPrismaNotifyStore } from "@app/notify/prisma";
import { getSessionManager } from "@/lib/auth/manager";
import { SettingsClient } from "@/src/settings/SettingsClient";
import { NotificationsClient } from "@/src/notifications/NotificationsClient";
import "./settings.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const outcome = await getSessionManager();
  if (outcome.kind === "no-session") redirect("/sign-in");
  if (outcome.kind !== "ok") redirect("/auth/denied");

  // Seed the notification toggles from the manager's current preferences (lazily upserted-with-defaults
  // on first read — no provisioning step writes them). The triggers that FIRE each channel are 41b.
  const notificationPrefs = await createPrismaNotifyStore(prisma).getPreference(outcome.manager.id);

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

      {/* § Notifications — Web Push opt-in + per-channel toggles (Prompt 41a) */}
      <div className="card se-card">
        <NotificationsClient initial={notificationPrefs} />
      </div>

      {/* TODO(confirm): Account section — email / sign-out-all-devices. */}
      {/* TODO(confirm): Appearance section — theme / density preferences. */}
      {/* TODO(confirm): League section — read-only league info + commissioner entry point. */}
      {/* TODO(confirm): Danger section — account removal / data export. */}
    </div>
  );
}
