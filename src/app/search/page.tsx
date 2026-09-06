'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AppShell } from '@/components/AppShell';
import { Card, ChangePercent, BandLabel } from '@/components/ui';

interface SearchResult {
  instrumentId: string;
  symbol: string;
  companyName: string;
  sector: string;
  price: number | null;
  changePercent: number | null;
  score: number | null;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  relationshipStatus: string | null;
  activePlan: { targetPrice: number | null; plannedAmount: number | null } | null;
}

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') ?? '';
  const [inputValue, setInputValue] = useState(q);
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  // Keep the input in sync if the query changes via back/forward nav.
  useEffect(() => setInputValue(q), [q]);

  useEffect(() => {
    if (!user || !q) {
      setResults([]);
      return;
    }
    api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`).then(setResults);
  }, [user, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (inputValue.trim() !== q) {
        router.replace(inputValue.trim() ? `/search?q=${encodeURIComponent(inputValue.trim())}` : '/search');
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  async function addToRadar(instrumentId: string) {
    setAdding(instrumentId);
    try {
      await api.post('/relationships', { instrumentId, status: 'WATCHING' });
      const updated = await api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);
      setResults(updated);
    } finally {
      setAdding(null);
    }
  }

  if (userLoading || !user) return null;

  return (
    <AppShell user={user}>
        <input
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search any instrument by symbol or company…"
          className="mb-6 w-full rounded border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm placeholder:text-ink-400 focus:border-signal focus:outline-none"
        />
        {!q ? (
          <p className="text-sm text-ink-400">Start typing to search the instrument universe.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-ink-400">No instruments matched.</p>
        ) : (
          <Card className="divide-y divide-ink-700">
            {results.map((r) => (
              <div key={r.instrumentId} className="flex items-center gap-4 px-4 py-3">
                <Link href={`/stocks/${r.symbol}`} className="min-w-[120px] hover:underline">
                  <p className="font-sans tabular-nums text-sm font-medium">{r.symbol}</p>
                  <p className="truncate text-xs text-ink-400">{r.companyName}</p>
                </Link>
                <div className="w-20 text-right font-sans tabular-nums text-sm">{r.price != null ? `₹${r.price.toFixed(2)}` : '—'}</div>
                <div className="w-20 text-right">
                  <ChangePercent value={r.changePercent} />
                </div>
                <div className="w-28 text-right">{r.band && <BandLabel band={r.band} score={r.score ?? undefined} />}</div>
                <div className="flex-1 text-right text-xs text-ink-400">
                  {r.relationshipStatus
                    ? r.relationshipStatus.replace(/_/g, ' ')
                    : (
                      <button
                        onClick={() => addToRadar(r.instrumentId)}
                        disabled={adding === r.instrumentId}
                        className="rounded border border-signal/40 px-2 py-1 text-signal hover:bg-signal/10 disabled:opacity-50"
                      >
                        + Add to radar
                      </button>
                    )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}
