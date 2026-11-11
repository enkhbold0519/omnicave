/**
 * Client-side state for personas and debates. The mock repository writes here as it "streams"; with a backend,
 * REST responses and WebSocket/SSE events would write here instead. Screens read it through `useSommelier`.
 * In memory only.
 */
import { useSyncExternalStore } from 'react';

import { builtInPersonas } from './personas';
import type { Debate, Persona } from './types';

interface State {
  personas: Persona[];
  /** Newest first. */
  debates: Debate[];
}

const initial = (): State => ({ personas: builtInPersonas.map((p) => ({ ...p, memory: [...p.memory] })), debates: [] });

let state: State = initial();
const listeners = new Set<() => void>();

export function getSommelierState(): State {
  return state;
}

export function setSommelierState(change: (s: State) => State): void {
  state = change(state);
  listeners.forEach((l) => l());
}

export function updateDebate(id: string, change: (d: Debate) => Debate): void {
  setSommelierState((s) => ({ ...s, debates: s.debates.map((d) => (d.id === id ? change(d) : d)) }));
}

export function resetSommelierStore(): void {
  state = initial();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Subscribe to a slice of sommelier state; re-renders when the slice changes identity. */
export function useSommelier<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}
