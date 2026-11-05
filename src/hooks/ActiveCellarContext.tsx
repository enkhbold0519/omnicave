import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { homeRepository } from '@/data/mockHomeRepository';
import type { Cellar, HomeRepository } from '@/data/types';

interface ActiveCellarValue {
  repository: HomeRepository;
  cellars: Cellar[];
  activeCellar: Cellar | null;
  setActiveCellarId: (id: string) => void;
}

const ActiveCellarContext = createContext<ActiveCellarValue | null>(null);

export function ActiveCellarProvider({
  children,
  repository = homeRepository,
}: {
  children: ReactNode;
  repository?: HomeRepository;
}) {
  const [cellars, setCellars] = useState<Cellar[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repository.listCellars().then((list) => {
      if (cancelled) return;
      setCellars(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const value = useMemo<ActiveCellarValue>(
    () => ({
      repository,
      cellars,
      activeCellar: cellars.find((c) => c.id === activeId) ?? null,
      setActiveCellarId: setActiveId,
    }),
    [repository, cellars, activeId],
  );

  return <ActiveCellarContext.Provider value={value}>{children}</ActiveCellarContext.Provider>;
}

export function useActiveCellar(): ActiveCellarValue {
  const ctx = useContext(ActiveCellarContext);
  if (!ctx) throw new Error('useActiveCellar must be used within ActiveCellarProvider');
  return ctx;
}
