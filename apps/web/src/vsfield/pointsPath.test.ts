/**
 * Path-(a) invariant guard (Prompt 41). Per-player points reach the client ONLY inside the
 * server-composed snapshot: the SERVER loader reads `score_player_match`; the BROWSER live path never
 * does — its direct read scope stays `score_manager_period` + `standing`. This test locks that boundary
 * so a future edit can't quietly add a browser-direct read or a new subscription to per-player rows.
 *
 * Source is read from disk and comments are STRIPPED first, so prose mentioning a table name (e.g. a
 * comment explaining the client does NOT read it) can't create a false positive — only real code counts.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// apps/web/ (this file lives at apps/web/src/vsfield/).
const WEB_ROOT = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, WEB_ROOT), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const PLAYER_SCORE_RE = /score_player_match|scorePlayerMatch/;

// The browser live path: every file that runs in the client and touches Supabase / the snapshot directly.
const BROWSER_PATH = [
  "app/vsfield/VsFieldClient.tsx",
  "src/vsfield/liveController.ts",
  "src/vsfield/realtime.ts",
  "src/vsfield/snapshotClient.ts",
];

describe("vsfield per-player points are server-composed only (path-a invariant)", () => {
  for (const rel of BROWSER_PATH) {
    it(`${rel} has NO direct score_player_match read`, () => {
      expect(stripComments(read(rel))).not.toMatch(PLAYER_SCORE_RE);
    });
  }

  it("the Realtime subscription binds ONLY to score_manager_period + standing (never score_player_match)", () => {
    const code = stripComments(read("src/vsfield/realtime.ts"));
    expect(code).toMatch(/score_manager_period/);
    expect(code).toMatch(/standing/);
    expect(code).not.toMatch(PLAYER_SCORE_RE);
  });

  it("the SERVER loader IS the (sole) source of per-player points — it reads score_player_match", () => {
    expect(stripComments(read("app/vsfield/loadVsField.ts"))).toMatch(/scorePlayerMatch/);
  });
});
