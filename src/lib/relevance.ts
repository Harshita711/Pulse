import { personalRelevanceScore, bandForScore, Band, RelationshipStatusForScoring } from './scoring';

// Design note: ChangeEvent rows are instrument-scoped (one market signal can
// be "meaningful" to thousands of users differently), so they store only the
// four objective market components with personalRelevance=0. The 5th
// component -- how much THIS user should care -- is computed live here at
// read time from that user's UserInstrumentRelationship, then folded in.
// This avoids writing a ChangeEvent per (instrument, user) pair while still
// giving every user a true five-component score on their own dashboard.

export interface MarketBreakdown {
  price: number;
  volume: number;
  relative: number;
  technical: number;
}

export interface PersonalizedScore extends MarketBreakdown {
  personalRelevance: number;
  total: number;
  band: Band;
}

export function personalizeScore(
  market: MarketBreakdown,
  relationship: { status: RelationshipStatusForScoring; targetPrice?: number | null } | null,
  currentPrice: number
): PersonalizedScore {
  const personalRelevance = personalRelevanceScore(
    relationship?.status ?? null,
    currentPrice,
    relationship?.targetPrice ?? null
  );
  const total = Math.min(100, market.price + market.volume + market.relative + market.technical + personalRelevance);
  return { ...market, personalRelevance, total, band: bandForScore(total) };
}
