/**
 * Development-only switches for simulating failure states in the mock repository.
 * A tiny observable store so both the repository and UI can read the same value.
 */
import { useSyncExternalStore } from 'react';

export type DevScenario = 'normal' | 'loadFailure' | 'sensorDisconnected' | 'emptyInventory';

export const devScenarios: { value: DevScenario; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'loadFailure', label: 'Load failure' },
  { value: 'sensorDisconnected', label: 'Sensor offline' },
  { value: 'emptyInventory', label: 'Empty inventory' },
];

let current: DevScenario = 'normal';
const listeners = new Set<() => void>();

export function getDevScenario(): DevScenario {
  return current;
}

export function setDevScenario(next: DevScenario): void {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDevScenario(): DevScenario {
  return useSyncExternalStore(subscribe, getDevScenario, getDevScenario);
}
