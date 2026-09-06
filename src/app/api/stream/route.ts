import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { subscribeSnapshotUpdates, SnapshotUpdate } from '@/lib/eventBus';
import { getRelevantInstrumentIds } from '@/lib/dashboardService';

// SSE must never be statically optimized or cached -- each connection is a
// live, per-user stream.
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;
const REFRESH_RELEVANT_IDS_MS = 30_000;

function sseMessage(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const authUser = await getCurrentUser();
  if (!authUser) {
    return new Response('Not authenticated', { status: 401 });
  }
  const userId = authUser.sub;

  let relevantIds = await getRelevantInstrumentIds(userId);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed (client disconnected) -- cleanup runs below
        }
      };

      // Tell the client the stream is live -- lets the reconnect hook
      // distinguish "connected, just quiet" from "never connected".
      send(sseMessage({ type: 'connected' }));

      const onUpdate = (update: SnapshotUpdate) => {
        if (!relevantIds.has(update.instrumentId)) return;
        send(sseMessage({ type: 'snapshot', ...update }));
      };
      const unsubscribe = subscribeSnapshotUpdates(onUpdate);

      // Addendum 2 Section B flow diagram: "push only the changed
      // instruments' new snapshot + score to connections whose user has
      // that instrument in a watchlist or relationship." That set can
      // change mid-session (adding a stock to a watchlist), so refresh it
      // periodically rather than computing it once at connection open.
      const refreshInterval = setInterval(() => {
        getRelevantInstrumentIds(userId)
          .then((ids) => {
            relevantIds = ids;
          })
          .catch(() => {
            /* keep the previous set on a transient DB error */
          });
      }, REFRESH_RELEVANT_IDS_MS);

      // SSE comment lines (":") are ignored by EventSource but keep
      // intermediate proxies/load balancers from timing out an idle
      // connection.
      const heartbeatInterval = setInterval(() => send(': heartbeat\n\n'), HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(refreshInterval);
        clearInterval(heartbeatInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx response buffering, if deployed behind it
    },
  });
}
