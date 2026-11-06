/**
 * Turns a cellar's layout, slots and bottles into what the Cellar Map draws: zones → shelves → cells.
 * Pure functions, so occupancy can be tested against Inventory without rendering anything.
 */
import { capacityOf, zoneForStyle } from './cellarLayout';
import { isStale } from './derive';
import { matchesQuery } from './inventory';
import type { Bottle, CellarLayout, CellarMapData, EnvironmentReading, StorageSlot, Wine, ZoneConfig } from './types';

/** Sensor-detected positions below this confidence are shown as uncertain until confirmed. */
export const UNCERTAIN_BELOW = 0.8;

export function isUncertain(bottle: Bottle | null): boolean {
  return bottle?.placement?.source === 'sensor' && (bottle.placement.confidence ?? 0) < UNCERTAIN_BELOW;
}

export interface MapCell {
  slot: StorageSlot;
  bottle: Bottle | null;
  wine: Wine | null;
  /** The bottle's style belongs in a different zone (e.g. a red on a sparkling shelf). */
  outOfZone: boolean;
  /** Placed by the sensors with low confidence; it may really be in a neighbouring slot. */
  uncertain: boolean;
}

export interface MapShelf {
  shelf: number;
  cells: MapCell[];
}

export interface MapZone {
  zone: ZoneConfig;
  shelves: MapShelf[];
  occupied: number;
  capacity: number;
}

export interface UnplacedBottle {
  bottle: Bottle;
  wine: Wine | null;
}

export interface CellarMap {
  layout: CellarLayout;
  zones: MapZone[];
  occupied: number;
  capacity: number;
  /** In the cellar but without a usable slot: none recorded, an unknown slot ID, or a slot already taken. */
  unplaced: UnplacedBottle[];
  uncertainCount: number;
}

export function buildCellarMap(data: CellarMapData & { layout: CellarLayout }): CellarMap {
  const { layout } = data;
  const wineById = new Map(data.wines.map((w) => [w.id, w]));
  const slotById = new Map(data.slots.map((s) => [s.id, s]));

  const bottleBySlot = new Map<string, Bottle>();
  const unplaced: UnplacedBottle[] = [];
  for (const bottle of data.bottles) {
    const slot = bottle.slotId ? slotById.get(bottle.slotId) : undefined;
    if (!slot || bottleBySlot.has(slot.id)) {
      unplaced.push({ bottle, wine: wineById.get(bottle.wineId) ?? null });
      continue;
    }
    bottleBySlot.set(slot.id, bottle);
  }

  const cellFor = (slot: StorageSlot): MapCell => {
    const bottle = bottleBySlot.get(slot.id) ?? null;
    const wine = bottle ? (wineById.get(bottle.wineId) ?? null) : null;
    return {
      slot,
      bottle,
      wine,
      outOfZone: wine ? zoneForStyle(wine.style) !== slot.zoneId : false,
      uncertain: isUncertain(bottle),
    };
  };

  const zones: MapZone[] = layout.zones.map((zone) => {
    const shelves: MapShelf[] = [];
    for (let shelf = zone.shelves[0]; shelf <= zone.shelves[1]; shelf++) {
      const cells = data.slots
        .filter((s) => s.shelf === shelf)
        .sort((a, b) => a.position - b.position)
        .map(cellFor);
      shelves.push({ shelf, cells });
    }
    const all = shelves.flatMap((s) => s.cells);
    return { zone, shelves, occupied: all.filter((c) => c.bottle).length, capacity: all.length };
  });

  return {
    layout,
    zones,
    occupied: zones.reduce((n, z) => n + z.occupied, 0),
    capacity: capacityOf(layout),
    unplaced,
    uncertainCount: zones.reduce((n, z) => n + z.shelves.reduce((m, s) => m + s.cells.filter((c) => c.uncertain).length, 0), 0),
  };
}

export function allCells(map: CellarMap): MapCell[] {
  return map.zones.flatMap((z) => z.shelves.flatMap((s) => s.cells));
}

export type BottleLocation =
  | { kind: 'placed'; cell: MapCell }
  | { kind: 'unplaced'; entry: UnplacedBottle }
  | { kind: 'notInCellar' };

/** Where a bottle is on this cellar's map, for Find Location. */
export function locateBottle(map: CellarMap, bottleId: string): BottleLocation {
  const cell = allCells(map).find((c) => c.bottle?.id === bottleId);
  if (cell) return { kind: 'placed', cell };
  const entry = map.unplaced.find((u) => u.bottle.id === bottleId);
  if (entry) return { kind: 'unplaced', entry };
  return { kind: 'notInCellar' };
}

export interface MapSearch {
  /** Placed matches, top shelf first, left to right — the order ↑/↓ steps through. */
  cells: MapCell[];
  /** Matching bottles in the cellar without a slot, so they can't be shown on the map. */
  unplaced: UnplacedBottle[];
}

/** Bottles on this map whose wine matches the query (same matching as Inventory search). */
export function searchMap(map: CellarMap, query: string): MapSearch {
  if (!query.trim()) return { cells: [], unplaced: [] };
  return {
    cells: allCells(map).filter((c) => c.wine && matchesQuery(c.wine, query)),
    unplaced: map.unplaced.filter((u) => u.wine && matchesQuery(u.wine, query)),
  };
}

/** A zone's actual temperature, kept separate from its configured target. */
export type ZoneReading =
  | { kind: 'none' }
  | { kind: 'live' | 'stale'; temperatureC: number; inRange: boolean; recordedAt: Date };

export function zoneReading(zone: ZoneConfig, environment: EnvironmentReading | null, now: Date): ZoneReading {
  const t = environment?.zoneTemperaturesC?.[zone.id];
  if (!environment || t === undefined) return { kind: 'none' };
  return {
    kind: isStale(environment, now) ? 'stale' : 'live',
    temperatureC: t,
    inRange: t >= zone.targetC[0] && t <= zone.targetC[1],
    recordedAt: environment.recordedAt,
  };
}

/** Total capacity and placed bottles for a cellar — the one calculation Inventory and the map both use. */
export function summarizeOccupancy(data: CellarMapData): { occupied: number; capacity: number } | null {
  if (!data.layout) return null;
  const map = buildCellarMap({ ...data, layout: data.layout });
  return { occupied: map.occupied, capacity: map.capacity };
}
