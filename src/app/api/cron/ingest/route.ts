import { NextRequest, NextResponse } from 'next/server';
import { ingestAll } from '@/lib/ingest';
import { jsonError } from '@/lib/apiHelpers';

// Point an external scheduler (Vercel Cron, GitHub Actions, a plain crontab
// curl) at this route every INGEST_INTERVAL_SECONDS. Protected by a shared
// secret rather than user auth, since it's a machine-to-machine call.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Fail CLOSED — if CRON_SECRET is unset (empty string or undefined),
  // refuse the request outright instead of skipping the check and leaving
  // this endpoint (which triggers real external API calls against market
  // data providers) callable by anyone with no authentication.
  if (!secret) {
    return jsonError(401, 'CRON_SECRET is not configured — refusing request');
  }

  const provided = req.headers.get('x-cron-secret');
  if (provided !== secret) {
    return jsonError(401, 'Unauthorized');
  }

  const results = await ingestAll();
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    live: results.filter((r) => r.status === 'LIVE').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    results,
  });
}
