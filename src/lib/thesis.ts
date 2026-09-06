// Section 2 item 21: "reconsiderCondition stored at creation; when a later
// ChangeEvent fires with a matching category, write RelationshipEvent(THESIS_FLAG)."
//
// reconsiderCondition is free text the user types when creating a plan
// ("if the sector weakens", "if volume dries up", "if it breaks below the
// 20-day average"). We don't run NLP on it -- we map a small set of
// keywords to the same categories a ChangeEvent can carry, and flag on
// overlap. This keeps the match explainable ("your condition mentioned
// 'sector', this event was a sector-relative move") rather than a black box.

export type ThesisCategory =
  | 'PRICE_DROP'
  | 'PRICE_RISE'
  | 'VOLUME'
  | 'SECTOR'
  | 'RELATIVE_PERFORMANCE'
  | 'TECHNICAL'
  | 'NEWS_NEGATIVE';

const CATEGORY_KEYWORDS: Record<ThesisCategory, string[]> = {
  PRICE_DROP: ['drop', 'fall', 'falls', 'decline', 'down', 'crash', 'correction'],
  PRICE_RISE: ['rise', 'rises', 'rally', 'up', 'breakout', 'surge'],
  VOLUME: ['volume', 'liquidity'],
  SECTOR: ['sector', 'peers', 'industry'],
  RELATIVE_PERFORMANCE: ['underperform', 'nifty', 'index', 'benchmark', 'lag'],
  TECHNICAL: ['moving average', '20-day', 'ma20', 'support', 'resistance', 'breakdown'],
  NEWS_NEGATIVE: ['downgrade', 'investigation', 'resign', 'guidance', 'earnings', 'miss'],
};

export function categoriesForCondition(reconsiderCondition: string): ThesisCategory[] {
  const text = reconsiderCondition.toLowerCase();
  return (Object.keys(CATEGORY_KEYWORDS) as ThesisCategory[]).filter((cat) =>
    CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))
  );
}

export interface ThesisMatchEvent {
  type: 'PRICE_MOVE' | 'VOLUME_SPIKE' | 'RELATIVE_PERFORMANCE' | 'TECHNICAL_SIGNAL' | 'COMPOSITE';
  currentValue?: number | null;
  previousValue?: number | null;
  hasNegativeNews?: boolean;
}

function categoriesForEvent(event: ThesisMatchEvent): ThesisCategory[] {
  const cats: ThesisCategory[] = [];
  if (event.type === 'PRICE_MOVE' && event.currentValue != null && event.previousValue != null) {
    cats.push(event.currentValue < event.previousValue ? 'PRICE_DROP' : 'PRICE_RISE');
  }
  if (event.type === 'VOLUME_SPIKE') cats.push('VOLUME');
  if (event.type === 'RELATIVE_PERFORMANCE') cats.push('RELATIVE_PERFORMANCE', 'SECTOR');
  if (event.type === 'TECHNICAL_SIGNAL') cats.push('TECHNICAL');
  if (event.hasNegativeNews) cats.push('NEWS_NEGATIVE');
  return cats;
}

/** True if the change event's category overlaps the user's stated reconsider condition. */
export function matchesThesisCondition(reconsiderCondition: string, event: ThesisMatchEvent): boolean {
  if (!reconsiderCondition || reconsiderCondition.trim().length === 0) return false;
  const conditionCats = new Set(categoriesForCondition(reconsiderCondition));
  if (conditionCats.size === 0) return false;
  const eventCats = categoriesForEvent(event);
  return eventCats.some((c) => conditionCats.has(c));
}
