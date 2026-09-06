'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';

interface Instrument {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
}
interface WatchlistItem {
  id: string;
  instrumentId: string;
  instrument: Instrument;
}
interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

export default function WatchlistsPage() {
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [newName, setNewName] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);

  const load = useCallback(async () => {
    setWatchlists(await api.get<Watchlist[]>('/watchlists'));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.get<Instrument[]>(`/instruments?q=${encodeURIComponent(query)}`).then(setResults);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  async function createWatchlist() {
    if (!newName.trim()) return;
    await api.post('/watchlists', { name: newName.trim() });
    setNewName('');
    load();
  }

  async function addItem(watchlistId: string, instrumentId: string) {
    await api.post(`/watchlists/${watchlistId}/items`, { instrumentId });
    setAddingTo(null);
    setQuery('');
    setResults([]);
    load();
  }

  async function removeItem(watchlistId: string, instrumentId: string) {
    await api.delete(`/watchlists/${watchlistId}/items?instrumentId=${instrumentId}`);
    load();
  }

  async function deleteWatchlist(id: string) {
    try {
      await api.delete(`/watchlists/${id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Failed to delete');
    }
  }

  if (userLoading || !user) return null;

  return (
    <AppShell user={user}>
        <div className="mb-6 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New watchlist name"
            className="rounded border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm"
          />
          <button
            onClick={createWatchlist}
            className="rounded bg-signal px-3 py-1.5 text-sm font-medium text-ink-900 hover:opacity-90"
          >
            Create
          </button>
        </div>

        <div className="space-y-6">
          {watchlists.map((wl) => (
            <Card key={wl.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-ink-100">{wl.name}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddingTo(addingTo === wl.id ? null : wl.id)}
                    className="text-xs text-signal hover:underline"
                  >
                    {addingTo === wl.id ? 'Cancel' : '+ Add stock'}
                  </button>
                  <button onClick={() => deleteWatchlist(wl.id)} className="text-xs text-loss hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              {addingTo === wl.id && (
                <div className="mb-3">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search symbol or company…"
                    className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
                  />
                  {results.length > 0 && (
                    <div className="mt-1 rounded border border-ink-600 bg-ink-900">
                      {results.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => addItem(wl.id, r.id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-700"
                        >
                          <span className="font-sans tabular-nums">{r.symbol}</span>
                          <span className="text-xs text-ink-400">{r.companyName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {wl.items.length === 0 ? (
                <p className="text-sm text-ink-400">No stocks yet.</p>
              ) : (
                <ul className="divide-y divide-ink-700">
                  {wl.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-2">
                      <Link href={`/stocks/${item.instrument.symbol}`} className="text-sm hover:underline">
                        <span className="font-sans tabular-nums">{item.instrument.symbol}</span>{' '}
                        <span className="text-ink-400">{item.instrument.companyName}</span>
                      </Link>
                      <button
                        onClick={() => removeItem(wl.id, item.instrumentId)}
                        className="text-xs text-ink-500 hover:text-loss"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </AppShell>
  );
}
