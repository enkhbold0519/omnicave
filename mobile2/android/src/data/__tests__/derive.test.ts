import { describe, expect, it } from '@jest/globals';

import { countBottles, drinkingState, formatRelativeTime, getCondition, homeSummary, isStale, pickDaily, pickFeaturedWine } from '../derive';
import { bottles, wines } from '../mockDb';
import type { EnvironmentReading } from '../types';

const now = new Date('2026-11-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

const env = (overrides: Partial<EnvironmentReading> = {}): EnvironmentReading => ({
  temperatureC: 12.8,
  humidityPct: 65,
  connection: 'online',
  sensor: 'ok',
  recordedAt: minutesAgo(1),
  ...overrides,
});

describe('countBottles', () => {
  it('counts individual bottles still in the cellar; opened bottles are excluded', () => {
    expect(countBottles(bottles, 'cellar-signature')).toBe(48);
    expect(countBottles(bottles, 'cellar-reserve')).toBe(21);
  });

  it('returns 0 for no records', () => {
    expect(countBottles([], 'cellar-signature')).toBe(0);
  });
});

describe('getCondition', () => {
  it('is balanced for fresh in-range readings', () => {
    expect(getCondition(env(), now)).toBe('balanced');
  });

  it('flags attention for sensor warnings or out-of-range values', () => {
    expect(getCondition(env({ sensor: 'warning' }), now)).toBe('attention');
    expect(getCondition(env({ humidityPct: 40 }), now)).toBe('attention');
  });

  it('flags disconnected when offline', () => {
    expect(getCondition(env({ connection: 'offline' }), now)).toBe('disconnected');
  });

  it('flags stale when the last reading is old', () => {
    expect(getCondition(env({ recordedAt: minutesAgo(60) }), now)).toBe('stale');
  });
});

describe('isStale', () => {
  it('distinguishes live from stale data', () => {
    expect(isStale(env({ recordedAt: minutesAgo(5) }), now)).toBe(false);
    expect(isStale(env({ recordedAt: minutesAgo(16) }), now)).toBe(true);
    expect(isStale(env({ connection: 'offline' }), now)).toBe(true);
  });
});

describe('formatRelativeTime', () => {
  it('formats minutes, hours and days', () => {
    expect(formatRelativeTime(minutesAgo(0), now)).toBe('just now');
    expect(formatRelativeTime(minutesAgo(5), now)).toBe('5 min ago');
    expect(formatRelativeTime(minutesAgo(190), now)).toBe('3 h ago');
    expect(formatRelativeTime(minutesAgo(3000), now)).toBe('2 d ago');
  });
});

describe('pickDaily', () => {
  it('returns null for empty input and rotates by day', () => {
    expect(pickDaily([], now)).toBeNull();
    const tomorrow = new Date(now.getTime() + 86_400_000);
    expect(pickDaily(['a', 'b'], now)).not.toBe(pickDaily(['a', 'b'], tomorrow));
  });
});

describe('homeSummary', () => {
  it('uses the approved message for each state', () => {
    expect(homeSummary('balanced', 0)).toBe('Your cellar is ready for its first bottle.');
    expect(homeSummary('balanced', 10)).toBe('Your collection is resting well.');
    expect(homeSummary('attention', 10)).toBe('Your cellar needs attention.');
    expect(homeSummary('stale', 10)).toBe('Your cellar needs attention.');
    expect(homeSummary('disconnected', 10)).toBe('Your cellar is currently offline.');
  });

  it('puts connection and environment problems ahead of an empty inventory', () => {
    expect(homeSummary('disconnected', 0)).toBe('Your cellar is currently offline.');
    expect(homeSummary('attention', 0)).toBe('Your cellar needs attention.');
  });
});

describe('drinking window', () => {
  const wine = wines.find((w) => w.id === 'wine-leoville-2015')!;
  it('is hold before the window, ready inside it, past after it', () => {
    expect(drinkingState(wine, new Date(2026, 5, 1))).toBe('hold');
    expect(drinkingState(wine, new Date(2030, 5, 1))).toBe('ready');
    expect(drinkingState(wine, new Date(2046, 5, 1))).toBe('past');
  });
});

describe('pickFeaturedWine', () => {
  it('only features ready wines in that cellar, with their bottle count', () => {
    const featured = pickFeaturedWine(bottles, wines, 'cellar-signature', now)!;
    expect(drinkingState(featured.wine, now)).toBe('ready');
    const inCellar = bottles.filter((b) => b.cellarId === 'cellar-signature' && b.status === 'in_cellar' && b.wineId === featured.wine.id);
    expect(featured.quantity).toBe(inCellar.length);
  });
});
