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
};

export default nextConfig;
