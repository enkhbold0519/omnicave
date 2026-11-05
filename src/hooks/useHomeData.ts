import { useCallback, useEffect, useState } from 'react';

import { useDevScenario } from '@/data/devScenario';
import type { HomeRepository, HomeSnapshot } from '@/data/types';

export type HomeDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: HomeSnapshot };

type Settled = { key: string } & ({ status: 'error'; message: string } | { status: 'ready'; data: HomeSnapshot });

/**
 * Loads the Home snapshot for a cellar; refetches when the cellar, dev scenario or reload token changes.
 * Loading is derived: any result whose request key doesn't match the current one is treated as in flight.
 */
export function useHomeData(repository: HomeRepository, cellarId: string | null) {
  const scenario = useDevScenario();
  const [reloadToken, setReloadToken] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${cellarId}|${scenario}|${reloadToken}`;

  useEffect(() => {
    if (!cellarId) return;
    let cancelled = false;
    repository
      .getHomeSnapshot(cellarId)
      .then((data) => {
        if (!cancelled) setSettled({ key, status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setSettled({ key, status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [repository, cellarId, key]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  let state: HomeDataState = { status: 'loading' };
  if (settled?.key === key) {
    state = settled.status === 'ready' ? { status: 'ready', data: settled.data } : { status: 'error', message: settled.message };
  }

  return { state, reload };
}
