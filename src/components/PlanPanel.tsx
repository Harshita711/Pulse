'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/apiClient';
import { Card } from './ui';

const STATUS_OPTIONS = ['WATCHING', 'RESEARCHING', 'CONSIDERING', 'WAITING_FOR_PRICE', 'OWN'] as const;

interface Relationship {
  id: string;
  status: (typeof STATUS_OPTIONS)[number];
  reason: string | null;
  reconsiderCondition: string | null;
  targetPrice: number | null;
  plannedAmount: number | null;
  quantity: number | null;
  avgPrice: number | null;
  trailingStopPct: number | null;
  closedAt: string | null;
  closedQuantity: number | null;
  closedPrice: number | null;
}

export function PlanPanel({
  instrumentId,
  symbol,
  currentPrice,
  relationship,
  onChange,
}: {
  instrumentId: string;
  symbol: string;
  currentPrice: number | null;
  relationship: Relationship | null;
  onChange: () => void;
}) {
  if (!relationship) return <CreatePlanForm instrumentId={instrumentId} onChange={onChange} />;
  if (relationship.closedAt) return <ClosedPositionCard relationship={relationship} />;
  if (relationship.status === 'OWN') return <OwnedPositionCard relationship={relationship} onChange={onChange} />;
  return <BuyPlanCard relationship={relationship} currentPrice={currentPrice} onChange={onChange} />;
}

function CreatePlanForm({ instrumentId, onChange }: { instrumentId: string; onChange: () => void }) {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('WATCHING');
  const [reason, setReason] = useState('');
  const [reconsiderCondition, setReconsiderCondition] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post('/relationships', {
        instrumentId,
        status,
        reason: reason || undefined,
        reconsiderCondition: reconsiderCondition || undefined,
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        plannedAmount: plannedAmount ? Number(plannedAmount) : undefined,
        quantity: status === 'OWN' && quantity ? Number(quantity) : undefined,
        avgPrice: status === 'OWN' && avgPrice ? Number(avgPrice) : undefined,
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const approxShares = targetPrice && plannedAmount ? Math.floor(Number(plannedAmount) / Number(targetPrice)) : null;
  const remaining =
    approxShares != null && targetPrice ? Number(plannedAmount) - approxShares * Number(targetPrice) : null;

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-medium text-ink-300">Add to radar</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-400">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-400">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
            placeholder="Why this stock?"
          />
        </label>

        {status === 'OWN' ? (
          <>
            <label className="text-xs text-ink-400">
              Quantity
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400">
              Average price
              <input
                type="number"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
          </>
        ) : (
          <>
            <label className="text-xs text-ink-400">
              Target price
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400">
              Planned amount (₹)
              <input
                type="number"
                value={plannedAmount}
                onChange={(e) => setPlannedAmount(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400 sm:col-span-2">
              Reconsider if…
              <input
                value={reconsiderCondition}
                onChange={(e) => setReconsiderCondition(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
                placeholder="e.g. the sector weakens broadly, or volume dries up"
              />
            </label>
          </>
        )}
      </div>

      {approxShares != null && (
        <p className="mt-2 text-xs text-ink-400">
          ≈ {approxShares} shares at your target, ₹{remaining?.toFixed(0)} left unallocated
        </p>
      )}

      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
      <button
        onClick={submit}
        disabled={saving}
        className="mt-3 rounded bg-signal px-4 py-1.5 text-sm font-medium text-ink-900 hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </Card>
  );
}

function BuyPlanCard({
  relationship,
  currentPrice,
  onChange,
}: {
  relationship: Relationship;
  currentPrice: number | null;
  onChange: () => void;
}) {
  const [showBuyForm, setShowBuyForm] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState(currentPrice?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const approxShares =
    relationship.targetPrice && relationship.plannedAmount
      ? Math.floor(relationship.plannedAmount / relationship.targetPrice)
      : null;
  const remaining =
    approxShares != null ? relationship.plannedAmount! - approxShares * relationship.targetPrice! : null;

  async function confirmBuy() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/relationships/${relationship.id}/buy`, {
        quantity: Number(quantity),
        avgPrice: Number(avgPrice),
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-300">Buy plan · {relationship.status.replace(/_/g, ' ')}</h2>
        {!showBuyForm && (
          <button
            onClick={() => setShowBuyForm(true)}
            className="rounded border border-gain/40 px-3 py-1 text-xs text-gain hover:bg-gain/10"
          >
            I bought it
          </button>
        )}
      </div>
      {relationship.reason && <p className="mt-2 text-sm text-ink-200">{relationship.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-300">
        {relationship.targetPrice && <span>Target ₹{relationship.targetPrice}</span>}
        {relationship.plannedAmount && <span>Planned ₹{relationship.plannedAmount}</span>}
        {approxShares != null && (
          <span>
            ≈{approxShares} shares, ₹{remaining?.toFixed(0)} unallocated
          </span>
        )}
      </div>
      {relationship.reconsiderCondition && (
        <p className="mt-2 text-xs text-ink-400">Reconsider if: {relationship.reconsiderCondition}</p>
      )}

      {showBuyForm && (
        <div className="mt-4 border-t border-ink-700 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-400">
              Quantity
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400">
              Average price paid
              <input
                type="number"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-loss">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmBuy}
              disabled={saving || !quantity || !avgPrice}
              className="rounded bg-gain px-4 py-1.5 text-sm font-medium text-ink-900 hover:opacity-90 disabled:opacity-50"
            >
              Confirm purchase
            </button>
            <button onClick={() => setShowBuyForm(false)} className="rounded px-4 py-1.5 text-sm text-ink-400">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function OwnedPositionCard({ relationship, onChange }: { relationship: Relationship; onChange: () => void }) {
  const [showSellForm, setShowSellForm] = useState(false);
  const [closedQuantity, setClosedQuantity] = useState(relationship.quantity?.toString() ?? '');
  const [closedPrice, setClosedPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirmSell() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/relationships/${relationship.id}/sell`, {
        closedQuantity: Number(closedQuantity),
        closedPrice: Number(closedPrice),
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-300">Owned position</h2>
        {!showSellForm && (
          <button
            onClick={() => setShowSellForm(true)}
            className="rounded border border-loss/40 px-3 py-1 text-xs text-loss hover:bg-loss/10"
          >
            Mark as sold
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-300">
        <span>{relationship.quantity} shares @ ₹{relationship.avgPrice}</span>
        {relationship.targetPrice && <span>Sell target ₹{relationship.targetPrice}</span>}
        {relationship.trailingStopPct && <span>Trailing stop {relationship.trailingStopPct}%</span>}
      </div>
      {relationship.reason && <p className="mt-2 text-sm text-ink-200">{relationship.reason}</p>}

      {showSellForm && (
        <div className="mt-4 border-t border-ink-700 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-400">
              Quantity sold
              <input
                type="number"
                value={closedQuantity}
                onChange={(e) => setClosedQuantity(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-ink-400">
              Sale price
              <input
                type="number"
                value={closedPrice}
                onChange={(e) => setClosedPrice(e.target.value)}
                className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-loss">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmSell}
              disabled={saving || !closedQuantity || !closedPrice}
              className="rounded bg-loss px-4 py-1.5 text-sm font-medium text-ink-900 hover:opacity-90 disabled:opacity-50"
            >
              Confirm sale
            </button>
            <button onClick={() => setShowSellForm(false)} className="rounded px-4 py-1.5 text-sm text-ink-400">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ClosedPositionCard({ relationship }: { relationship: Relationship }) {
  const gain =
    relationship.closedPrice != null && relationship.avgPrice != null && relationship.closedQuantity != null
      ? (relationship.closedPrice - relationship.avgPrice) * relationship.closedQuantity
      : null;
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium text-ink-300">Closed position</h2>
      <p className="mt-2 text-sm text-ink-200">
        Sold {relationship.closedQuantity} @ ₹{relationship.closedPrice} (bought @ ₹{relationship.avgPrice})
      </p>
      {gain != null && (
        <p className={`mt-1 font-sans tabular-nums text-sm ${gain >= 0 ? 'text-gain' : 'text-loss'}`}>
          Realized {gain >= 0 ? '+' : ''}
          ₹{gain.toFixed(0)}
        </p>
      )}
    </Card>
  );
}
