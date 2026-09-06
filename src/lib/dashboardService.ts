import { prisma } from './db';
import { personalizeScore, MarketBreakdown } from './relevance';
import { RelationshipStatusForScoring, Band } from './scoring';
import { CHANGE_THRESHOLDS } from './thresholds';
import { triggerRefreshIfStale } from './ingest';

export interface FeedItem {
  instrumentId: string;
  symbol: string;
  companyName: string;
  sector: string;
  price: number | null;
  changePercent: number | null;
  marketState: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  snapshotTimestamp: string | null;
  score: {
    price: number;
    volume: number;
    relative: number;
    technical: number;
    personalRelevance: number;
    total: number;
    band: Band;
  } | null;
  // Raw (non-point) inputs behind the score, when available -- lets the UI
  // generate a real, numeric explanation sentence ("volume is 2.3x its
  // 20-day average") instead of a generic label (Step 3d).
  raw: {
    todayChangePct: number;
    avgDailyMovePct: number;
    todayVolume: number;
    avg20DayVolume: number;
    niftyChangePercent: number;
  } | null;
  // Last ~30 real persisted price points for this instrument, oldest
  // first -- enough for a small inline sparkline (Step 3d). Whatever
  // density is actually available (daily from the historical backfill,
  // more granular from live polling, or a graceful handful of points for
  // a freshly-added instrument) -- never fabricated, never padded.
  sparkline: { t: string; price: number }[];
  relationshipStatus: RelationshipStatusForScoring;
  lastChangeEventAt: string | null;
}

/** Every instrument relevant to a user: union of watchlist items and tracked relationships. */
export async function getRelevantInstrumentIds(userId: string): Promise<Set<string>> {
  const [watchItems, relationships] = await Promise.all([
    prisma.watchlistItem.findMany({
      where: { watchlist: { userId } },
      select: { instrumentId: true },
    }),
    prisma.userInstrumentRelationship.findMany({
      where: { userId, closedAt: null },
      select: { instrumentId: true },
    }),
  ]);
  return new Set([...watchItems.map((w) => w.instrumentId), ...relationships.map((r) => r.instrumentId)]);
}

/** Core read: the personalized, ranked attention feed for one user (Tier 1 item 7). */
export async function getAttentionFeed(userId: string): Promise<FeedItem[]> {
  const instrumentIds = [...(await getRelevantInstrumentIds(userId))];
  if (instrumentIds.length === 0) return [];

  const [instruments, relationships] = await Promise.all([
    prisma.instrument.findMany({ where: { id: { in: instrumentIds } } }),
    prisma.userInstrumentRelationship.findMany({ where: { userId, instrumentId: { in: instrumentIds } } }),
  ]);
  const relByInstrument = new Map(relationships.map((r) => [r.instrumentId, r]));

  const intervalSec = Number(process.env.INGEST_INTERVAL_SECONDS ?? 60);

  const items: FeedItem[] = await Promise.all(
    instruments.map(async (instrument) => {
      const [snapshot, changeEvent, sparklineRows] = await Promise.all([
        prisma.marketSnapshot.findFirst({ where: { instrumentId: instrument.id }, orderBy: { timestamp: 'desc' } }),
        prisma.changeEvent.findFirst({ where: { instrumentId: instrument.id }, orderBy: { detectedAt: 'desc' } }),
        // Bounded by row count, not a time window: naturally adapts to
        // whatever density is actually available (daily bars post-backfill,
        // more granular once live polling accumulates), without a separate
        // query shape for "new instrument, barely any history yet".
        prisma.marketSnapshot.findMany({
          where: { instrumentId: instrument.id },
          orderBy: { timestamp: 'desc' },
          take: 30,
          select: { timestamp: true, price: true },
        }),
      ]);
      const rel = relByInstrument.get(instrument.id) ?? null;

      let marketState: FeedItem['marketState'] = 'UNAVAILABLE';
      if (snapshot) {
        const ageMs = Date.now() - snapshot.timestamp.getTime();
        marketState = ageMs <= intervalSec * 1000 * 3 ? 'LIVE' : 'STALE';
      }
      // Step 4a safety net: fire-and-forget, doesn't block this response --
      // see triggerRefreshIfStale's own comment for why non-blocking matters here.
      if (marketState !== 'LIVE') triggerRefreshIfStale(instrument.id, instrument.symbol);

      const market: MarketBreakdown | null = changeEvent
        ? {
            price: (changeEvent.breakdown as any).price ?? 0,
            volume: (changeEvent.breakdown as any).volume ?? 0,
            relative: (changeEvent.breakdown as any).relative ?? 0,
            technical: (changeEvent.breakdown as any).technical ?? 0,
          }
        : null;

      const score =
        market && snapshot
          ? personalizeScore(
              market,
              rel ? { status: rel.status as RelationshipStatusForScoring, targetPrice: rel.targetPrice } : null,
              snapshot.price
            )
          : null;

      const raw = changeEvent ? ((changeEvent.breakdown as any)?.raw ?? null) : null;

      return {
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        companyName: instrument.companyName,
        sector: instrument.sector,
        price: snapshot?.price ?? null,
        changePercent: snapshot?.changePercent ?? null,
        marketState,
        snapshotTimestamp: snapshot?.timestamp.toISOString() ?? null,
        score,
        raw: raw
          ? {
              todayChangePct: raw.todayChangePct,
              avgDailyMovePct: raw.avgDailyMovePct,
              todayVolume: raw.todayVolume,
              avg20DayVolume: raw.avg20DayVolume,
              niftyChangePercent: raw.niftyChangePercent,
            }
          : null,
        sparkline: sparklineRows
          .slice()
          .reverse() // query is desc (for `take` to mean "most recent"); chart wants oldest-first
          .map((s) => ({ t: s.timestamp.toISOString(), price: s.price })),
        relationshipStatus: (rel?.status as RelationshipStatusForScoring) ?? null,
        lastChangeEventAt: changeEvent?.detectedAt.toISOString() ?? null,
      };
    })
  );

  return items.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));
}

export interface WhileYouWereAway {
  since: string | null;
  plansReached: { relationshipId: string; instrumentId: string; symbol: string; detail: any; createdAt: string }[];
  highRelevanceEvents: FeedItem[];
  thesisFlags: { relationshipId: string; instrumentId: string; symbol: string; detail: any; createdAt: string }[];
  quietCount: number;
}

/** Section 2 item 22: checkpoint-filtered summary, including the explicit "N were quiet" line. */
export async function getWhileYouWereAway(
  userId: string,
  watchlistId: string,
  deviceId: string
): Promise<WhileYouWereAway> {
  const checkpoint = await prisma.checkpoint.findUnique({
    where: { userId_watchlistId_deviceId: { userId, watchlistId, deviceId } },
  });
  const since = checkpoint?.lastViewedAt ?? null;

  const feed = await getAttentionFeed(userId);
  const highRelevanceEvents = feed.filter(
    (i) =>
      (i.score?.band === 'HIGH' || i.score?.band === 'CRITICAL') &&
      (!since || (i.lastChangeEventAt && new Date(i.lastChangeEventAt) > since))
  );
  const quietCount = feed.filter((i) => !highRelevanceEvents.includes(i)).length;

  const relationships = await prisma.userInstrumentRelationship.findMany({
    where: { userId },
    include: {
      instrument: true,
      events: { where: since ? { createdAt: { gt: since } } : undefined, orderBy: { createdAt: 'desc' } },
    },
  });

  const plansReached: WhileYouWereAway['plansReached'] = [];
  const thesisFlags: WhileYouWereAway['thesisFlags'] = [];
  for (const rel of relationships) {
    for (const ev of rel.events) {
      const row = {
        relationshipId: rel.id,
        instrumentId: rel.instrumentId,
        symbol: rel.instrument.symbol,
        detail: ev.detail,
        createdAt: ev.createdAt.toISOString(),
      };
      if (ev.type === 'TARGET_REACHED') plansReached.push(row);
      if (ev.type === 'THESIS_FLAG') thesisFlags.push(row);
    }
  }

  return {
    since: since?.toISOString() ?? null,
    plansReached,
    highRelevanceEvents,
    thesisFlags,
    quietCount,
  };
}

export interface PortfolioPosition {
  relationshipId: string;
  instrumentId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  marketState: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  positionValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
  concentrationPct: number | null;
}

/** Section 2 items 18-19: manual-entry portfolio + concentration, clearly labeled as user-entered. */
export async function getPortfolio(userId: string): Promise<PortfolioPosition[]> {
  const positions = await prisma.userInstrumentRelationship.findMany({
    where: { userId, status: 'OWN', closedAt: null },
    include: { instrument: true },
  });

  const withPrices = await Promise.all(
    positions.map(async (p) => {
      const snapshot = await prisma.marketSnapshot.findFirst({
        where: { instrumentId: p.instrumentId },
        orderBy: { timestamp: 'desc' },
      });
      const intervalSec = Number(process.env.INGEST_INTERVAL_SECONDS ?? 60);
      const marketState: PortfolioPosition['marketState'] = !snapshot
        ? 'UNAVAILABLE'
        : Date.now() - snapshot.timestamp.getTime() <= intervalSec * 1000 * 3
        ? 'LIVE'
        : 'STALE';
      const currentPrice = snapshot?.price ?? null;
      const quantity = p.quantity ?? 0;
      const avgPrice = p.avgPrice ?? 0;
      const positionValue = currentPrice != null ? currentPrice * quantity : null;
      const costBasis = avgPrice * quantity;
      const unrealizedGain = positionValue != null ? positionValue - costBasis : null;
      const unrealizedGainPct = unrealizedGain != null && costBasis > 0 ? (unrealizedGain / costBasis) * 100 : null;
      return {
        relationshipId: p.id,
        instrumentId: p.instrumentId,
        symbol: p.instrument.symbol,
        quantity,
        avgPrice,
        currentPrice,
        marketState,
        positionValue,
        unrealizedGain,
        unrealizedGainPct,
        concentrationPct: null as number | null,
      };
    })
  );

  const totalValue = withPrices.reduce((sum, p) => sum + (p.positionValue ?? 0), 0);
  return withPrices.map((p) => ({
    ...p,
    concentrationPct: totalValue > 0 && p.positionValue != null ? (p.positionValue / totalValue) * 100 : null,
  }));
}

/** Section 2 item 35: budget layer, arithmetic only. */
export async function getBudgetRollup(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const activePlans = await prisma.userInstrumentRelationship.findMany({
    where: { userId, closedAt: null, status: { not: 'OWN' }, plannedAmount: { not: null } },
    include: { instrument: true },
  });
  const allocated = activePlans.reduce((sum, p) => sum + (p.plannedAmount ?? 0), 0);
  const monthlyBudget = user?.monthlyBudget ?? null;
  return {
    monthlyIncome: user?.monthlyIncome ?? null,
    monthlyBudget,
    allocated,
    remaining: monthlyBudget != null ? monthlyBudget - allocated : null,
    plans: activePlans.map((p) => ({
      relationshipId: p.id,
      symbol: p.instrument.symbol,
      plannedAmount: p.plannedAmount,
      pctOfBudget: monthlyBudget ? ((p.plannedAmount ?? 0) / monthlyBudget) * 100 : null,
    })),
  };
}

/** Personal timeline: RelationshipEvent + relevant ChangeEvents, chronological (Section 2 item 12). */
export async function getTimeline(
  userId: string,
  relationshipId: string,
  pagination: { limit?: number; before?: string } = {}
) {
  const relationship = await prisma.userInstrumentRelationship.findFirst({
    where: { id: relationshipId, userId },
    include: { instrument: true, events: { orderBy: { createdAt: 'asc' } } },
  });
  if (!relationship) return null;

  const changeEvents = await prisma.changeEvent.findMany({
    where: { instrumentId: relationship.instrumentId, detectedAt: { gte: relationship.createdAt } },
    orderBy: { detectedAt: 'asc' },
  });

  type TimelineEntry = { at: string; kind: 'relationship' | 'market'; label: string; detail: any };
  let entries: TimelineEntry[] = [
    {
      at: relationship.createdAt.toISOString(),
      kind: 'relationship' as const,
      label: `Added as ${relationship.status}`,
      detail: { reason: relationship.reason },
    },
    ...relationship.events.map((e) => ({
      at: e.createdAt.toISOString(),
      kind: 'relationship' as const,
      label: labelForEventType(e.type),
      detail: e.detail,
    })),
    ...changeEvents
      .filter((e) => e.severity === 'HIGH' || e.severity === 'CRITICAL')
      .map((e) => ({
        at: e.detectedAt.toISOString(),
        kind: 'market' as const,
        label: `Market attention: ${e.severity} (score ${e.score})`,
        detail: e.breakdown,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // Addendum 2 Section A4: cursor/limit pagination rather than an unbounded
  // list. The timeline merges two heterogeneous sources (RelationshipEvent +
  // ChangeEvent), so the cursor here is the entry's own timestamp rather
  // than a row id -- "before" walks backwards from the most recent entry.
  const limit = Math.min(pagination.limit ?? 50, 200);
  if (pagination.before) {
    entries = entries.filter((e) => e.at < pagination.before!);
  }
  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(-limit) : entries;
  const nextCursor = hasMore ? page[0].at : null;

  return { relationship, entries: page, nextCursor };
}

function labelForEventType(type: string): string {
  switch (type) {
    case 'STATUS_CHANGE':
      return 'Status changed';
    case 'PLAN_CREATED':
      return 'Plan created';
    case 'TARGET_REACHED':
      return 'Target reached';
    case 'THESIS_FLAG':
      return 'Your original thesis may need review';
    case 'CLOSED':
      return 'Position closed';
    default:
      return type;
  }
}

/** Section 2 item 32: unified search across the seeded universe. */
export async function searchInstruments(userId: string, query: string) {
  const instruments = await prisma.instrument.findMany({
    where: {
      OR: [
        { symbol: { contains: query, mode: 'insensitive' } },
        { companyName: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 15,
  });
  const relationships = await prisma.userInstrumentRelationship.findMany({
    where: { userId, instrumentId: { in: instruments.map((i) => i.id) } },
  });
  const relByInstrument = new Map(relationships.map((r) => [r.instrumentId, r]));

  return Promise.all(
    instruments.map(async (instrument) => {
      const [snapshot, changeEvent] = await Promise.all([
        prisma.marketSnapshot.findFirst({ where: { instrumentId: instrument.id }, orderBy: { timestamp: 'desc' } }),
        prisma.changeEvent.findFirst({ where: { instrumentId: instrument.id }, orderBy: { detectedAt: 'desc' } }),
      ]);
      const rel = relByInstrument.get(instrument.id);
      return {
        instrumentId: instrument.id,
        symbol: instrument.symbol,
        companyName: instrument.companyName,
        sector: instrument.sector,
        price: snapshot?.price ?? null,
        changePercent: snapshot?.changePercent ?? null,
        score: changeEvent?.score ?? null,
        band: changeEvent?.severity ?? null,
        relationshipStatus: rel?.status ?? null,
        activePlan: rel && rel.status !== 'OWN' ? { targetPrice: rel.targetPrice, plannedAmount: rel.plannedAmount } : null,
      };
    })
  );
}

export { CHANGE_THRESHOLDS };
