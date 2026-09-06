// One-time historical depth fill (Step 3b). Run once after seeding:
//   npm run seed
//   npm run backfill
// Safe to re-run -- see backfill.ts for why it's idempotent both at the
// per-instrument level (skips already-deep instruments) and at the
// database level (skipDuplicates on the unique constraint).
import { backfillAll } from '../lib/backfill';
import { prisma } from '../lib/db';

async function run() {
  console.log(`[backfill] starting at ${new Date().toISOString()}`);
  const results = await backfillAll();
  const backfilled = results.filter((r) => r.status === 'BACKFILLED');
  const skipped = results.filter((r) => r.status === 'SKIPPED_ALREADY_DEEP').length;
  const failed = results.filter((r) => r.status === 'FAILED');

  const totalDays = backfilled.reduce((sum, r) => sum + (r.daysInserted ?? 0), 0);
  console.log(
    `[backfill] done: ${backfilled.length} instruments backfilled (${totalDays} total rows inserted), ` +
      `${skipped} already had enough depth, ${failed.length} failed`
  );
  if (failed.length > 0) {
    console.log('[backfill] failed symbols (left on live-poll-only depth):', failed.map((r) => r.symbol).join(', '));
  }
}

run()
  .catch((e) => {
    console.error('[backfill] fatal error', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
