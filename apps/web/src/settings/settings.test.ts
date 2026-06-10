import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pure-Node source-contract smoke for the /settings route + migration (Prompt 39).
// No DOM/JSX transform in this Vitest run — verify the load-bearing contracts from source.
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const page = read("../../app/settings/page.tsx");
const layout = read("../../app/settings/layout.tsx");
const client = read("./SettingsClient.tsx");
const migration = read(
  "../../../../packages/db/prisma/migrations/20260610120000_manager_display_name_unique/migration.sql",
);

describe("SettingsClient — client island wiring", () => {
  it("is a Client Component (needs state + fetch)", () => {
    expect(client).toMatch(/^\s*["']use client["']/m);
  });

  it("POSTs to /api/manager/display-name with POST method", () => {
    expect(client).toContain('"/api/manager/display-name"');
    expect(client).toContain('"POST"');
  });

  it("handles the name_taken error with the expected user-facing message", () => {
    expect(client).toContain("That name is taken in your league.");
  });

  it("shows a success toast on 200 and updates the field value", () => {
    expect(client).toContain("Changes saved.");
    expect(client).toContain("setSaved(true)");
    expect(client).toContain("setName(data.displayName)");
  });
});

describe("/settings page — server-rendered gate + profile section", () => {
  it("is auth-gated via getSessionManager", () => {
    expect(page).toContain("getSessionManager");
    expect(page).toContain('redirect("/sign-in")');
    expect(page).toContain('redirect("/auth/denied")');
  });

  it("is forced dynamic (auth gate reads session cookie)", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("pre-fills the form with the current display name from the manager outcome", () => {
    expect(page).toContain("outcome.manager.displayName");
    expect(page).toContain("currentName={outcome.manager.displayName}");
  });

  it("mounts the SettingsClient island", () => {
    expect(page).toContain("SettingsClient");
  });

  it("mounts the NotificationsClient island seeded from current prefs (Prompt 41a)", () => {
    expect(page).toContain("NotificationsClient");
    expect(page).toContain("createPrismaNotifyStore");
    expect(page).toContain("getPreference(outcome.manager.id)");
  });

  it("leaves the REMAINING sections as explicit TODO(confirm) seams (Notifications now built)", () => {
    expect(page).toContain("TODO(confirm): Account");
    expect(page).toContain("TODO(confirm): Appearance");
    expect(page).toContain("TODO(confirm): League");
    expect(page).toContain("TODO(confirm): Danger");
    // The Notifications seam is FILLED in Prompt 41a — it must no longer be a TODO.
    expect(page).not.toContain("TODO(confirm): Notifications");
  });
});

describe("/settings layout — AppShell mounting", () => {
  it("mounts AppShell with active=settings", () => {
    expect(layout).toContain('active="settings"');
    expect(layout).toContain("AppShell");
  });

  it("sets the dark+cobalt theme (matches all other shell screens)", () => {
    expect(layout).toContain('data-theme="dark"');
    expect(layout).toContain('data-accent="cobalt"');
  });
});

describe("migration 20260610120000 — case-insensitive per-league unique index", () => {
  it("creates a UNIQUE INDEX (not just an index)", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX/i);
  });

  it("names the index according to the project convention", () => {
    expect(migration).toContain('"manager_league_id_lower_display_name_key"');
  });

  it("scopes uniqueness to the league_id column", () => {
    expect(migration).toContain('"league_id"');
  });

  it("uses lower() for case-insensitive enforcement", () => {
    expect(migration).toContain('lower("display_name")');
  });

  it("targets the manager table", () => {
    expect(migration).toMatch(/ON\s+"manager"/i);
  });

  it("includes the operator note about duplicate detection", () => {
    expect(migration).toContain("SELECT league_id, lower(display_name)");
  });
});
