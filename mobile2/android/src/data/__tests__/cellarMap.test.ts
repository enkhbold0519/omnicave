import { describe, expect, it } from '@jest/globals';

import { LG_SIGNATURE_65, buildSlots, layoutById, slotIdFor } from '../cellarLayout';
import { allCells, buildCellarMap, locateBottle } from '../cellarMap';
import { cellars, slots, wines } from '../mockDb';
import { createMockInventoryRepository } from '../mockInventoryRepository';
import type { Bottle, CellarLayout, CellarMapData } from '../types';

const repo = (scenario: 'normal' | 'emptyInventory' = 'normal') => createMockInventoryRepository({ latencyMs: 0, scenario: () => scenario });

async function mapFor(cellarId: string, scenario: 'normal' | 'emptyInventory' = 'normal') {
  const data = (await repo(scenario).getCellarMap(cellarId))!;
  return { data, map: buildCellarMap({ ...data, layout: data.layout! }) };
}

describe('layout configuration', () => {
  it('gives every cellar its configured layout with stable, unique slot IDs', () => {
    for (const c of cellars) {
      const layout = layoutById(c.layoutId)!;
      expect(layout).toBe(LG_SIGNATURE_65);
      const own = slots.filter((s) => s.cellarId === c.id);
      expect(own).toHaveLength(65);
      expect(new Set(own.map((s) => s.id)).size).toBe(65);
    }
    expect(buildSlots('x', LG_SIGNATURE_65).map((s) => s.id)).toEqual(buildSlots('x', LG_SIGNATURE_65).map((s) => s.id));
    expect(slotIdFor('cellar-signature', 9, 3)).toBe('cellar-signature:s09-p3');
  });

  it('draws whatever the layout says, not a fixed grid', () => {
    const small: CellarLayout = { id: 'test-2x3', model: 'Test', shelves: 2, positionsPerShelf: 3, zones: [{ id: 'red', shelves: [1, 2], targetC: [12, 16] }] };
    const map = buildCellarMap({ cellar: cellars[0], layout: small, slots: buildSlots('t', small), bottles: [], wines, environment: null });
    expect(map.zones).toHaveLength(1);
    expect(map.zones[0].shelves.map((s) => s.cells.length)).toEqual([3, 3]);
    expect(map.capacity).toBe(6);
  });
});

describe('cellar map', () => {
  it.each(cellars.map((c) => [c.name, c.id]))('%s: occupancy matches Inventory', async (_n, cellarId) => {
    const { map } = await mapFor(cellarId);
    const inventory = await repo().listInventory(cellarId);
    const onMap = allCells(map).flatMap((c) => (c.bottle ? [c.bottle.id] : []));
    const unplaced = map.unplaced.map((u) => u.bottle.id);
    expect([...onMap, ...unplaced].sort()).toEqual(inventory.bottles.map((b) => b.id).sort());
    expect(map.occupied + map.unplaced.length).toBe(inventory.bottles.length);
    expect(allCells(map)).toHaveLength(65);
    expect(allCells(map).filter((c) => !c.bottle)).toHaveLength(65 - map.occupied);
  });

  it('keeps each cellar independent when switching', async () => {
    const a = await mapFor('cellar-signature');
    const b = await mapFor('cellar-reserve');
    expect(allCells(a.map).every((c) => c.slot.cellarId === 'cellar-signature')).toBe(true);
    expect(allCells(b.map).every((c) => c.slot.cellarId === 'cellar-reserve')).toBe(true);
    expect(a.map.occupied).not.toBe(b.map.occupied);
  });

  it('shows the right wine in each slot', async () => {
    const { data, map } = await mapFor('cellar-signature');
    for (const cell of allCells(map)) {
      if (!cell.bottle) continue;
      expect(cell.bottle.slotId).toBe(cell.slot.id);
      expect(cell.wine?.id).toBe(cell.bottle.wineId);
    }
    expect(data.bottles.some((b) => b.slotId === null)).toBe(true);
  });

  it('shows every slot empty for an empty cellar', async () => {
    const { map } = await mapFor('cellar-signature', 'emptyInventory');
    expect(map.occupied).toBe(0);
    expect(allCells(map).every((c) => c.bottle === null)).toBe(true);
  });

  it('treats unknown or doubled-up slot IDs as unplaced instead of drawing them twice', () => {
    const own = slots.filter((s) => s.cellarId === 'cellar-signature');
    const bottle = (id: string, slotId: string | null): Bottle => ({ id, cellarId: 'cellar-signature', wineId: 'wine-barolo-2019', status: 'in_cellar', slotId, addedAt: new Date() });
    const data: CellarMapData = {
      cellar: cellars[0],
      layout: LG_SIGNATURE_65,
      slots: own,
      bottles: [bottle('a', own[50].id), bottle('b', own[50].id), bottle('c', 'nowhere'), bottle('d', null)],
      wines,
      environment: null,
    };
    const map = buildCellarMap({ ...data, layout: LG_SIGNATURE_65 });
    expect(map.occupied).toBe(1);
    expect(map.unplaced.map((u) => u.bottle.id)).toEqual(['b', 'c', 'd']);
  });

  it('flags a bottle stored outside the zone for its style', () => {
    const own = slots.filter((s) => s.cellarId === 'cellar-signature');
    const top = own.find((s) => s.zoneId === 'sparkling')!;
    const red: Bottle = { id: 'r', cellarId: 'cellar-signature', wineId: 'wine-barolo-2019', status: 'in_cellar', slotId: top.id, addedAt: new Date() };
    const map = buildCellarMap({ cellar: cellars[0], layout: LG_SIGNATURE_65, slots: own, bottles: [red], wines, environment: null });
    expect(allCells(map).find((c) => c.slot.id === top.id)?.outOfZone).toBe(true);
  });
});

describe('Find Location', () => {
  it('finds the exact slot of a placed bottle', async () => {
    const { data, map } = await mapFor('cellar-signature');
    const target = data.bottles.find((b) => b.slotId)!;
    const loc = locateBottle(map, target.id);
    expect(loc.kind).toBe('placed');
    if (loc.kind === 'placed') expect(loc.cell.slot.id).toBe(target.slotId);
  });

  it('reports unplaced bottles and bottles from another cellar as unavailable', async () => {
    const { data, map } = await mapFor('cellar-signature');
    const unplaced = data.bottles.find((b) => b.slotId === null)!;
    expect(locateBottle(map, unplaced.id).kind).toBe('unplaced');
    const reserve = (await repo().listInventory('cellar-reserve')).bottles[0];
    expect(locateBottle(map, reserve.id).kind).toBe('notInCellar');
  });

  it('returns null for an unknown cellar', async () => {
    expect(await repo().getCellarMap('nope')).toBeNull();
  });
});
