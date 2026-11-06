import { useCallback, useEffect, useRef, useState } from 'react';

import { useDataVersion } from '@/data/cellarStore';
import { useDevScenario } from '@/data/devScenario';

export type QueryState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

type Settled<T> = { key: string; version: number } & ({ status: 'error'; message: string } | { status: 'ready'; data: T });

/**
 * Loads data for a key (e.g. "inventory|all") and reloads when the key, dev scenario or reload token changes.
 * Loading is derived from whether the latest result matches the current key, so no state is set inside the effect.
 * When bottles change (data version), it refetches quietly: the current data stays on screen until the new arrives.
 */
export function useQuery<T>(key: string, load: () => Promise<T>) {
  const scenario = useDevScenario();
  const [token, setToken] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const version = useDataVersion();
  const fullKey = `${key}|${scenario}|${token}`;
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef.current()
      .then((data) => {
        if (!cancelled) setSettled({ key: fullKey, version, status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettled({ key: fullKey, version, status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      });
    return () => {
      cancelled = true;
    };
  }, [fullKey, version]);

  const reload = useCallback(() => setToken((t) => t + 1), []);

  let state: QueryState<T> = { status: 'loading' };
  if (settled?.key === fullKey) {
    state = settled.status === 'ready' ? { status: 'ready', data: settled.data } : { status: 'error', message: settled.message };
  }
  /** The data version the shown result was loaded at; lets a screen wait until its own change is reflected. */
  return { state, reload, loadedVersion: settled?.key === fullKey ? settled.version : null };
}
