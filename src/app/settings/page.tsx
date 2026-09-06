'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';

interface SensitivityResponse {
  sensitivity: 'QUIET' | 'BALANCED' | 'HIGH';
  mapping: Record<string, string[]>;
}

const SENSITIVITY_COPY: Record<string, string> = {
  QUIET: 'Only notify me for CRITICAL events.',
  BALANCED: 'Notify me for HIGH and CRITICAL events.',
  HIGH: 'Notify me for MEDIUM and above.',
};

export default function SettingsPage() {
  const { user, loading: userLoading } = useCurrentUser({ requireOnboarded: true });
  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(null);
  const [income, setIncome] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get<SensitivityResponse>('/settings/sensitivity').then(setSensitivity);
    setIncome(user.monthlyIncome?.toString() ?? '');
    setBudgetAmount(user.monthlyBudget?.toString() ?? '');
  }, [user]);

  async function updateSensitivity(value: 'QUIET' | 'BALANCED' | 'HIGH') {
    await api.patch('/settings/sensitivity', { sensitivity: value });
    setSensitivity((prev) => (prev ? { ...prev, sensitivity: value } : prev));
  }

  async function saveBudget() {
    await api.patch('/budget', {
      monthlyIncome: income ? Number(income) : undefined,
      monthlyBudget: budgetAmount ? Number(budgetAmount) : undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (userLoading || !user) return null;

  return (
    <AppShell user={user}>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-ink-300">Notification sensitivity</h2>
          <div className="space-y-2">
            {(['QUIET', 'BALANCED', 'HIGH'] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-3 rounded border border-ink-600 p-3 text-sm">
                <input
                  type="radio"
                  checked={sensitivity?.sensitivity === opt}
                  onChange={() => updateSensitivity(opt)}
                  className="accent-signal"
                />
                <div>
                  <p className="font-medium">{opt}</p>
                  <p className="text-xs text-ink-400">{SENSITIVITY_COPY[opt]}</p>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium text-ink-300">Budget</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-400">
              Monthly income (optional)
              <input
                type="number"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400">
              Monthly investing budget
              <input
                type="number"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            onClick={saveBudget}
            className="mt-3 rounded bg-signal px-4 py-1.5 text-sm font-medium text-ink-900 hover:opacity-90"
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-300">What Pulse doesn't do</h2>
          <p className="text-sm text-ink-400">
            No free-form "ask Pulse" chatbot, and no unrestricted market-wide auto-discovery — both were deliberate
            cuts. See the README for why.
          </p>
        </Card>
      </AppShell>
  );
}
