import { CHANGE_THRESHOLDS, bandForScore, Band } from './thresholds';

function clampRatio(ratio: number, cap: number): number {
  if (!isFinite(ratio) || ratio < 0) return 0;
  return Math.min(1, ratio / cap);
}

/** Today's % move vs the stock's own trailing average daily move. */
export function priceMoveScore(todayChangePct: number, avgDailyMovePct: number): number {
  const w = CHANGE_THRESHOLDS.weights.priceMove;
  const safeAvg = Math.max(avgDailyMovePct, 0.1); // guard div-by-~0 for very quiet stocks
  const ratio = Math.abs(todayChangePct) / safeAvg;
  return Math.round(w * clampRatio(ratio, CHANGE_THRESHOLDS.priceMove.ratioForFullScore));
}

/** todayVolume / avg20DayVolume, scaled to the weight. */
export function volumeScore(todayVolume: number, avg20DayVolume: number): number {
  const w = CHANGE_THRESHOLDS.weights.volume;
  if (avg20DayVolume <= 0) return 0;
  const ratio = todayVolume / avg20DayVolume;
  return Math.round(w * clampRatio(ratio, CHANGE_THRESHOLDS.volume.ratioForFullScore));
}

/** True when today's volume is >= 3x the 20-day average (spec: "3x volume triggers spike"). */
export function isVolumeSpike(todayVolume: number, avg20DayVolume: number): boolean {
  if (avg20DayVolume <= 0) return false;
  return todayVolume / avg20DayVolume >= CHANGE_THRESHOLDS.volume.spikeRatio;
}

/** Stock % change vs NIFTY % change, same window. Magnitude of the gap either direction. */
export function relativePerformanceScore(stockChangePct: number, niftyChangePct: number): number {
  const w = CHANGE_THRESHOLDS.weights.relativePerformance;
  const diff = Math.abs(stockChangePct - niftyChangePct);
  return Math.round(w * clampRatio(diff, CHANGE_THRESHOLDS.relativePerformance.ptsForFullScore));
}

/** Distance of price from its 20-day moving average (breakout/breakdown magnitude). */
export function technicalSignalScore(price: number, ma20: number): number {
  const w = CHANGE_THRESHOLDS.weights.technicalSignal;
  if (ma20 <= 0) return 0;
  const pctFromMa = Math.abs((price - ma20) / ma20) * 100;
  return Math.round(w * clampRatio(pctFromMa, CHANGE_THRESHOLDS.technicalSignal.pctForFullScore));
}

export type RelationshipStatusForScoring =
  | 'OWN'
  | 'CONSIDERING'
  | 'WAITING_FOR_PRICE'
  | 'RESEARCHING'
  | 'WATCHING'
  | null
  | undefined;

/** Section 2 item 20: owns=10, considering=6, waiting near target=8, watching=2, none=0. */
export function personalRelevanceScore(
  status: RelationshipStatusForScoring,
  currentPrice?: number | null,
  targetPrice?: number | null
): number {
  const cfg = CHANGE_THRESHOLDS.personalRelevance;
  if (!status) return cfg.NONE;
  if (status === 'OWN') return cfg.OWN;
  if (status === 'WAITING_FOR_PRICE') {
    if (currentPrice != null && targetPrice != null && targetPrice > 0) {
      const proximityPct = (Math.abs(currentPrice - targetPrice) / targetPrice) * 100;
      if (proximityPct <= cfg.proximityForBoostPct) return cfg.WAITING_NEAR_TARGET;
    }
    return cfg.CONSIDERING;
  }
  if (status === 'CONSIDERING') return cfg.CONSIDERING;
  if (status === 'RESEARCHING') return cfg.RESEARCHING;
  if (status === 'WATCHING') return cfg.WATCHING;
  return cfg.NONE;
}

export interface ScoreInputs {
  todayChangePct: number;
  avgDailyMovePct: number;
  todayVolume: number;
  avg20DayVolume: number;
  niftyChangePct: number;
  price: number;
  ma20: number;
  relationshipStatus: RelationshipStatusForScoring;
  targetPrice?: number | null;
}

export interface ScoreBreakdown {
  price: number;
  volume: number;
  relative: number;
  technical: number;
  personalRelevance: number;
  total: number;
  band: Band;
}

/** The five-component composite score. Sums the weights above, clamped 0-100. */
export function computeAttentionScore(inputs: ScoreInputs): ScoreBreakdown {
  const price = priceMoveScore(inputs.todayChangePct, inputs.avgDailyMovePct);
  const volume = volumeScore(inputs.todayVolume, inputs.avg20DayVolume);
  const relative = relativePerformanceScore(inputs.todayChangePct, inputs.niftyChangePct);
  const technical = technicalSignalScore(inputs.price, inputs.ma20);
  const personalRelevance = personalRelevanceScore(
    inputs.relationshipStatus,
    inputs.price,
    inputs.targetPrice
  );
  const total = Math.min(100, price + volume + relative + technical + personalRelevance);
  return { price, volume, relative, technical, personalRelevance, total, band: bandForScore(total) };
}

export { bandForScore };
export type { Band };
