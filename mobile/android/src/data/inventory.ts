/** Pure inventory logic: grouping bottles into wines, search, filters, sorting and history. React-free for tests. */
import { drinkingState, type DrinkingState } from './derive';
import type { Bottle, Cellar, Wine, WineStyle } from './types';

/** One wine as it appears in the inventory: all its bottles in scope, grouped. */
export interface InventoryItem {
  wine: Wine;
  bottles: Bottle[];
  quantity: number;
  cellarIds: string[];
  lastAddedAt: Date;
  state: DrinkingState;
}

export type StyleFilter = 'all' | WineStyle;
export type SortKey = 'name' | 'vintage' | 'recent';

export interface InventoryFilters {
  query: string;
  style: StyleFilter;
  readyOnly: boolean;
}

export const sortLabels: Record<SortKey, string> = {
  name: 'Name',
  vintage: 'Vintage',
  recent: 'Recently added',
};

/** Groups in-cellar bottles by wine. */
export function groupInventory(bottles: Bottle[], wines: Wine[], now: Date): InventoryItem[] {
  const byWine = new Map<string, Bottle[]>();
  for (const b of bottles) {
    if (b.status !== 'in_cellar') continue;
    byWine.set(b.wineId, [...(byWine.get(b.wineId) ?? []), b]);
  }
  const items: InventoryItem[] = [];
  for (const [wineId, list] of byWine) {
    const wine = wines.find((w) => w.id === wineId);
    if (!wine) continue;
    items.push({
      wine,
      bottles: list,
      quantity: list.length,
      cellarIds: [...new Set(list.map((b) => b.cellarId))],
      lastAddedAt: new Date(Math.max(...list.map((b) => b.addedAt.getTime()))),
      state: drinkingState(wine, now),
    });
  }
  return items;
}

/** Lowercase and strip accents so "rose" finds "Rosé" and "leoville" finds "Léoville". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Spec search fields: wine name, winery, region, vintage, grape variety (plus country). Every word must match. */
export function matchesQuery(wine: Wine, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(
    [wine.name, wine.producer, wine.region, wine.country, String(wine.vintage), wine.style, ...wine.grapes].join(' '),
  );
  return words.every((w) => haystack.includes(w));
}

export function filterInventory(items: InventoryItem[], f: InventoryFilters): InventoryItem[] {
  return items.filter(
    (i) =>
      (f.style === 'all' || i.wine.style === f.style) &&
      (!f.readyOnly || i.state === 'ready') &&
      matchesQuery(i.wine, f.query),
  );
}

export function sortInventory(items: InventoryItem[], key: SortKey): InventoryItem[] {
  const byName = (a: InventoryItem, b: InventoryItem) => a.wine.name.localeCompare(b.wine.name);
  const sorted = [...items];
  if (key === 'name') sorted.sort(byName);
  if (key === 'vintage') sorted.sort((a, b) => a.wine.vintage - b.wine.vintage || byName(a, b));
  if (key === 'recent') sorted.sort((a, b) => b.lastAddedAt.getTime() - a.lastAddedAt.getTime() || byName(a, b));
  return sorted;
}

export function describeDrinkingWindow(wine: Wine, now: Date): { label: string; state: DrinkingState } {
  const state = drinkingState(wine, now);
  const window = `${wine.drinkFrom}–${wine.drinkUntil}`;
  if (state === 'hold') return { state, label: `Hold until ${wine.drinkFrom} · ${window}` };
  if (state === 'past') return { state, label: `Past its window · ${window}` };
  return { state, label: `Ready to drink · ${window}` };
}

export interface HistoryEntry {
  bottle: Bottle;
  wine: Wine;
  cellar: Cellar | undefined;
}

/** Opened bottles grouped by month, newest first: [{ title: 'November 2026', entries }]. */
export function groupHistory(bottles: Bottle[], wines: Wine[], cellars: Cellar[]) {
  const entries: HistoryEntry[] = bottles
    .filter((b) => b.status === 'opened' && b.openedAt)
    .sort((a, b) => b.openedAt!.getTime() - a.openedAt!.getTime())
    .flatMap((bottle) => {
      const wine = wines.find((w) => w.id === bottle.wineId);
      return wine ? [{ bottle, wine, cellar: cellars.find((c) => c.id === bottle.cellarId) }] : [];
    });
  const sections: { title: string; entries: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const title = e.bottle.openedAt!.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const last = sections[sections.length - 1];
    if (last?.title === title) last.entries.push(e);
    else sections.push({ title, entries: [e] });
  }
  return sections;
}
