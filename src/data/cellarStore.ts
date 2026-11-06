/**
 * The one place mock bottles live at runtime. Every repository reads from here and every change goes through
 * `updateBottles`, so Home, Inventory and the Cellar Map always agree. Screens subscribe via `useDataVersion`
 * and refetch when it changes. In memory only: a reload starts again from the seed in mockDb.
 * (With a backend this becomes the server; the version becomes a refetch/push signal.)
 */
import { useSyncExternalStore } from 'react';

import { bottles as seed } from './mockDb';
import type { Bottle } from './types';

let bottles: Bottle[] = seed;
let version = 0;
const listeners = new Set<() => void>();

export function getBottles(): Bottle[] {
  return bottles;
}

/** Replace the bottle list immutably and notify subscribers. */
export function updateBottles(change: (current: Bottle[]) => Bottle[]): void {
  bottles = change(bottles);
  version++;
  listeners.forEach((l) => l());
}

/** Back to the seed data (tests). */
export function resetCellarStore(): void {
  bottles = seed;
  version++;
  listeners.forEach((l) => l());
}

export function getDataVersion(): number {
  return version;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Increments whenever bottles change; include it in a query's dependencies to stay in sync. */
export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, getDataVersion, getDataVersion);
}
