'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getDeviceId } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { AppShell } from '@/components/AppShell';
import { Card, BandStrip, MarketStatePill, ChangePercent } from '@/components/ui';
import { Sparkline } from '@/components/Sparkline';
import type { FeedItem, WhileYouWereAway } from '@/lib/dashboardService';
import type { SnapshotUpdate } from '@/lib/eventBus';

interface DashboardResponse {
  feed: FeedItem[];
  whileYouWereAway: WhileYouWereAway | null;
  watchlistId: string | null;
  deviceId: string;
}

// The safety-net poll (Addendum 2 Section B: "real-time is an enhancement,
// never a dependency"). The SSE hook below pushes instant updates on top of
// this -- this interval keeps running unconditionally either way.
const POLL_MS = 20_000;
const FLASH_MS = 500;

type LiveOverride = Pick<SnapshotUpdate, 'price' | 'changePercent' | 'score' | 'band' | 'timestamp'>;

export default function DashboardPage() {
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [liveOverrides, setLiveOverrides] = useState<Record<string, LiveOverride>>({});
  const [flash, setFlash] = useState<Record<string, 'up' | 'down'>>({});
  const checkpointUpdated = useRef(false);
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    const deviceId = getDeviceId();
    const res = await api.get<DashboardResponse>(`/dashboard?deviceId=${deviceId}`);
    setData(res);
    if (!checkpointUpdated.current && res.watchlistId) {
      checkpointUpdated.current = true;
      await api.post('/checkpoint', { watchlistId: res.watchlistId, deviceId });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    api
      .get<{ text: string }>('/brief')
      .then((r) => setBrief(r.text))
      .finally(() => setBriefLoading(false));
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [user, load]);

  // Addendum 2 Section B/C: instant per-tick updates + the green/red flash
  // micro-interaction, layered on top of the polling loop above.
  useLiveUpdates(
    useCallback((update: SnapshotUpdate) => {
      setLiveOverrides((prev) => {
        const previousPrice = prev[update.instrumentId]?.price;
        const basePrice = data?.feed.find((f) => f.instrumentId === update.instrumentId)?.price ?? null;
        const comparisonPrice = previousPrice ?? basePrice;
        if (comparisonPrice != null && update.price !== comparisonPrice) {
          const direction = update.price > comparisonPrice ? 'up' : 'down';
          setFlash((f) => ({ ...f, [update.instrumentId]: direction }));
          clearTimeout(flashTimers.current[update.instrumentId]);
          flashTimers.current[update.instrumentId] = setTimeout(() => {
            setFlash((f) => {
              const next = { ...f };
              delete next[update.instrumentId];
              return next;
            });
          }, FLASH_MS);
        }
        return {
          ...prev,
          [update.instrumentId]: {
            price: update.price,
            changePercent: update.changePercent,
            score: update.score,
            band: update.band,
            timestamp: update.timestamp,
          },
        };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]),
    // Section D5: mobile tab returned from background -- reconnect already
    // happened in the hook, and here we re-fetch full state rather than
    // trusting any events missed while backgrounded.
    load
  );

  if (userLoading || !user) return null;

  const away = data?.whileYouWereAway;

  return (
    <AppShell user={user}>
        <section className="mb-6">
          <h1 className="text-xl font-semibold">While you were away</h1>
          <Card className="mt-3 p-4">
            {briefLoading ? (
              <p className="text-sm text-ink-400">Preparing your brief…</p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-100">{brief}</p>
            )}
            {away && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-400">
                <span>{away.plansReached.length} plans reached target</span>
                <span>{away.thesisFlags.length} thesis flags</span>
                <span>{away.quietCount} stocks were quiet</span>
                {away.since && <span>since {new Date(away.since).toLocaleString()}</span>}
              </div>
            )}
          </Card>
        </section>

        {away && away.thesisFlags.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-ink-300">Thesis flags</h2>
            <div className="space-y-2">
              {away.thesisFlags.map((f, idx) => (
                <Card key={idx} className="border-signal-high/40 p-3">
                  <Link href={`/stocks/${f.symbol}`} className="font-sans tabular-nums text-sm text-signal-high hover:underline">
                    {f.symbol}
                  </Link>
                  <p className="mt-1 text-sm text-ink-200">Your original thesis may need review.</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {away && away.plansReached.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-ink-300">Plans reached target</h2>
            <div className="space-y-2">
              {away.plansReached.map((p, idx) => (
                <Card key={idx} className="border-gain/40 p-3">
                  <Link href={`/stocks/${p.symbol}`} className="font-sans tabular-nums text-sm text-gain hover:underline">
                    {p.symbol}
                  </Link>
                  <p className="mt-1 text-sm text-ink-200">
                    Reached your {p.detail?.kind === 'sell' ? 'sell' : 'buy'} target of ₹{p.detail?.targetPrice}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-300">Attention feed</h2>
            <span className="text-xs text-ink-500">Live, polling every 20s as backup</span>
          </div>
          <Card>
            {!data ? (
              <p className="p-4 text-sm text-ink-400">Loading…</p>
            ) : data.feed.length === 0 ? (
              <p className="p-4 text-sm text-ink-400">
                Nothing to show yet — add a stock to a watchlist or a plan to get started.
              </p>
            ) : (
              <ul>
                {data.feed.map((item) => {
                  const live = liveOverrides[item.instrumentId];
                  const price = live?.price ?? item.price;
                  const changePercent = live?.changePercent ?? item.changePercent;
                  const band = live?.band ?? item.score?.band ?? 'LOW';
                  const flashClass = flash[item.instrumentId] ? `flash-${flash[item.instrumentId]}` : '';
                  const explanation = explainAttention(item);
                  return (
                    <li key={item.instrumentId} className="border-b border-ink-700 last:border-0">
                      <Link
                        href={`/stocks/${item.symbol}`}
                        className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-700/40 ${flashClass}`}
                      >
                        <BandStrip band={band} />
                        <div className="min-w-[100px] flex-1">
                          <p className="text-sm font-medium">{item.symbol}</p>
                          <p className="truncate text-xs text-ink-400">{item.companyName}</p>
                          {/* Step 3d: always a real sentence, including the quiet case -- never blank */}
                          <p className="mt-0.5 truncate text-xs text-ink-500">{explanation}</p>
                        </div>
                        {item.relationshipStatus && (
                          <span className="hidden shrink-0 truncate rounded border border-ink-600 px-2 py-0.5 text-[11px] uppercase text-ink-400 sm:inline">
                            {item.relationshipStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                        <Sparkline points={item.sparkline} />
                        <div className="w-24 shrink-0 text-right">
                          {/* Section C: price is the largest, highest-contrast text on the row */}
                          <p className="text-lg font-semibold tabular-nums text-ink-100">
                            {price != null ? `₹${price.toFixed(2)}` : '—'}
                          </p>
                          <ChangePercent value={changePercent} />
                        </div>
                        <div className="hidden w-28 sm:block">
                          <MarketStatePill state={item.marketState} timestamp={item.snapshotTimestamp} />
                        </div>
                        {/* Full numeric score breakdown intentionally lives on the stock detail
                            page only (Step 3d) -- this row stays uncluttered. */}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
    </AppShell>
  );
}

/**
 * Step 3d: a one-sentence, per-stock explanation generated deterministically
 * from whichever score component is actually elevated -- never a static
 * template reused across every row. Uses real numbers (today's % move, the
 * live volume-vs-20-day-average ratio, the NIFTY gap) when the underlying
 * ChangeEvent carried them; falls back to a plainer but still per-stock
 * description if an older event predates that data. Always returns a real
 * sentence, including the explicit "nothing notable" case -- never blank.
 */
function explainAttention(item: FeedItem): string {
  if (!item.score || item.score.band === 'LOW') {
    return 'No unusual activity — trading close to its normal range.';
  }

  const { price, volume, relative, technical, personalRelevance } = item.score;
  const entries: [string, number][] = [
    ['price', price],
    ['volume', volume],
    ['relative', relative],
    ['technical', technical],
    ['personal', personalRelevance],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [dominant] = entries[0];
  const raw = item.raw;

  if (dominant === 'price') {
    if (raw) {
      const times = raw.avgDailyMovePct > 0 ? Math.abs(raw.todayChangePct) / raw.avgDailyMovePct : null;
      return times && times >= 1.2
        ? `Moved ${raw.todayChangePct >= 0 ? '+' : ''}${raw.todayChangePct.toFixed(1)}% today, about ${times.toFixed(1)}x its usual daily move.`
        : `Moved ${raw.todayChangePct >= 0 ? '+' : ''}${raw.todayChangePct.toFixed(1)}% today, more than usual for this stock.`;
    }
    return 'Moving more than usual for this stock today.';
  }
  if (dominant === 'volume') {
    if (raw && raw.avg20DayVolume > 0) {
      const ratio = raw.todayVolume / raw.avg20DayVolume;
      return `Trading on ${ratio.toFixed(1)}x its 20-day average volume.`;
    }
    return 'Trading on unusually high volume today.';
  }
  if (dominant === 'relative') {
    if (raw) {
      const gap = raw.todayChangePct - raw.niftyChangePercent;
      return `${gap >= 0 ? 'Outperforming' : 'Underperforming'} the NIFTY by ${Math.abs(gap).toFixed(1)} points today.`;
    }
    return 'Performing very differently from the NIFTY today.';
  }
  if (dominant === 'technical') {
    return "Breaking away from its recent 20-day average.";
  }
  // dominant === 'personal'
  switch (item.relationshipStatus) {
    case 'OWN':
      return 'You own this position.';
    case 'WAITING_FOR_PRICE':
      return 'Trading close to your target price.';
    case 'CONSIDERING':
      return "You're actively considering this one.";
    case 'RESEARCHING':
      return "You're researching this one.";
    default:
      return "You're watching this stock.";
  }
}
