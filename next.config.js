/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
    // Required for src/instrumentation.ts to run at all on Next.js 14.x
    // (stabilizes in 15). Without this flag, register() in instrumentation.ts
    // is silently never called -- ingestion would never start in-process,
    // and the SSE layer (Addendum 2 Section B) would have nothing to
    // publish, with no visible error anywhere. Easy to miss; confirmed
    // required by the Next.js 14.2 docs.
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
