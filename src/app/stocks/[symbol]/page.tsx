'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { api, ApiClientError } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { AppShell } from '@/components/AppShell';
import { Card, BandLabel, MarketStatePill, ChangePercent } from '@/components/ui';
import { PlanPanel } from '@/components/PlanPanel';
import { Timeline } from '@/components/Timeline';
import type { SnapshotUpdate } from '@/lib/eventBus';

const RANGE_OPTIONS = [
  { key: '1D', days: 1 },
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
] as const;

export default function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]['key']>('1D');
  const [timeline, setTimeline] = useState<any>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/instruments/${symbol}`);
      setDetail(res);
      if ((res as any).relationship) {
        const tl = await api.get(`/relationships/${(res as any).relationship.id}/timeline`);
        setTimeline(tl);
      } else {
        setTimeline(null);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load');
    }
  }, [symbol]);

  useEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [user, load]);

  // Instant price updates for this one instrument, on top of the 20s poll
  // above (Addendum 2 Sections B/C).
  useLiveUpdates(
    useCallback((update: SnapshotUpdate) => {
      setDetail((prev: any) => {
        if (!prev || update.instrumentId !== prev.instrument.id) return prev;
        const previousPrice = prev.snapshot?.price;
        if (previousPrice != null && update.price !== previousPrice) {
          setFlash(update.price > previousPrice ? 'up' : 'down');
          setTimeout(() => setFlash(null), 500);
        }
        return {
          ...prev,
          snapshot: { ...prev.snapshot, price: update.price, changePercent: update.changePercent, timestamp: update.timestamp },
          marketState: 'LIVE',
        };
      });
    }, []),
    load
  );

  if (userLoading || !user) return null;

  return (
    <AppShell user={user}>
        {error && <p className="text-sm text-loss">{error}</p>}
        {!detail ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold">{detail.instrument.symbol}</p>
                <p className="text-sm text-ink-400">
                  {detail.instrument.companyName} · {detail.instrument.sector}
                </p>
              </div>
              <div className={`rounded px-2 py-1 text-right ${flash ? `flash-${flash}` : ''}`}>
                <p className="text-3xl font-semibold tabular-nums">
                  {detail.snapshot ? `₹${detail.snapshot.price.toFixed(2)}` : '—'}
                </p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <ChangePercent value={detail.snapshot?.changePercent ?? null} />
                  <MarketStatePill state={detail.marketState} timestamp={detail.snapshot?.timestamp} />
                </div>
              </div>
            </header>


            {/* Chart — TradingView lightweight-charts (Fix 4) */}
            <Card className="mb-6 p-4">
              <div className="mb-3 flex gap-1">
                {RANGE_OPTIONS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`rounded px-2 py-1 text-xs ${
                      range === r.key ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:bg-ink-700/50'
                    }`}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
              {detail.chart.length > 1 ? (
                <PriceChart data={filterChart(detail.chart, range)} />
              ) : (
                <p className="py-8 text-center text-sm text-ink-400">
                  Not enough persisted history yet — the chart fills in as the ingestion poller runs.
                </p>
              )}
            </Card>

            {/* Score breakdown */}
            {detail.score && (
              <Card className="mb-6 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-ink-300">Attention score</h2>
                  <BandLabel band={detail.score.band} score={detail.score.total} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <ScoreComponent label="Price move" value={detail.score.price} max={30} />
                  <ScoreComponent label="Volume" value={detail.score.volume} max={20} />
                  <ScoreComponent label="Vs NIFTY" value={detail.score.relative} max={20} />
                  <ScoreComponent label="Technical" value={detail.score.technical} max={15} />
                  <ScoreComponent label="Personal" value={detail.score.personalRelevance} max={15} />
                </div>
              </Card>
            )}

            {/* Downside pressure */}
            {detail.downsidePressure && (
              <Card className="mb-6 p-4">
                <h2 className="mb-2 text-sm font-medium text-ink-300">Downside-pressure read</h2>
                <p className="mb-1 font-sans tabular-nums text-sm">{formatState(detail.downsidePressure.state)}</p>
                <p className="text-xs italic text-ink-400">{detail.downsidePressure.disclaimer}</p>
              </Card>
            )}

            {/* Possible driver / no catalyst */}
            <Card className="mb-6 p-4">
              <h2 className="mb-2 text-sm font-medium text-ink-300">Possible driver</h2>
              {detail.noObviousCatalyst ? (
                <p className="text-sm text-ink-400">No obvious catalyst found.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.possibleDrivers.map((d: any, i: number) => (
                    <li key={i} className="text-sm">
                      <a href={d.headline.url} target="_blank" rel="noreferrer" className="text-ink-100 hover:underline">
                        {d.headline.title}
                      </a>
                      <span className="ml-2 text-xs text-ink-500">
                        possible driver, confidence: {d.confidence}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Sell-signal context panel */}
            {detail.sellSignalPanel && (
              <Card className="mb-6 border-signal-high/40 p-4">
                <h2 className="mb-2 text-sm font-medium text-signal-high">
                  Near your sell target (₹{detail.sellSignalPanel.targetPrice})
                </h2>
                <ul className="space-y-1 text-sm text-ink-200">
                  {detail.sellSignalPanel.relativePerformanceLine && <li>{detail.sellSignalPanel.relativePerformanceLine}</li>}
                  {detail.sellSignalPanel.volumeLine && <li>{detail.sellSignalPanel.volumeLine}</li>}
                  <li>{detail.sellSignalPanel.newsDriverLine}</li>
                  {detail.sellSignalPanel.technicalLine && <li>{detail.sellSignalPanel.technicalLine}</li>}
                </ul>
              </Card>
            )}

            {/* Upcoming corporate events */}
            {detail.corporateEvents?.length > 0 && (
              <Card className="mb-6 p-4">
                <h2 className="mb-2 text-sm font-medium text-ink-300">Upcoming events</h2>
                <ul className="space-y-1 text-sm">
                  {detail.corporateEvents.map((e: any) => (
                    <li key={e.id}>
                      {e.type} · {daysUntil(e.eventDate)}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Plan management (buy/sell/watch, buy->own, own->closed) */}
            <PlanPanel
              instrumentId={detail.instrument.id}
              symbol={detail.instrument.symbol}
              currentPrice={detail.snapshot?.price ?? null}
              relationship={detail.relationship}
              onChange={load}
            />

            {/* Personal timeline */}
            {timeline && (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-medium text-ink-300">Timeline</h2>
                <Timeline entries={timeline.entries} />
              </div>
            )}
          </>
        )}
      </AppShell>
  );
}

/** Canvas-based price chart using TradingView's lightweight-charts (Fix 4).
 *  Renders to canvas via its own API (not JSX), handles live-updating
 *  time-series data smoothly, and matches what real Indian trading apps
 *  (Groww, Zerodha) actually use. */
function PriceChart({ data }: { data: { t: string; price: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: 220,
      layout: {
        background: { type: ColorType.Solid, color: '#14181A' }, // ink-800 / --pulse-surface
        textColor: '#8B9490', // ink-300 / --pulse-text-muted
      },
      grid: {
        vertLines: { color: '#1C2224' }, // ink-700
        horzLines: { color: '#1C2224' },
      },
      crosshair: {
        vertLine: { color: '#5F6763', width: 1, style: 3 },
        horzLine: { color: '#5F6763', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: '#232B2A', // ink-600 / --pulse-border
      },
      timeScale: {
        borderColor: '#232B2A',
        timeVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;

    const series = chart.addLineSeries({
      color: '#5DB85D', // signal.DEFAULT / --pulse-accent (Groww green)
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#5DB85D',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;

    // Fit to container width
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Update data when it changes (range switch, live update, new detail load)
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const mapped = data
      .map((d) => ({
        time: Math.floor(new Date(d.t).getTime() / 1000) as any,
        value: d.price,
      }))
      .sort((a, b) => a.time - b.time);
    seriesRef.current.setData(mapped);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} />;
}

function ScoreComponent({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
      <p className="font-sans tabular-nums text-sm">
        {value}/{max}
      </p>
      <div className="mt-1 h-1 rounded-full bg-ink-700">
        <div className="h-1 rounded-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatState(state: string): string {
  return state
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

function daysUntil(dateStr: string): string {
  const days = Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
}

function filterChart(chart: { t: string; price: number }[], range: '1D' | '1W' | '1M') {
  const days = range === '1D' ? 1 : range === '1W' ? 7 : 30;
  const cutoff = Date.now() - days * 86_400_000;
  return chart.filter((p) => new Date(p.t).getTime() >= cutoff);
}
