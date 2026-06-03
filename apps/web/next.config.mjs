/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Internal packages ship TypeScript source (no build step) — Next transpiles them.
  transpilePackages: ["@app/db", "@app/shared", "@app/scoring", "@app/feed"],
  // Keep the Prisma engine out of the bundle (native binary; server-only).
  serverExternalPackages: ["@prisma/client"],
  // Lint is a separate repo-root step (`pnpm lint`), not part of the build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
