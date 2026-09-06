'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AppShell } from '@/components/AppShell';
import { Card, ChangePercent, MarketStatePill } from '@/components/ui';

interface Position {
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

interface PortfolioResponse {
  positions: Position[];
  totalValue: number;
  totalGain: number;
  label: string;
}

interface BudgetResponse {
  monthlyIncome: number | null;
  monthlyBudget: number | null;
  allocated: number;
  remaining: number | null;
  plans: { relationshipId: string; symbol: string; plannedAmount: number | null; pctOfBudget: number | null }[];
}

export default function PortfolioPage() {
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [budget, setBudget] = useState<BudgetResponse | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<PortfolioResponse>('/portfolio').then(setPortfolio);
    api.get<BudgetResponse>('/budget').then(setBudget);
  }, [user]);

  if (userLoading || !user) return null;

  const concentrationWarning = portfolio?.positions.find((p) => (p.concentrationPct ?? 0) > 40);

  return (
    <AppShell user={user}>
        <p className="mb-4 text-xs uppercase tracking-wide text-ink-500">{portfolio?.label ?? 'Based on what you entered'}</p>

        {concentrationWarning && (
          <Card className="mb-6 border-signal-high/40 p-4">
            <p className="text-sm text-signal-high">
              {concentrationWarning.symbol} represents ~{concentrationWarning.concentrationPct?.toFixed(0)}% of your
              recorded portfolio.
            </p>
          </Card>
        )}

        <Card className="mb-6 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-300">Positions</h2>
            <div className="text-right">
              <p className="font-sans tabular-nums text-lg">₹{portfolio?.totalValue.toFixed(0) ?? '—'}</p>
              {portfolio && <p className={`font-sans tabular-nums text-xs ${portfolio.totalGain >= 0 ? 'text-gain' : 'text-loss'}`}>
                {portfolio.totalGain >= 0 ? '+' : ''}
                ₹{portfolio.totalGain.toFixed(0)} unrealized
              </p>}
            </div>
          </div>
          {!portfolio || portfolio.positions.length === 0 ? (
            <p className="text-sm text-ink-400">No owned positions yet. Mark a stock as OWN from its detail page.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Avg</th>
                  <th className="pb-2 text-right">LTP</th>
                  <th className="pb-2 text-right">Value</th>
                  <th className="pb-2 text-right">Gain</th>
                  <th className="pb-2 text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p) => (
                  <tr key={p.relationshipId} className="border-t border-ink-700">
                    <td className="py-2">
                      <Link href={`/stocks/${p.symbol}`} className="font-sans tabular-nums hover:underline">
                        {p.symbol}
                      </Link>
                      <MarketStatePill state={p.marketState} />
                    </td>
                    <td className="py-2 text-right font-sans tabular-nums">{p.quantity}</td>
                    <td className="py-2 text-right font-sans tabular-nums">₹{p.avgPrice}</td>
                    <td className="py-2 text-right font-sans tabular-nums">{p.currentPrice ? `₹${p.currentPrice.toFixed(2)}` : '—'}</td>
                    <td className="py-2 text-right font-sans tabular-nums">{p.positionValue ? `₹${p.positionValue.toFixed(0)}` : '—'}</td>
                    <td className="py-2 text-right">
                      {p.unrealizedGainPct != null ? <ChangePercent value={p.unrealizedGainPct} /> : '—'}
                    </td>
                    <td className="py-2 text-right font-sans tabular-nums text-ink-400">
                      {p.concentrationPct != null ? `${p.concentrationPct.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-ink-300">Monthly budget</h2>
          {budget && (
            <>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <span>Income: {budget.monthlyIncome != null ? `₹${budget.monthlyIncome.toFixed(0)}` : '—'}</span>
                <span>Budget: {budget.monthlyBudget != null ? `₹${budget.monthlyBudget.toFixed(0)}` : '—'}</span>
                <span>Allocated to open plans: ₹{budget.allocated.toFixed(0)}</span>
                {budget.remaining != null && (
                  <span className={budget.remaining < 0 ? 'text-loss' : 'text-gain'}>
                    Remaining: ₹{budget.remaining.toFixed(0)}
                  </span>
                )}
              </div>
              {budget.plans.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-ink-300">
                  {budget.plans.map((p) => (
                    <li key={p.relationshipId}>
                      {p.symbol}: ₹{p.plannedAmount?.toFixed(0)}
                      {p.pctOfBudget != null && ` (~${p.pctOfBudget.toFixed(0)}% of budget)`}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </AppShell>
  );
}
