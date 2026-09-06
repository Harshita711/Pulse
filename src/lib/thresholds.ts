// The one config object every scoring weight and band boundary lives in.
// Section 7A: "Weights live in one CHANGE_THRESHOLDS config."

export const CHANGE_THRESHOLDS = {
  // Max points contributed by each of the five score components.
  // They sum to 100 so the composite score is naturally 0-100.
  weights: {
    priceMove: 30,
    volume: 20,
    relativePerformance: 20,
    technicalSignal: 15,
    personalRelevance: 15,
  },

  // Band boundaries on the final 0-100 composite score.
  bands: {
    LOW: [0, 29],
    MEDIUM: [30, 59],
    HIGH: [60, 79],
    CRITICAL: [80, 100],
  } as const,

  // priceMoveScore: today's % move vs the stock's own trailing average daily move.
  // ratio = |todayMove| / avgDailyMove. These are the ratio breakpoints mapped
  // linearly onto the weight above.
  priceMove: {
    ratioForFullScore: 3.0, // 3x the stock's own average daily move = max score
  },

  // volumeScore: todayVolume / avg20DayVolume
  volume: {
    ratioForFullScore: 3.0, // 3x average volume = max score (spec's "3x volume triggers spike")
    spikeRatio: 3.0,
  },

  // relativePerformanceScore: stock %change - NIFTY %change, in percentage points
  relativePerformance: {
    ptsForFullScore: 6.0,
  },

  // technicalSignalScore: distance from 20-day moving average, as % of MA20
  technicalSignal: {
    pctForFullScore: 8.0,
  },

  // personalRelevanceScore: flat points by relationship status, per Section 2 item 20
  personalRelevance: {
    OWN: 10,
    WAITING_NEAR_TARGET: 8, // WAITING_FOR_PRICE, within proximityForBoost of target
    CONSIDERING: 6,
    RESEARCHING: 4,
    WATCHING: 2,
    NONE: 0,
    proximityForBoostPct: 5, // "near target" = within 5% of targetPrice
  },

  // Section 7B downside-pressure inputs
  downsidePressure: {
    priceWeaknessPct: -1.5, // today's % change below this counts as "priceWeakness"
    volumeAnomalyRatio: 2.0, // today volume / avg20 above this counts as "volumeAnomaly"
    relativeUnderperformancePts: -2.0, // vs NIFTY
  },

  // Notification sensitivity (Section 2 item 31)
  sensitivity: {
    QUIET: ['CRITICAL'],
    BALANCED: ['HIGH', 'CRITICAL'],
    HIGH: ['MEDIUM', 'HIGH', 'CRITICAL'],
  } as Record<string, string[]>,

  // Sell-signal context panel trigger (Section 2 item 17)
  sellSignal: {
    proximityPct: 5, // show the panel when price is within 5% of the sell target
  },

  // "Don't miss this" / sector grouping (Tier 3, items 24-25)
  sectorGrouping: {
    minStocksSameDirection: 3,
  },
} as const;

export type Band = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export function bandForScore(score: number): Band {
  const s = Math.max(0, Math.min(100, score));
  if (s >= CHANGE_THRESHOLDS.bands.CRITICAL[0]) return 'CRITICAL';
  if (s >= CHANGE_THRESHOLDS.bands.HIGH[0]) return 'HIGH';
  if (s >= CHANGE_THRESHOLDS.bands.MEDIUM[0]) return 'MEDIUM';
  return 'LOW';
}
