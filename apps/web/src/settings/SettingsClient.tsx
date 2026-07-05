"use client";
/**
 * Profile-rename client island for the /settings page. Handles the POST to
 * `/api/manager/display-name`, shows inline field errors (400/409) and a transient
 * success toast (200). Everything else on the /settings page is server-rendered.
 */
import { useState } from "react";

function resolveError(code: string | undefined): string {
  if (code === "empty") return "Display name cannot be empty.";
  if (code === "too_long") return "Display name must be 40 characters or fewer.";
  if (code === "name_taken") return "That name is taken in your league.";
  return "Something went wrong — try again.";
}

export function SettingsClient({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/manager/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        const data = (await res.json()) as { displayName: string };
        setName(data.displayName);
        setSaved(true);
        setTimeout(() => setSaved(false), 4000);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(resolveError(data.error));
      }
    } catch {
      setError(resolveError(undefined));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="se-section-title">Public profile</h2>
      <form className="se-form" onSubmit={handleSave}>
        <div className="se-field">
          <label className="field-label" htmlFor="se-display-name">
            Display name
          </label>
          <input
            id="se-display-name"
            type="text"
            className={`input${error ? " is-error" : ""}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              setSaved(false);
            }}
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={40}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary se-save" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <div className="toast toast-success se-toast" role="status">
            <span>Changes saved.</span>
          </div>
        )}
      </form>
    </section>
  );
}
