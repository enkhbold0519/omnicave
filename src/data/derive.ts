/** Pure helpers that derive Home data from raw records. Kept free of React for testing. */
import { idealRanges, staleAfterMinutes } from '@/theme/tokens';

import type { CellarCondition, EnvironmentReading, FeaturedWine, InventoryRecord, Wine } from './types';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export function countBottles(records: InventoryRecord[], cellarId: string): number {
  return records
    .filter((r) => r.cellarId === cellarId && r.status === 'in_cellar')
    .reduce((sum, r) => sum + r.quantity, 0);
}

export function minutesSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_MINUTE));
}

export function isStale(env: EnvironmentReading, now: Date): boolean {
  return env.connection === 'offline' || minutesSince(env.recordedAt, now) > staleAfterMinutes;
}

export function isOutOfRange(env: EnvironmentReading): boolean {
  const { temperatureC: t, humidityPct: h } = idealRanges;
  return (
    env.temperatureC < t.min ||
    env.temperatureC > t.max ||
    env.humidityPct < h.min ||
    env.humidityPct > h.max
  );
}

export function getCondition(env: EnvironmentReading, now: Date): CellarCondition {
  if (env.connection === 'offline' || env.sensor === 'unavailable') return 'disconnected';
  if (env.sensor === 'warning' || isOutOfRange(env)) return 'attention';
  if (isStale(env, now)) return 'stale';
  return 'balanced';
}

export function describeCondition(condition: CellarCondition, env: EnvironmentReading, now: Date): string {
  switch (condition) {
    case 'balanced':
      return 'Conditions are balanced. Your collection is resting well.';
    case 'attention':
      return env.sensorMessage
        ? `${env.sensorMessage}. Worth a look today.`
        : 'Conditions are outside the ideal range. Worth a look today.';
    case 'disconnected':
      return `The cellar sensor is offline. Showing readings from ${formatRelativeTime(env.recordedAt, now)}.`;
    case 'stale':
      return `Readings haven't refreshed since ${formatRelativeTime(env.recordedAt, now)}.`;
  }
}

export function formatRelativeTime(date: Date, now: Date): string {
  const minutes = minutesSince(date, now);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/** Deterministically picks one item per calendar day so content rotates daily. */
export function pickDaily<T>(items: T[], now: Date): T | null {
  if (items.length === 0) return null;
  const day = Math.floor(now.getTime() / MS_PER_DAY);
  return items[day % items.length];
}

export function pickFeaturedWine(
  records: InventoryRecord[],
  wines: Wine[],
  cellarId: string,
  now: Date,
): FeaturedWine | null {
  const candidates = records.filter(
    (r) => r.cellarId === cellarId && r.status === 'in_cellar' && r.quantity > 0 && r.readyToDrink,
  );
  const record = pickDaily(candidates, now);
  if (!record) return null;
  const wine = wines.find((w) => w.id === record.wineId);
  return wine ? { wine, quantity: record.quantity } : null;
}
