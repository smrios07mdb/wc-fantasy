import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// apps/web is the only package using the Next.js `@/*` app alias; everything else resolves via pnpm
// symlinks. Mapping it here lets co-located component tests mount REAL app-router components that import
// via `@/…` (e.g. WaiversClient → @/components/NationFilter).
const webDir = fileURLToPath(new URL("./apps/web/", import.meta.url));

// Boring + reliable: a single root Vitest project. Scoring is a pure package, so the default
// Node environment is all it needs. `@app/*` workspace imports resolve through each package's
// pnpm symlinked node_modules (every package depends on @app/shared), so no aliases are required.
export default defineConfig({
  // Most suites are pure Node (default environment). A few React component tests opt into jsdom via a
  // per-file `// @vitest-environment jsdom` docblock; this `jsx: "automatic"` lets the transform (oxc,
  // since Vitest 4 bundles rolldown-vite) compile their `.tsx` — and the components they mount — with
  // the React 17+ runtime, so no `import React` is needed.
  oxc: { jsx: "automatic" },
  // Resolve apps/web's `@/*` alias so jsdom component tests can mount its app-router components.
  resolve: { alias: [{ find: /^@\//, replacement: webDir }] },
  test: {
    // Packages hold the pure logic; apps (e.g. apps/web) carry a few unit tests too.
    // `apps/**/lib/**` covers app-level pure helpers (e.g. apps/web/lib/site-origin). `.tsx` is matched
    // so co-located React component tests (e.g. app/lineup/FormationPicker.test.tsx) run too.
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.{ts,tsx}",
      "apps/**/app/**/*.test.{ts,tsx}",
      "apps/**/lib/**/*.test.ts",
      // Shared presentational components (e.g. apps/web/components/Brand) carry node-safe smoke tests.
      "apps/**/components/**/*.test.{ts,tsx}",
    ],
    // Keep build artefacts and deps out of the run (the scoring suite is the only suite for now).
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
