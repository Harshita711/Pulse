/** A tiny inline price sparkline. Real data only -- renders nothing if there
 * aren't at least two real points, rather than drawing a fabricated flat line. */
export function Sparkline({ points, width = 64, height = 24 }: { points: { t: string; price: number }[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="flex items-center justify-center text-[10px] text-ink-500">—</div>;
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1; // avoid divide-by-zero for a perfectly flat series
  const pad = 2;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((p.price - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const direction = prices[prices.length - 1] >= prices[0] ? 'up' : 'down';
  const stroke = direction === 'up' ? '#5DB85D' : '#E5484D'; // --pulse-accent / --pulse-negative

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <polyline points={coords.join(' ')} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
