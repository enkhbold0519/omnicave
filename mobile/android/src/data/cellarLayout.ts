/**
 * Physical cellar layouts, as configuration. Each Cellar names its layout by `layoutId`, so two units can
 * share a model or differ without any UI change. The map renders whatever is configured here.
 *
 * LG SIGNATURE Wine Cellar: LG publishes the capacity (65) and three temperature zones; the exact rack
 * arrangement isn't published, so 13 shelves × 5 positions is our assumption.
 */
import type { CellarLayout, StorageSlot, WineStyle, ZoneConfig, ZoneId } from './types';

export const LG_SIGNATURE_65: CellarLayout = {
  id: 'lg-signature-65',
  model: 'LG SIGNATURE Wine Cellar',
  shelves: 13,
  positionsPerShelf: 5,
  zones: [
    { id: 'sparkling', shelves: [1, 3], targetC: [5, 8] },
    { id: 'white', shelves: [4, 7], targetC: [5, 11] },
    { id: 'red', shelves: [8, 13], targetC: [11, 18] },
  ],
};

export const layouts: Record<string, CellarLayout> = {
  [LG_SIGNATURE_65.id]: LG_SIGNATURE_65,
};

export function layoutById(id: string): CellarLayout | null {
  return layouts[id] ?? null;
}

export const capacityOf = (layout: CellarLayout) => layout.shelves * layout.positionsPerShelf;

export const zoneLabels: Record<ZoneId, string> = {
  sparkling: 'Sparkling zone',
  white: 'White zone',
  red: 'Red zone',
};

export function zoneForShelf(layout: CellarLayout, shelf: number): ZoneConfig {
  const zone = layout.zones.find((z) => shelf >= z.shelves[0] && shelf <= z.shelves[1]);
  if (!zone) throw new Error(`Shelf ${shelf} is outside layout ${layout.id}`);
  return zone;
}

/** Where a style belongs: sparkling cold, whites/rosé/dessert cool, reds warmest. */
export function zoneForStyle(style: WineStyle): ZoneId {
  if (style === 'Sparkling') return 'sparkling';
  if (style === 'Red') return 'red';
  return 'white';
}

/** Stable, readable slot ID, e.g. "cellar-signature:s09-p3". Same inputs always give the same ID. */
export function slotIdFor(cellarId: string, shelf: number, position: number): string {
  return `${cellarId}:s${String(shelf).padStart(2, '0')}-p${position}`;
}

/** Every slot of a cellar, top shelf first, left to right. */
export function buildSlots(cellarId: string, layout: CellarLayout): StorageSlot[] {
  const slots: StorageSlot[] = [];
  for (let shelf = 1; shelf <= layout.shelves; shelf++) {
    const zoneId = zoneForShelf(layout, shelf).id;
    for (let position = 1; position <= layout.positionsPerShelf; position++) {
      slots.push({ id: slotIdFor(cellarId, shelf, position), cellarId, zoneId, shelf, position });
    }
  }
  return slots;
}

export function formatSlot(slot: Pick<StorageSlot, 'zoneId' | 'shelf' | 'position'>): string {
  return `${zoneLabels[slot.zoneId]} · Shelf ${slot.shelf}, position ${slot.position}`;
}

export const formatTarget = ([lo, hi]: [number, number]) => `${lo}–${hi} °C`;
