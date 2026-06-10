"use client";
/**
 * Notifications client island for /settings (Prompt 41a). Three preference toggles + an "Enable browser
 * notifications" button (permission → register /sw.js → subscribe → POST /subscribe via the injectable
 * {@link enableBrowserPush}) + a "Send test" button. Mirrors `SettingsClient`: small client island,
 * inline status, ds.css primitives (no gold — the toggles + buttons are the only accents).
 *
 * The browser primitives are read from `window`/`navigator` here and handed to the pure helper; the
 * VAPID public key is the build-time `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined at `next build`).
 */
import { useState } from "react";
import type { NotificationPreference } from "@app/notify";
import { enableBrowserPush, type PushBrowserEnv } from "./pushClient";

const TOGGLES: { key: keyof NotificationPreference; label: string; hint: string }[] = [
  { key: "draftTurn", label: "Draft turn", hint: "When it's your pick on the clock." },
  {
    key: "playerNotStarting",
    label: "Player not starting",
    hint: "When one of your starters is left out of the XI.",
  },
  {
    key: "matchStarting",
    label: "Match starting",
    hint: "When a fixture in your lineup kicks off.",
  },
];

function browserEnv(): PushBrowserEnv | null {
  if (typeof window === "undefined") return null;
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return null;
  }
  return {
    requestPermission: () => Notification.requestPermission(),
    serviceWorker: navigator.serviceWorker,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    fetch: window.fetch.bind(window),
  };
}

export function NotificationsClient({ initial }: { initial: NotificationPreference }) {
  const [prefs, setPrefs] = useState<NotificationPreference>(initial);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [enableStatus, setEnableStatus] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  async function persist(next: NotificationPreference) {
    const previous = prefs;
    setPrefs(next); // optimistic
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) setPrefs(previous); // roll back on failure
    } catch {
      setPrefs(previous);
    } finally {
      setSavingPrefs(false);
    }
  }

  function toggle(key: keyof NotificationPreference) {
    void persist({ ...prefs, [key]: !prefs[key] });
  }

  async function handleEnable() {
    setEnableStatus(null);
    const env = browserEnv();
    if (!env) {
      setEnableStatus("This browser doesn't support push notifications.");
      return;
    }
    setEnableStatus("Enabling…");
    const result = await enableBrowserPush(env);
    if (result.ok) {
      setEnableStatus("Browser notifications enabled on this device.");
    } else if (result.reason === "denied") {
      setEnableStatus("Permission was blocked — enable notifications in your browser settings.");
    } else if (result.reason === "unsupported") {
      setEnableStatus("Push isn't configured yet — try again later.");
    } else {
      setEnableStatus("Couldn't register this device — try again.");
    }
  }

  async function handleTest() {
    setTestStatus("Sending…");
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      if (!res.ok) {
        setTestStatus("Couldn't send a test — try again.");
        return;
      }
      const data = (await res.json()) as { sent: number };
      setTestStatus(
        data.sent > 0
          ? `Test sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`
          : "No devices registered yet — enable notifications first.",
      );
    } catch {
      setTestStatus("Couldn't send a test — try again.");
    }
  }

  return (
    <section>
      <h2 className="se-section-title">Notifications</h2>

      <div className="se-toggles">
        {TOGGLES.map((t) => (
          <label key={t.key} className="se-toggle">
            <span className="se-toggle-txt">
              <span className="se-toggle-label">{t.label}</span>
              <span className="se-toggle-hint">{t.hint}</span>
            </span>
            <input
              type="checkbox"
              className="se-toggle-input"
              checked={prefs[t.key]}
              disabled={savingPrefs}
              onChange={() => toggle(t.key)}
            />
            <span aria-hidden="true" className="se-toggle-track" />
          </label>
        ))}
      </div>

      <div className="se-notif-actions">
        <button type="button" className="btn btn-primary" onClick={handleEnable}>
          Enable browser notifications
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleTest}>
          Send test
        </button>
      </div>

      {enableStatus && (
        <p className="se-notif-status" role="status">
          {enableStatus}
        </p>
      )}
      {testStatus && (
        <p className="se-notif-status" role="status">
          {testStatus}
        </p>
      )}
    </section>
  );
}
