import { prisma } from './db';
import { fetchRealQuote, fetchYahooQuoteExact, computeDerivedMetrics } from './marketData';
import { priceMoveScore, volumeScore, relativePerformanceScore, technicalSignalScore } from './scoring';
import { bandForScore, CHANGE_THRESHOLDS } from './thresholds';
import { matchesThesisCondition } from './thesis';
import { publishSnapshotUpdate } from './eventBus';

export const NIFTY_YAHOO_SYMBOL = '^NSEI';

/** Fetches the NIFTY 50 index change%, used as the relative-performance baseline. */
export async function fetchNiftyChangePercent(): Promise<number | null> {
  const quote = await fetchYahooQuoteExact('NIFTY 50', NIFTY_YAHOO_SYMBOL);
  return quote ? quote.changePercent : null;
}

export interface IngestResult {
  instrumentId: string;
  symbol: string;
  status: 'LIVE' | 'FAILED';
  source?: string;
  changeEventId?: string;
}

/**
 * Fetches one instrument's real quote, persists a MarketSnapshot on success,
 * and -- if the market-only score moved meaningfully -- writes a new
 * ChangeEvent. Never writes a snapshot or event from fabricated data: on
 * total fetch failure this simply returns FAILED and touches nothing, so
 * reads fall back to the last real persisted snapshot (see getMarketState).
 */
export async function ingestInstrument(
  instrument: { id: string; symbol: string },
  niftyChangePercent: number
): Promise<IngestResult> {
  const quote = await fetchRealQuote(instrument.symbol);
  if (!quote) {
    return { instrumentId: instrument.id, symbol: instrument.symbol, status: 'FAILED' };
  }

  const snapshotTimestamp = quote.marketTimestamp ?? new Date();
  try {
    await prisma.marketSnapshot.create({
      data: {
        instrumentId: instrument.id,
        timestamp: snapshotTimestamp,
        price: quote.price,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        previousClose: quote.previousClose,
        volume: BigInt(Math.round(quote.volume)),
        changePercent: quote.changePercent,
        source: quote.source,
        isDelayed: quote.source === 'alpha_vantage',
      },
    });
  } catch (err: any) {
    // Addendum 2 Section A3: the (instrumentId, timestamp, source) unique
    // constraint means a concurrent duplicate write (ingestion poll racing
    // a manual refresh trigger) throws Prisma's P2002. That's an expected
    // no-op -- someone else already persisted this exact tick -- not a
    // real error, so we swallow it and continue to scoring below using the
    // row that's already there.
    if (err?.code !== 'P2002') throw err;
  }

  const derived = computeDerivedMetrics(quote.history);
  const price = priceMoveScore(quote.changePercent, derived.avgDailyMovePct);
  const volume = volumeScore(quote.volume, derived.avg20DayVolume);
  const relative = relativePerformanceScore(quote.changePercent, niftyChangePercent);
  const technical = technicalSignalScore(quote.price, derived.ma20);
  const marketTotal = Math.min(85, price + volume + relative + technical);
  const band = bandForScore(marketTotal);

  // Addendum 2 Section B: publish on every real tick, not only when a new
  // ChangeEvent crosses the meaningful-delta threshold below -- the live
  // price-flash micro-interaction (Section C) should reflect every real
  // price update, even ones too small to move the attention score.
  publishSnapshotUpdate({
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    price: quote.price,
    changePercent: quote.changePercent,
    score: marketTotal,
    band,
    timestamp: snapshotTimestamp.toISOString(),
  });

  const lastEvent = await prisma.changeEvent.findFirst({
    where: { instrumentId: instrument.id },
    orderBy: { detectedAt: 'desc' },
  });

  // Only write a new ChangeEvent when the market score has moved by a
  // meaningful margin, so the timeline isn't spammed every poll interval.
  const MEANINGFUL_DELTA = 5;
  const priorTotal = lastEvent ? (lastEvent.breakdown as any).total ?? lastEvent.score : null;
  if (priorTotal != null && Math.abs(marketTotal - priorTotal) < MEANINGFUL_DELTA) {
    return { instrumentId: instrument.id, symbol: instrument.symbol, status: 'LIVE', source: quote.source };
  }

  const changeEvent = await prisma.changeEvent.create({
    data: {
      instrumentId: instrument.id,
      type: 'COMPOSITE',
      score: marketTotal,
      severity: band,
      breakdown: {
        price,
        volume,
        relative,
        technical,
        personalRelevance: 0,
        total: marketTotal,
        // Raw inputs, cached here so downstream reads (downside-pressure,
        // sell-signal panel) don't need to re-fetch trailing history.
        raw: {
          todayChangePct: quote.changePercent,
          todayVolume: quote.volume,
          avg20DayVolume: derived.avg20DayVolume,
          avgDailyMovePct: derived.avgDailyMovePct,
          ma20: derived.ma20,
          niftyChangePercent,
        },
      },
      previousValue: lastEvent ? Number(lastEvent.currentValue ?? quote.previousClose) : quote.previousClose,
      currentValue: quote.price,
    },
  });

  await flagThesisMatches(instrument.id, changeEvent);
  await checkTargetsReached(instrument.id, quote.price);
  await createNotificationsForEvent(instrument.id, changeEvent);

  return {
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    status: 'LIVE',
    source: quote.source,
    changeEventId: changeEvent.id,
  };
}

async function flagThesisMatches(instrumentId: string, changeEvent: { id: string; currentValue: number | null; previousValue: number | null }) {
  const relationships = await prisma.userInstrumentRelationship.findMany({
    where: { instrumentId, reconsiderCondition: { not: null }, closedAt: null },
  });
  for (const rel of relationships) {
    if (!rel.reconsiderCondition) continue;
    const matched = matchesThesisCondition(rel.reconsiderCondition, {
      type: 'PRICE_MOVE',
      currentValue: changeEvent.currentValue,
      previousValue: changeEvent.previousValue,
    });
    if (matched) {
      await prisma.relationshipEvent.create({
        data: {
          relationshipId: rel.id,
          type: 'THESIS_FLAG',
          detail: { reconsiderCondition: rel.reconsiderCondition, changeEventId: changeEvent.id },
          changeEventId: changeEvent.id,
        },
      });
    }
  }
}

/**
 * Section 2 items 13/16: when the live price crosses a buy or sell
 * targetPrice for an active (non-OWN-yet, non-closed) plan, log a
 * TARGET_REACHED event once. Idempotent: skipped if the most recent event
 * on the relationship is already a TARGET_REACHED for this target.
 */
async function checkTargetsReached(instrumentId: string, currentPrice: number) {
  const relationships = await prisma.userInstrumentRelationship.findMany({
    where: { instrumentId, targetPrice: { not: null }, closedAt: null },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  for (const rel of relationships) {
    if (!rel.targetPrice) continue;
    const isBuyPlan = rel.status !== 'OWN';
    const crossed = isBuyPlan ? currentPrice <= rel.targetPrice : currentPrice >= rel.targetPrice;
    if (!crossed) continue;
    const lastEvent = rel.events[0];
    const alreadyFlagged =
      lastEvent?.type === 'TARGET_REACHED' &&
      (lastEvent.detail as any)?.targetPrice === rel.targetPrice;
    if (alreadyFlagged) continue;
    await prisma.relationshipEvent.create({
      data: {
        relationshipId: rel.id,
        type: 'TARGET_REACHED',
        detail: { targetPrice: rel.targetPrice, currentPrice, kind: isBuyPlan ? 'buy' : 'sell' },
      },
    });
  }
}

async function createNotificationsForEvent(
  instrumentId: string,
  changeEvent: { id: string; severity: string; score: number }
) {
  const watchers = await prisma.watchlistItem.findMany({
    where: { instrumentId },
    include: { watchlist: { select: { userId: true } } },
  });
  const relationshipUsers = await prisma.userInstrumentRelationship.findMany({
    where: { instrumentId, closedAt: null },
    select: { userId: true },
  });
  const userIds = new Set<string>([
    ...watchers.map((w) => w.watchlist.userId),
    ...relationshipUsers.map((r) => r.userId),
  ]);
  if (userIds.size === 0) return;

  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } } });
  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });

  for (const user of users) {
    const bandsThatStore = CHANGE_THRESHOLDS.sensitivity[user.sensitivity];
    const priority = bandsThatStore.includes(changeEvent.severity) ? 'STORED' : 'FEED_ONLY';
    await prisma.notification.create({
      data: {
        userId: user.id,
        instrumentId,
        changeEventId: changeEvent.id,
        type: 'ATTENTION_SCORE',
        message: `${instrument?.symbol ?? 'An instrument'} moved to ${changeEvent.severity} attention (score ${changeEvent.score}).`,
        priority,
      },
    });
  }
}

export async function ingestAll(): Promise<IngestResult[]> {
  const nifty = await fetchNiftyChangePercent();
  const niftyChangePercent = nifty ?? 0;
  const instruments = await prisma.instrument.findMany({ select: { id: true, symbol: true } });
  const results: IngestResult[] = [];
  // Sequential on purpose: Yahoo's unofficial endpoint rate-limits aggressively.
  for (const instrument of instruments) {
    results.push(await ingestInstrument(instrument, niftyChangePercent));
    await new Promise((r) => setTimeout(r, 250));
  }
  return results;
}

export type MarketState =
  | { status: 'LIVE'; snapshot: NonNullable<Awaited<ReturnType<typeof getLatestSnapshot>>> }
  | { status: 'STALE'; snapshot: NonNullable<Awaited<ReturnType<typeof getLatestSnapshot>>> }
  | { status: 'UNAVAILABLE'; snapshot: null };

function getLatestSnapshot(instrumentId: string) {
  return prisma.marketSnapshot.findFirst({
    where: { instrumentId },
    orderBy: { timestamp: 'desc' },
  });
}

/**
 * The single place that decides LIVE vs STALE vs UNAVAILABLE for the UI.
 * A snapshot older than 3x the poll interval is shown as STALE with its
 * true timestamp -- never silently treated as current.
 */
export async function getMarketState(instrumentId: string): Promise<MarketState> {
  const snapshot = await getLatestSnapshot(instrumentId);
  if (!snapshot) return { status: 'UNAVAILABLE', snapshot: null };
  const intervalSec = Number(process.env.INGEST_INTERVAL_SECONDS ?? 60);
  const ageMs = Date.now() - snapshot.timestamp.getTime();
  const isLive = ageMs <= intervalSec * 1000 * 3;
  return { status: isLive ? 'LIVE' : 'STALE', snapshot };
}

// Step 4a safety net: per-instrument in-memory debounce so a burst of page
// views for the same stale instrument doesn't fire a dozen concurrent
// refetches -- just the first one "wins" until it finishes.
const refreshInFlight = new Set<string>();
const STALE_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // "a few minutes" -- deliberately looser than the LIVE/STALE display cutoff

/**
 * Fire-and-forget on-demand refresh, called from a read path (dashboard
 * feed, stock detail) when its own snapshot looks stale. Deliberately
 * non-blocking: the read that triggered this still returns whatever's
 * already in the DB immediately (Addendum 2 Section A5's "a page render
 * must never trigger a live fetch as a side effect" principle stays true
 * for THIS request), and the background attempt's result shows up on the
 * *next* read instead. This exists as a safety net independent of the
 * scheduled poll in instrumentation.ts -- if that scheduler ever silently
 * stalls, a single page view for the affected instrument is enough to
 * nudge fresh data in, rather than waiting on the next scheduled cycle
 * (which, if the scheduler itself is the thing that's stuck, would be
 * never).
 */
export function triggerRefreshIfStale(instrumentId: string, symbol: string): void {
  if (refreshInFlight.has(instrumentId)) return; // a refresh for this instrument is already in flight

  void (async () => {
    const snapshot = await getLatestSnapshot(instrumentId);
    const isStale = !snapshot || Date.now() - snapshot.timestamp.getTime() > STALE_REFRESH_THRESHOLD_MS;
    if (!isStale) return;

    refreshInFlight.add(instrumentId);
    try {
      const niftyChangePercent = (await fetchNiftyChangePercent()) ?? 0;
      const result = await ingestInstrument({ id: instrumentId, symbol }, niftyChangePercent);
      console.log(`[on-demand-refresh] ${symbol}: ${result.status}${result.source ? ` via ${result.source}` : ''}`);
    } catch (err) {
      console.error(`[on-demand-refresh] ${symbol} failed`, err);
    } finally {
      refreshInFlight.delete(instrumentId);
    }
  })();
}
