/** Pure helpers that derive Home data from raw records. Kept free of React for testing. */
import { idealRanges, staleAfterMinutes } from '@/theme/tokens';

import type { Bottle, CellarCondition, EnvironmentReading, FeaturedWine, Wine } from './types';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Bottles physically in a cellar; opened bottles don't count. */
export function countBottles(bottles: Bottle[], cellarId: string): number {
  return bottles.filter((b) => b.cellarId === cellarId && b.status === 'in_cellar').length;
}

export type DrinkingState = 'ready' | 'hold' | 'past';

/** Where a wine sits in its drinking window this year. */
export function drinkingState(wine: Wine, now: Date): DrinkingState {
  const year = now.getFullYear();
  if (year < wine.drinkFrom) return 'hold';
  if (year > wine.drinkUntil) return 'past';
  return 'ready';
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

/**
 * One-line greeting summary. Connectivity and environment problems take precedence over an empty
 * inventory, because they need action regardless of how many bottles are stored.
 * Stale readings count as needing attention: the data can't be trusted as "resting well".
 */
export function homeSummary(condition: CellarCondition, bottleCount: number): string {
  if (condition === 'disconnected') return 'Your cellar is currently offline.';
  if (condition === 'attention' || condition === 'stale') return 'Your cellar needs attention.';
  if (bottleCount === 0) return 'Your cellar is ready for its first bottle.';
  return 'Your collection is resting well.';
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

/** One ready-to-drink wine from the cellar, rotating daily; quantity is how many of its bottles are there. */
export function pickFeaturedWine(bottles: Bottle[], wines: Wine[], cellarId: string, now: Date): FeaturedWine | null {
  const counts = new Map<string, number>();
  for (const b of bottles) {
    if (b.cellarId === cellarId && b.status === 'in_cellar') counts.set(b.wineId, (counts.get(b.wineId) ?? 0) + 1);
  }
  const ready = wines.filter((w) => counts.has(w.id) && drinkingState(w, now) === 'ready');
  const wine = pickDaily(ready, now);
  return wine ? { wine, quantity: counts.get(wine.id) ?? 0 } : null;
}

/** e.g. "12 Mar 2025". */
export const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
