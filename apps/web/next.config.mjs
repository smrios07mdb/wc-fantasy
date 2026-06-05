import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Internal packages ship TypeScript source (no build step) — Next must transpile every one the
  // app imports. @app/auth + @app/draft are consumed by route handlers/server code, so they belong
  // here too (omitting them risks Next treating their raw .ts as an external package on Linux builds).
  transpilePackages: [
    "@app/db",
    "@app/shared",
    "@app/scoring",
    "@app/feed",
    "@app/auth",
    "@app/draft",
  ],
  // Keep the Prisma engine out of the bundle (native binary; server-only).
  serverExternalPackages: ["@prisma/client"],
  // Lint is a separate repo-root step (`pnpm lint`), not part of the build.
  eslint: { ignoreDuringBuilds: true },
  // In a pnpm monorepo the Prisma query engine binary lives deep in the .pnpm store, and Next's
  // output tracing does NOT copy it next to the server bundle — so at runtime the client throws
  // "could not locate the Query Engine ... bundler has not copied libquery_engine-…". `binaryTargets`
  // (schema.prisma) ensures the engine is GENERATED; this plugin ensures it's COPIED into the build
  // output on the server compilation. Canonical fix: https://pris.ly/d/engine-not-found-nextjs
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
