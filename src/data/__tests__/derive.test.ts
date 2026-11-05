import { describe, expect, it } from '@jest/globals';

import { countBottles, formatRelativeTime, getCondition, isStale, pickDaily } from '../derive';
import { inventory } from '../mockDb';
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
  it('sums quantities of in-cellar records only', () => {
    expect(countBottles(inventory, 'cellar-signature')).toBe(10);
    expect(countBottles(inventory, 'cellar-reserve')).toBe(6);
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
