/**
 * The one place mock bottles and wines live at runtime. Every repository reads from here and every change goes through
 * `updateBottles`, so Home, Inventory and the Cellar Map always agree. Screens subscribe via `useDataVersion`
 * and refetch when it changes. In memory only: a reload starts again from the seed in mockDb.
 * (With a backend this becomes the server; the version becomes a refetch/push signal.)
 */
import { useSyncExternalStore } from 'react';

import { cellars as seedCellars, detectedBottles as seedDetections, bottles as seed, slots as seedSlots, wines as seedWines } from './mockDb';
import type { Bottle, Cellar, DetectedBottle, StorageSlot, Wine } from './types';

let bottles: Bottle[] = seed;
let wines: Wine[] = seedWines;
let detections: DetectedBottle[] = seedDetections;
let cellars: Cellar[] = seedCellars;
let slots: StorageSlot[] = seedSlots;
let version = 0;
const listeners = new Set<() => void>();

export function getBottles(): Bottle[] {
  return bottles;
}

export function getWines(): Wine[] {
  return wines;
}

/** Add a wine to the catalog (manual registration); bottles are added separately. */
export function addWine(wine: Wine): void {
  wines = [...wines, wine];
}

/** Change a wine's details (manual modification) and notify subscribers. */
export function updateWine(id: string, change: Partial<Wine>): void {
  wines = wines.map((w) => (w.id === id ? { ...w, ...change } : w));
  version++;
  listeners.forEach((l) => l());
}

export function getCellars(): Cellar[] {
  return cellars;
}

export function getSlots(): StorageSlot[] {
  return slots;
}

/** Add a cellar unit with its storage positions, or change a cellar's details; notifies subscribers. */
export function addCellar(cellar: Cellar, cellarSlots: StorageSlot[]): void {
  cellars = [...cellars, cellar];
  slots = [...slots, ...cellarSlots];
  version++;
  listeners.forEach((l) => l());
}

export function updateCellar(id: string, change: Partial<Cellar>): void {
  cellars = cellars.map((c) => (c.id === id ? { ...c, ...change, id: c.id } : c));
  version++;
  listeners.forEach((l) => l());
}

export function getDetections(): DetectedBottle[] {
  return detections;
}

export function removeDetection(id: string): void {
  detections = detections.filter((d) => d.id !== id);
  version++;
  listeners.forEach((l) => l());
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
  wines = seedWines;
  detections = seedDetections;
  cellars = seedCellars;
  slots = seedSlots;
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
