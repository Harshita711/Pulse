import { describe, it, expect } from 'vitest';
import {
  priceMoveScore,
  isVolumeSpike,
  relativePerformanceScore,
  personalRelevanceScore,
  computeAttentionScore,
  bandForScore,
} from '../src/lib/scoring';
import { matchesThesisCondition } from '../src/lib/thesis';

describe('priceMoveScore', () => {
  it('scores a 5% move vs a 1.5% average daily move as high (near max weight)', () => {
    const score = priceMoveScore(5, 1.5);
    // ratio = 3.33x -> clamps at the 3x-for-full-score cap -> full 30 points
    expect(score).toBe(30);
    // and it should clearly outrank a move that's in line with the average
    const inLineScore = priceMoveScore(1.5, 1.5);
    expect(score).toBeGreaterThan(inLineScore);
  });
});

describe('isVolumeSpike', () => {
  it('flags exactly 3x average volume and above as a spike', () => {
    expect(isVolumeSpike(3_000_000, 1_000_000)).toBe(true);
    expect(isVolumeSpike(2_999_999, 1_000_000)).toBe(false);
    expect(isVolumeSpike(6_000_000, 1_000_000)).toBe(true);
  });
});

describe('relative performance vs isolated price move', () => {
  it('outperforming NIFTY by 4pts scores a higher composite than an isolated +2% move', () => {
    // Case A: stock +2%, NIFTY flat, average daily move ~2% (nothing unusual)
    const caseA = computeAttentionScore({
      todayChangePct: 2,
      avgDailyMovePct: 2,
      todayVolume: 1_000_000,
      avg20DayVolume: 1_000_000,
      niftyChangePct: 0,
      price: 100,
      ma20: 100,
      relationshipStatus: null,
    });

    // Case B: stock +2% but NIFTY is -2% -> a 4pt relative outperformance
    const caseB = computeAttentionScore({
      todayChangePct: 2,
      avgDailyMovePct: 2,
      todayVolume: 1_000_000,
      avg20DayVolume: 1_000_000,
      niftyChangePct: -2,
      price: 100,
      ma20: 100,
      relationshipStatus: null,
    });

    expect(caseB.relative).toBeGreaterThan(caseA.relative);
    expect(caseB.total).toBeGreaterThan(caseA.total);
  });
});

describe('band boundaries', () => {
  it('assigns LOW/MEDIUM/HIGH/CRITICAL at the exact documented boundaries', () => {
    expect(bandForScore(0)).toBe('LOW');
    expect(bandForScore(29)).toBe('LOW');
    expect(bandForScore(30)).toBe('MEDIUM');
    expect(bandForScore(59)).toBe('MEDIUM');
    expect(bandForScore(60)).toBe('HIGH');
    expect(bandForScore(79)).toBe('HIGH');
    expect(bandForScore(80)).toBe('CRITICAL');
    expect(bandForScore(100)).toBe('CRITICAL');
  });
});

describe('personalRelevanceScore', () => {
  it('scores an owned position higher than a merely-watched one at equal market signal', () => {
    const owned = personalRelevanceScore('OWN');
    const watched = personalRelevanceScore('WATCHING');
    expect(owned).toBeGreaterThan(watched);
  });

  it('boosts WAITING_FOR_PRICE when the price is near the target', () => {
    const near = personalRelevanceScore('WAITING_FOR_PRICE', 102, 100); // 2% away
    const far = personalRelevanceScore('WAITING_FOR_PRICE', 130, 100); // 30% away
    expect(near).toBeGreaterThan(far);
  });
});

describe('thesis-reconsider matching', () => {
  it('flags a matching event when the reconsider condition mentions the sector and the event is a relative-performance move', () => {
    const matched = matchesThesisCondition('if the auto sector weakens broadly', {
      type: 'RELATIVE_PERFORMANCE',
    });
    expect(matched).toBe(true);
  });

  it('does not flag an unrelated event category', () => {
    const matched = matchesThesisCondition('if the auto sector weakens broadly', {
      type: 'VOLUME_SPIKE',
    });
    expect(matched).toBe(false);
  });

  it('flags a price-drop event when the condition is about a price fall', () => {
    const matched = matchesThesisCondition('reconsider if it falls sharply', {
      type: 'PRICE_MOVE',
      currentValue: 90,
      previousValue: 100,
    });
    expect(matched).toBe(true);
  });
});
