// Standalone entrypoint for the polling ingestion job (Tier 1 item 4).
// Run once: `npm run ingest`
// Run continuously: wrap this in a system cron / pm2 / Vercel Cron hitting
// POST /api/cron/ingest instead (see src/app/api/cron/ingest/route.ts), so
// it works the same in serverless deploys where a long-lived process isn't
// available.
import { ingestAll } from '../lib/ingest';
import { prisma } from '../lib/db';

async function run() {
  console.log(`[ingest] starting at ${new Date().toISOString()}`);
  const results = await ingestAll();
  const live = results.filter((r) => r.status === 'LIVE').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log(`[ingest] done: ${live} live, ${failed} failed (failed instruments keep serving their last STALE snapshot)`);
  if (failed > 0) {
    console.log('[ingest] failed symbols:', results.filter((r) => r.status === 'FAILED').map((r) => r.symbol).join(', '));
  }
}

run()
  .catch((e) => {
    console.error('[ingest] fatal error', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
