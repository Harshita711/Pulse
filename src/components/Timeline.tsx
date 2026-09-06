import { Card } from './ui';

interface TimelineEntry {
  at: string;
  kind: 'relationship' | 'market';
  label: string;
  detail: any;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-400">No history yet.</p>;
  }
  return (
    <Card className="divide-y divide-ink-700">
      {entries.map((e, i) => (
        <div key={i} className="flex gap-3 px-4 py-3">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              e.kind === 'market' ? 'bg-signal-high' : 'bg-signal'
            }`}
          />
          <div>
            <p className="text-sm text-ink-100">{e.label}</p>
            <p className="text-xs text-ink-500">{new Date(e.at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
