import { CHANGE_THRESHOLDS } from './thresholds';

export type NewsKeywordSignal = 'NEGATIVE' | 'NEUTRAL' | 'POSITIVE' | 'NONE';

export type DownsidePressureState =
  | 'POSITIVE_PRESSURE'
  | 'MIXED'
  | 'ELEVATED_DOWNSIDE'
  | 'SIGNIFICANT_UNCERTAINTY';

export interface DownsidePressureInputs {
  priceWeakness: boolean;
  volumeAnomaly: boolean;
  relativeUnderperformance: boolean;
  newsKeywordSignal: NewsKeywordSignal;
}

export const DOWNSIDE_PRESSURE_DISCLAIMER =
  'This describes what the system currently sees. It does not predict the next price.';

/** Section 7B state machine — a small, explicit truth table, not sentiment ML. */
export function computeDownsidePressure(inputs: DownsidePressureInputs): DownsidePressureState {
  const negativeCount =
    Number(inputs.priceWeakness) + Number(inputs.volumeAnomaly) + Number(inputs.relativeUnderperformance);
  const hasPositiveSignal = inputs.newsKeywordSignal === 'POSITIVE';
  const hasNegativeNews = inputs.newsKeywordSignal === 'NEGATIVE';
  const noNewsSignal = inputs.newsKeywordSignal === 'NONE';

  if (negativeCount === 0 && (hasPositiveSignal || !hasNegativeNews)) {
    if (hasPositiveSignal) return 'POSITIVE_PRESSURE';
  }
  if (negativeCount === 0 && !hasNegativeNews) return 'POSITIVE_PRESSURE';

  if (negativeCount >= 2 && !hasPositiveSignal) {
    return 'ELEVATED_DOWNSIDE';
  }

  if (negativeCount >= 1 && noNewsSignal) {
    return 'SIGNIFICANT_UNCERTAINTY';
  }

  return 'MIXED';
}

/** Small explicit keyword list -- not sentiment ML, per Section 2 item 27. */
const NEGATIVE_KEYWORDS = [
  'downgrade',
  'miss',
  'misses',
  'investigation',
  'probe',
  'resigns',
  'resignation',
  'fraud',
  'lawsuit',
  'default',
  'layoffs',
  'recall',
  'delay',
  'cuts guidance',
  'warns',
];

const POSITIVE_KEYWORDS = [
  'upgrade',
  'beats',
  'beat estimates',
  'record profit',
  'record revenue',
  'buyback',
  'expansion',
  'raises guidance',
  'strong demand',
  'wins order',
  'wins contract',
];

/** Scans matched headlines (see newsDriver.ts) for a simple keyword read. */
export function classifyNewsKeywordSignal(headlines: string[]): NewsKeywordSignal {
  if (headlines.length === 0) return 'NONE';
  const text = headlines.join(' \n ').toLowerCase();
  const hasNeg = NEGATIVE_KEYWORDS.some((k) => text.includes(k));
  const hasPos = POSITIVE_KEYWORDS.some((k) => text.includes(k));
  if (hasNeg && hasPos) return 'NEUTRAL';
  if (hasNeg) return 'NEGATIVE';
  if (hasPos) return 'POSITIVE';
  return 'NEUTRAL';
}

export function buildDownsidePressureInputs(params: {
  todayChangePct: number;
  todayVolume: number;
  avg20DayVolume: number;
  niftyChangePct: number;
  headlines: string[];
}): DownsidePressureInputs {
  const t = CHANGE_THRESHOLDS.downsidePressure;
  const volumeRatio = params.avg20DayVolume > 0 ? params.todayVolume / params.avg20DayVolume : 0;
  return {
    priceWeakness: params.todayChangePct <= t.priceWeaknessPct,
    volumeAnomaly: volumeRatio >= t.volumeAnomalyRatio,
    relativeUnderperformance: params.todayChangePct - params.niftyChangePct <= t.relativeUnderperformancePts,
    newsKeywordSignal: classifyNewsKeywordSignal(params.headlines),
  };
}
