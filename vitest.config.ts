import { defineConfig } from "vitest/config";

// Boring + reliable: a single root Vitest project. Scoring is a pure package, so the default
// Node environment is all it needs. `@app/*` workspace imports resolve through each package's
// pnpm symlinked node_modules (every package depends on @app/shared), so no aliases are required.
export default defineConfig({
  test: {
    // Packages hold the pure logic; apps (e.g. the scraper edge) carry a few unit tests too.
    // `apps/**/lib/**` covers app-level pure helpers (e.g. apps/web/lib/site-origin).
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/**/lib/**/*.test.ts",
    ],
    // Keep build artefacts and deps out of the run (the scoring suite is the only suite for now).
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
