import { CHANGE_THRESHOLDS } from './thresholds';
import { Band } from './scoring';

export interface SectorEntry {
  instrumentId: string;
  symbol: string;
  sector: string;
  changePercent: number;
  band: Band;
}

export interface SectorGroup {
  sector: string;
  direction: 'up' | 'down';
  members: SectorEntry[];
}

/**
 * Section 2 item 24: "3+ watched stocks, same sector, same direction ->
 * one grouped alert." Runs over the fixed seeded universe's latest scores.
 */
export function detectSectorGroups(entries: SectorEntry[], watchedInstrumentIds: Set<string>): SectorGroup[] {
  const watched = entries.filter((e) => watchedInstrumentIds.has(e.instrumentId));
  const bySector = new Map<string, SectorEntry[]>();
  for (const e of watched) {
    if (!bySector.has(e.sector)) bySector.set(e.sector, []);
    bySector.get(e.sector)!.push(e);
  }
  const groups: SectorGroup[] = [];
  for (const [sector, members] of bySector) {
    for (const direction of ['up', 'down'] as const) {
      const dirMembers = members.filter((m) =>
        direction === 'up' ? m.changePercent > 0 : m.changePercent < 0
      );
      if (dirMembers.length >= CHANGE_THRESHOLDS.sectorGrouping.minStocksSameDirection) {
        groups.push({ sector, direction, members: dirMembers });
      }
    }
  }
  return groups;
}

/**
 * Section 2 item 25: instruments in the same sector as something the user
 * watches, not on their list, currently HIGH/CRITICAL. Same fixed universe,
 * no open-ended scanning.
 */
export function sectorScopedDontMiss(entries: SectorEntry[], watchedInstrumentIds: Set<string>): SectorEntry[] {
  const watchedSectors = new Set(
    entries.filter((e) => watchedInstrumentIds.has(e.instrumentId)).map((e) => e.sector)
  );
  return entries.filter(
    (e) =>
      !watchedInstrumentIds.has(e.instrumentId) &&
      watchedSectors.has(e.sector) &&
      (e.band === 'HIGH' || e.band === 'CRITICAL')
  );
}
