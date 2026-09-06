import { EventEmitter } from 'events';

// Addendum 2 Section B: "publishes to an in-process event emitter (or Redis
// pub/sub if you add caching)". This only carries events across requests
// that land in the *same* Node process -- which is why ingestion now runs
// in-process via instrumentation.ts (see below) rather than as a separate
// container hitting /api/cron/ingest. If you outgrow a single instance
// (multiple app replicas behind a load balancer), swap this module's
// implementation for Redis pub/sub without changing any caller -- the
// publish/subscribe shape below is deliberately Redis-shaped already.

export interface SnapshotUpdate {
  instrumentId: string;
  symbol: string;
  price: number;
  changePercent: number;
  score: number | null;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  timestamp: string;
}

const globalForBus = globalThis as unknown as { pulseEventBus?: EventEmitter };

// Same hot-reload-survival trick as the Prisma singleton (db.ts): without
// this, every dev-mode file save would create a new EventEmitter and orphan
// old SSE subscribers.
export const eventBus: EventEmitter = globalForBus.pulseEventBus ?? new EventEmitter();
if (process.env.NODE_ENV !== 'production') globalForBus.pulseEventBus = eventBus;
eventBus.setMaxListeners(0); // one listener per open SSE connection -- can legitimately be many

const SNAPSHOT_CHANNEL = 'snapshot';

export function publishSnapshotUpdate(update: SnapshotUpdate) {
  eventBus.emit(SNAPSHOT_CHANNEL, update);
}

export function subscribeSnapshotUpdates(handler: (update: SnapshotUpdate) => void): () => void {
  eventBus.on(SNAPSHOT_CHANNEL, handler);
  return () => eventBus.off(SNAPSHOT_CHANNEL, handler);
}
