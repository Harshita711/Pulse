'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/apiClient';

interface Instrument {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
}

const STATUS_OPTIONS = ['WATCHING', 'RESEARCHING', 'CONSIDERING', 'WAITING_FOR_PRICE', 'OWN'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [picks, setPicks] = useState<Record<string, (typeof STATUS_OPTIONS)[number]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Instrument[]>('/instruments').then(setInstruments);
  }, []);

  function toggle(id: string) {
    setPicks((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 'WATCHING';
      return next;
    });
  }

  function setStatus(id: string, status: (typeof STATUS_OPTIONS)[number]) {
    setPicks((prev) => ({ ...prev, [id]: status }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await api.post('/onboarding', {
        picks: Object.entries(picks).map(([instrumentId, status]) => ({ instrumentId, status })),
      });
      router.replace('/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  const pickedCount = Object.keys(picks).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-signal-critical" />
          <span className="font-sans tabular-nums text-xl font-semibold">pulse</span>
        </div>
        <h1 className="text-2xl font-semibold text-ink-100">What are you already tracking, in your head?</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-300">
          Most watchlists just show you prices. Pulse is different: it remembers <em>why</em> you're watching each
          stock — a plan, a target, a reason you'd reconsider — and only interrupts you when something actually
          touches that reason. Pick a few stocks below and tell us where they sit for you right now.
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-md border border-ink-600">
        {instruments.map((i) => {
          const status = picks[i.id];
          return (
            <div key={i.id} className="flex items-center gap-3 border-b border-ink-700 px-4 py-3 last:border-0">
              <input
                type="checkbox"
                checked={!!status}
                onChange={() => toggle(i.id)}
                className="h-4 w-4 accent-signal"
              />
              <div className="min-w-0 flex-1">
                <p className="font-sans tabular-nums text-sm font-medium">{i.symbol}</p>
                <p className="truncate text-xs text-ink-400">
                  {i.companyName} · {i.sector}
                </p>
              </div>
              {status && (
                <select
                  value={status}
                  onChange={(e) => setStatus(i.id, e.target.value as (typeof STATUS_OPTIONS)[number])}
                  className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-ink-400">{pickedCount} selected</p>
        <button
          onClick={handleSubmit}
          disabled={pickedCount === 0 || submitting}
          className="rounded bg-signal px-5 py-2 text-sm font-medium text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Setting up…' : 'Continue to dashboard'}
        </button>
      </div>
    </div>
  );
}
