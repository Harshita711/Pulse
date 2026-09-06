import { prisma } from './db';
import { personalizeScore } from './relevance';
import { RelationshipStatusForScoring } from './scoring';
import {
  computeDownsidePressure,
  DOWNSIDE_PRESSURE_DISCLAIMER,
  DownsidePressureInputs,
  classifyNewsKeywordSignal,
} from './downsidePressure';
import { CHANGE_THRESHOLDS } from './thresholds';
import { fetchRecentHeadlines, rankPossibleDrivers, NO_DRIVER_LABEL } from './newsDriver';
import { triggerRefreshIfStale } from './ingest';

export async function getStockDetail(userId: string, symbol: string) {
  const instrument = await prisma.instrument.findUnique({ where: { symbol: symbol.toUpperCase() } });
  if (!instrument) return null;

  const [snapshot, changeEvent, relationship, corporateEvents] = await Promise.all([
    prisma.marketSnapshot.findFirst({ where: { instrumentId: instrument.id }, orderBy: { timestamp: 'desc' } }),
    prisma.changeEvent.findFirst({ where: { instrumentId: instrument.id }, orderBy: { detectedAt: 'desc' } }),
    prisma.userInstrumentRelationship.findUnique({
      where: { userId_instrumentId: { userId, instrumentId: instrument.id } },
    }),
    prisma.corporateEvent.findMany({
      where: { instrumentId: instrument.id, eventDate: { gte: new Date() } },
      orderBy: { eventDate: 'asc' },
      take: 3,
    }),
  ]);

  const intervalSec = Number(process.env.INGEST_INTERVAL_SECONDS ?? 60);
  const marketState = !snapshot
    ? 'UNAVAILABLE'
    : Date.now() - snapshot.timestamp.getTime() <= intervalSec * 1000 * 3
    ? 'LIVE'
    : 'STALE';
  // Step 4a safety net: fire-and-forget, doesn't block this response.
  if (marketState !== 'LIVE') triggerRefreshIfStale(instrument.id, instrument.symbol);

  const raw = (changeEvent?.breakdown as any)?.raw ?? null;

  const score =
    changeEvent && snapshot
      ? personalizeScore(
          {
            price: (changeEvent.breakdown as any).price ?? 0,
            volume: (changeEvent.breakdown as any).volume ?? 0,
            relative: (changeEvent.breakdown as any).relative ?? 0,
            technical: (changeEvent.breakdown as any).technical ?? 0,
          },
          relationship
            ? { status: relationship.status as RelationshipStatusForScoring, targetPrice: relationship.targetPrice }
            : null,
          snapshot.price
        )
      : null;

  // News-driver matching (Tier 3 item 26) + downside-pressure read (7B).
  const headlines = await fetchRecentHeadlines(instrument.companyName);
  const possibleDrivers = rankPossibleDrivers(instrument.companyName, instrument.symbol, headlines);
  const newsKeywordSignal =
    possibleDrivers.length === 0
      ? 'NONE'
      : classifyNewsKeywordSignal(possibleDrivers.map((d) => d.headline.title));

  let downsidePressure = null;
  if (raw && snapshot) {
    const inputs: DownsidePressureInputs = {
      priceWeakness: raw.todayChangePct <= CHANGE_THRESHOLDS.downsidePressure.priceWeaknessPct,
      volumeAnomaly:
        raw.avg20DayVolume > 0 &&
        raw.todayVolume / raw.avg20DayVolume >= CHANGE_THRESHOLDS.downsidePressure.volumeAnomalyRatio,
      relativeUnderperformance:
        raw.todayChangePct - raw.niftyChangePercent <= CHANGE_THRESHOLDS.downsidePressure.relativeUnderperformancePts,
      newsKeywordSignal,
    };
    downsidePressure = {
      state: computeDownsidePressure(inputs),
      inputs,
      disclaimer: DOWNSIDE_PRESSURE_DISCLAIMER,
    };
  }

  // Sell-signal context panel (Section 2 item 17): only when OWN and price
  // is within N% of the sell target.
  let sellSignalPanel = null;
  if (relationship?.status === 'OWN' && relationship.targetPrice && snapshot) {
    const proximityPct = (Math.abs(snapshot.price - relationship.targetPrice) / relationship.targetPrice) * 100;
    if (proximityPct <= CHANGE_THRESHOLDS.sellSignal.proximityPct) {
      sellSignalPanel = {
        targetPrice: relationship.targetPrice,
        trailingStopPct: relationship.trailingStopPct,
        currentPrice: snapshot.price,
        relativePerformanceLine: raw
          ? `${raw.todayChangePct >= 0 ? '+' : ''}${raw.todayChangePct.toFixed(2)}% today vs NIFTY ${
              raw.niftyChangePercent >= 0 ? '+' : ''
            }${raw.niftyChangePercent.toFixed(2)}%`
          : null,
        volumeLine: raw
          ? `Volume ${raw.avg20DayVolume > 0 ? (raw.todayVolume / raw.avg20DayVolume).toFixed(1) : '?'}x the 20-day average`
          : null,
        newsDriverLine: possibleDrivers[0]
          ? `Possible driver: ${possibleDrivers[0].headline.title} (confidence: ${possibleDrivers[0].confidence})`
          : NO_DRIVER_LABEL,
        technicalLine:
          raw && raw.ma20 > 0
            ? `${(((snapshot.price - raw.ma20) / raw.ma20) * 100).toFixed(1)}% from 20-day moving average`
            : null,
      };
    }
  }

  // Chart series: real persisted MarketSnapshot rows, last 30 days.
  const chartSnapshots = await prisma.marketSnapshot.findMany({
    where: { instrumentId: instrument.id, timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true, price: true },
  });

  return {
    instrument,
    snapshot: snapshot ? { ...snapshot, volume: snapshot.volume.toString() } : null,
    marketState,
    score,
    downsidePressure,
    sellSignalPanel,
    relationship,
    corporateEvents,
    possibleDrivers: possibleDrivers.slice(0, 3),
    noObviousCatalyst: possibleDrivers.length === 0,
    chart: chartSnapshots.map((s) => ({ t: s.timestamp.toISOString(), price: s.price })),
  };
}

function classifyFromDrivers(titles: string[]): 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'NONE' {
  // Thin wrapper kept local to avoid a circular import; mirrors downsidePressure.classifyNewsKeywordSignal.
  const { classifyNewsKeywordSignal } = require('./downsidePressure');
  return classifyNewsKeywordSignal(titles);
}
