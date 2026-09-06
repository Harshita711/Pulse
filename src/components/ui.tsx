import React from 'react';

export type Band = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const BAND_LABEL: Record<Band, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const BAND_TEXT_COLOR: Record<Band, string> = {
  LOW: 'text-ink-300',
  MEDIUM: 'text-signal-medium',
  HIGH: 'text-signal-high',
  CRITICAL: 'text-signal-critical',
};

/** The vertical signal-strip indicator used on every scored row, instead of a colored pill everywhere. */
export function BandStrip({ band }: { band: Band }) {
  return <span className={`inline-block h-8 w-1 rounded-full band-strip-${band}`} aria-hidden />;
}

export function BandLabel({ band, score }: { band: Band; score?: number }) {
  return (
    <span className={`font-sans tabular-nums text-sm font-medium ${BAND_TEXT_COLOR[band]}`}>
      {BAND_LABEL[band]}
      {score != null && <span className="text-ink-400"> · {score}</span>}
    </span>
  );
}

export function MarketStatePill({ state, timestamp }: { state: 'LIVE' | 'STALE' | 'UNAVAILABLE'; timestamp?: string | null }) {
  const label =
    state === 'LIVE' ? 'Live' : state === 'STALE' ? `Stale${timestamp ? ` · ${formatAge(timestamp)}` : ''}` : 'Unavailable';
  const color =
    state === 'LIVE' ? 'border-gain/40 text-gain' : state === 'STALE' ? 'border-signal-high/40 text-signal-high' : 'border-ink-500 text-ink-400';
  return <span className={`rounded border px-1.5 py-0.5 font-sans tabular-nums text-[11px] uppercase tracking-wide ${color}`}>{label}</span>;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-md border border-ink-600 bg-ink-800 ${className}`}>{children}</div>;
}

export function ChangePercent({ value }: { value: number | null }) {
  if (value == null) return <span className="font-sans tabular-nums text-ink-400">—</span>;
  const positive = value >= 0;
  return (
    <span className={`font-sans tabular-nums text-sm ${positive ? 'text-gain' : 'text-loss'}`}>
      {positive ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}
