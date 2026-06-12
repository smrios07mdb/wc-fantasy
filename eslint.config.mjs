// Flat ESLint config, run once from the repo root (`pnpm lint`).
// Non-type-checked recommended rules: fast and reliable for a small monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/*.d.ts",
      "**/.prisma/**",
      "packages/db/prisma/migrations/**",
      ".remember/**",
      // Nested git worktrees (e.g. `.claude/worktrees/<branch>/`) are full repo
      // checkouts — never lint into them, and never copy/inherit the root config there.
      "**/.claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // The Next.js app runs in the browser too (client components use `window`, etc.).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // The plain service worker (Prompt 41a) runs in the ServiceWorkerGlobalScope (`self`, `clients`,
  // `registration`) — not the window/node scopes above.
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  // Prettier last: turn off rules that conflict with the formatter.
  prettier,
);
