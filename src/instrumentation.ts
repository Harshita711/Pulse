// Next.js runs this once when the server process boots (nodejs runtime
// only -- not on the edge runtime, and not per-request). This is what lets
// the in-process event bus (eventBus.ts) actually work: ingestion and the
// SSE endpoint (/api/stream) need to live in the same process for an
// EventEmitter to carry messages between them, which is why polling now
// starts here instead of running in a separate container.
//
// Set ENABLE_INPROCESS_INGEST=false to disable this (e.g. if you're running
// ingestion as an external cron hitting POST /api/cron/ingest instead --
// the right choice for a serverless deploy, where a process never stays
// alive long enough for setInterval to matter, and where the in-process
// event bus can't work across instances anyway).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Fail fast: a missing JWT secret should crash server boot with a clear
  // message, not silently sign tokens with a hardcoded fallback later.
  const { validateEnv } = await import('./lib/env');
  validateEnv();

  if (process.env.ENABLE_INPROCESS_INGEST === 'false') return;

  const globalForIngest = globalThis as unknown as { pulseIngestStarted?: boolean };
  if (globalForIngest.pulseIngestStarted) return; // survive Next.js dev-mode hot reload
  globalForIngest.pulseIngestStarted = true;

  const { ingestAll } = await import('./lib/ingest');
  const intervalMs = Number(process.env.INGEST_INTERVAL_SECONDS ?? 60) * 1000;

  console.log(`[instrumentation] starting in-process ingestion loop, every ${intervalMs / 1000}s`);

  const run = () => {
    // Step 4a: an unambiguous log line on every cycle, independent of
    // whether ingestAll() succeeds -- this is the thing to grep server
    // logs for to tell "the scheduler stopped firing" apart from "the
    // scheduler fires every cycle but every fetch is failing" (e.g. a
    // network/rate-limit issue reaching the market data providers), which
    // look identical from the UI (both show permanently STALE data) but
    // have completely different fixes.
    console.log('[ingest] cycle started', new Date().toISOString());
    ingestAll()
      .then((results) => {
        const live = results.filter((r) => r.status === 'LIVE').length;
        const failed = results.filter((r) => r.status === 'FAILED').length;
        console.log(`[ingest] cycle finished ${new Date().toISOString()} -- ${live} live, ${failed} failed`);
      })
      .catch((err) => console.error('[instrumentation] ingest cycle failed', err));
  };
  run(); // first pass immediately on boot, rather than waiting a full interval
  setInterval(run, intervalMs);
}
