import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { handleError, requireUserId } from '@/lib/apiHelpers';
import { detectSectorGroups, SectorEntry } from '@/lib/sectors';

async function buildUniverseEntries(): Promise<SectorEntry[]> {
  const instruments = await prisma.instrument.findMany();
  const entries: SectorEntry[] = [];
  for (const instrument of instruments) {
    const [snapshot, changeEvent] = await Promise.all([
      prisma.marketSnapshot.findFirst({ where: { instrumentId: instrument.id }, orderBy: { timestamp: 'desc' } }),
      prisma.changeEvent.findFirst({ where: { instrumentId: instrument.id }, orderBy: { detectedAt: 'desc' } }),
    ]);
    if (!snapshot || !changeEvent) continue;
    entries.push({
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      sector: instrument.sector,
      changePercent: snapshot.changePercent,
      band: changeEvent.severity as any,
    });
  }
  return entries;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const watchItems = await prisma.watchlistItem.findMany({
      where: { watchlist: { userId } },
      select: { instrumentId: true },
    });
    const watched = new Set(watchItems.map((w) => w.instrumentId));
    const entries = await buildUniverseEntries();
    const groups = detectSectorGroups(entries, watched);
    return NextResponse.json(groups);
  } catch (err) {
    return handleError(err);
  }
}
