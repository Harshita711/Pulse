import { prisma } from './db';
import { fetchYahooQuote, DailyBar } from './marketData';

// Step 3b: the live ingestion poller (ingest.ts) only ever writes a MarketSnapshot
// row for "right now" -- it fetches ~3 months of daily history from Yahoo on every
// cycle (to compute avg20DayVolume/avgDailyMovePct/ma20), but never persists that
// history, only today's tick. That means a freshly-added instrument's chart is only
// ever as deep as however long the live poller has been running since it was added --
// which for a brand-new instrument is nothing. This module fixes that with a
// separate, one-time backfill: it reuses the same real Yahoo fetch (no new provider
// call shape needed -- the daily history was already being fetched and discarded),
// and persists each real historical day as its own MarketSnapshot row.
//
// Distinguishing source: 'yahoo_historical' vs the live poller's 'yahoo' /
// 'alpha_vantage', so a reader can tell "this row came from the one-time backfill"
// from "this row came from a live poll" if it ever matters (it currently doesn't
// change any scoring/display logic -- both are equally real prices -- but the
// distinction costs nothing to keep and the task specifically asked for it).
const HISTORICAL_SOURCE = 'yahoo_historical';

export interface BackfillResult {
  instrumentId: string;
  symbol: string;
  status: 'BACKFILLED' | 'SKIPPED_ALREADY_DEEP' | 'FAILED';
  daysInserted?: number;
}

/**
 * Backfills one instrument's real daily history. Idempotent by design on
 * two levels: (1) skips instruments that already have enough historical
 * depth (so re-running the script doesn't re-fetch pointlessly), and (2)
 * even without that check, `createMany({ skipDuplicates: true })` relies on
 * MarketSnapshot's (instrumentId, timestamp, source) unique constraint to
 * silently no-op on any day already present, rather than erroring.
 */
export async function backfillInstrument(
  instrument: { id: string; symbol: string },
  options: { minExistingDays?: number } = {}
): Promise<BackfillResult> {
  const minExistingDays = options.minExistingDays ?? 20;

  const existingHistoricalCount = await prisma.marketSnapshot.count({
    where: { instrumentId: instrument.id, source: HISTORICAL_SOURCE },
  });
  if (existingHistoricalCount >= minExistingDays) {
    return { instrumentId: instrument.id, symbol: instrument.symbol, status: 'SKIPPED_ALREADY_DEEP' };
  }

  const quote = await fetchYahooQuote(instrument.symbol);
  if (!quote || quote.history.length === 0) {
    return { instrumentId: instrument.id, symbol: instrument.symbol, status: 'FAILED' };
  }

  // range=3mo actually gives us more than the ~1 month asked for -- keeping
  // the extra history is strictly better for the technical/volume-average
  // components (which already want a 20-trading-day window) and costs
  // nothing extra, since it's the same single fetch either way.
  const rows = buildSnapshotRows(instrument.id, quote.history);

  const result = await prisma.marketSnapshot.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { instrumentId: instrument.id, symbol: instrument.symbol, status: 'BACKFILLED', daysInserted: result.count };
}

function buildSnapshotRows(instrumentId: string, history: DailyBar[]) {
  const rows: {
    instrumentId: string;
    timestamp: Date;
    price: number;
    open: number;
    high: number;
    low: number;
    previousClose: number;
    volume: bigint;
    changePercent: number;
    source: string;
    isDelayed: boolean;
  }[] = [];

  for (let i = 0; i < history.length; i++) {
    const bar = history[i];
    const prevClose = i > 0 ? history[i - 1].close : bar.open; // first day has no prior close on file
    const changePercent = prevClose > 0 ? ((bar.close - prevClose) / prevClose) * 100 : 0;

    rows.push({
      instrumentId,
      // Yahoo's daily timestamps land at market open for that trading day;
      // that's a real, distinct instant per day, which is exactly what the
      // (instrumentId, timestamp, source) unique constraint wants.
      timestamp: new Date(`${bar.date}T00:00:00.000Z`),
      price: bar.close,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      previousClose: prevClose,
      volume: BigInt(Math.round(bar.volume)),
      changePercent,
      source: HISTORICAL_SOURCE,
      isDelayed: true, // it's real, but it's end-of-day historical, not a live tick
    });
  }
  return rows;
}

export async function backfillAll(): Promise<BackfillResult[]> {
  const instruments = await prisma.instrument.findMany({ select: { id: true, symbol: true } });
  const results: BackfillResult[] = [];
  // Sequential + paced, same reasoning as ingestAll: Yahoo's unofficial
  // endpoint rate-limits aggressively, and this hits it once per instrument
  // regardless (same fetch shape as a live poll, just consuming the history
  // array instead of discarding it).
  for (const instrument of instruments) {
    results.push(await backfillInstrument(instrument));
    await new Promise((r) => setTimeout(r, 250));
  }
  return results;
}
