import { afterEach, describe, expect, it } from '@jest/globals';

import { allCells, buildCellarMap, isUncertain, searchMap, summarizeOccupancy, zoneReading } from '../cellarMap';
import { getBottles, getDataVersion, resetCellarStore } from '../cellarStore';
import type { DevScenario } from '../devScenario';
import { LG_SIGNATURE_65 } from '../cellarLayout';
import { createMockHomeRepository } from '../mockHomeRepository';
import { createMockInventoryRepository } from '../mockInventoryRepository';
import type { EnvironmentReading } from '../types';

const now = new Date('2026-11-05T12:00:00Z');
const inv = (scenario: DevScenario = 'normal') => createMockInventoryRepository({ latencyMs: 0, scenario: () => scenario, now: () => now });
const home = () => createMockHomeRepository({ latencyMs: 0, scenario: () => 'normal' });
const SIG = 'cellar-signature';

async function mapOf(cellarId = SIG) {
  const data = (await inv().getCellarMap(cellarId))!;
  return buildCellarMap({ ...data, layout: data.layout! });
}
const firstEmpty = async (cellarId = SIG) => allCells(await mapOf(cellarId)).find((c) => !c.bottle)!;
const firstFull = async (cellarId = SIG) => allCells(await mapOf(cellarId)).find((c) => c.bottle && !c.uncertain)!;

/** Home's bottle count, Inventory's list and the map's occupancy, for one cellar. */
async function views(cellarId = SIG) {
  const [snapshot, list, mapData] = await Promise.all([
    home().getHomeSnapshot(cellarId, now),
    inv().listInventory(cellarId),
    inv().getCellarMap(cellarId),
  ]);
  const map = buildCellarMap({ ...mapData!, layout: mapData!.layout! });
  return { home: snapshot.bottleCount, inventory: list.bottles.length, placed: map.occupied, unplaced: map.unplaced.length };
}

afterEach(() => resetCellarStore());

describe('one shared store: Home, Inventory and the map stay consistent', () => {
  it('agree before any change', async () => {
    const v = await views();
    expect(v.home).toBe(48);
    expect(v.inventory).toBe(48);
    expect(v.placed + v.unplaced).toBe(48);
  });

  it('adding a bottle to an empty position shows up everywhere', async () => {
    const slot = (await firstEmpty()).slot;
    const before = await views();
    const v0 = getDataVersion();
    const bottle = await inv().addBottle({ cellarId: SIG, wineId: 'wine-chablis-2021', slotId: slot.id });
    expect(getDataVersion()).toBeGreaterThan(v0);
    const after = await views();
    expect(after.home).toBe(before.home + 1);
    expect(after.inventory).toBe(before.inventory + 1);
    expect(after.placed).toBe(before.placed + 1);
    expect(allCells(await mapOf()).find((c) => c.slot.id === slot.id)?.bottle?.id).toBe(bottle.id);
  });

  it('opening a bottle frees its position and moves it to History', async () => {
    const cell = await firstFull();
    const before = await views();
    await inv().openBottle(cell.bottle!.id);
    const after = await views();
    expect(after.home).toBe(before.home - 1);
    expect(after.inventory).toBe(before.inventory - 1);
    expect(after.placed).toBe(before.placed - 1);
    expect(allCells(await mapOf()).find((c) => c.slot.id === cell.slot.id)?.bottle).toBeNull();
    const history = await inv().listHistory(SIG);
    expect(history.bottles.some((b) => b.id === cell.bottle!.id && b.openedAt?.getTime() === now.getTime())).toBe(true);
  });

  it('removing an unopened bottle frees its position without adding to History', async () => {
    const cell = await firstFull();
    const historyBefore = (await inv().listHistory(SIG)).bottles.length;
    await inv().removeBottle(cell.bottle!.id);
    expect((await views()).inventory).toBe(47);
    expect((await inv().listHistory(SIG)).bottles.length).toBe(historyBefore);
  });

  it('moving a bottle changes its position everywhere and keeps the counts', async () => {
    const from = await firstFull();
    const to = (await firstEmpty()).slot;
    const before = await views();
    await inv().moveBottle(from.bottle!.id, to.id);
    expect(await views()).toEqual(before);
    const cells = allCells(await mapOf());
    expect(cells.find((c) => c.slot.id === from.slot.id)?.bottle).toBeNull();
    expect(cells.find((c) => c.slot.id === to.id)?.bottle?.id).toBe(from.bottle!.id);
    const details = await inv().getWineDetails(from.bottle!.wineId);
    expect(details?.inCellar.find((x) => x.bottle.id === from.bottle!.id)?.slot?.id).toBe(to.id);
  });

  it('placing an unplaced bottle moves it onto the map', async () => {
    const before = await views();
    const unplaced = (await mapOf()).unplaced[0].bottle;
    await inv().moveBottle(unplaced.id, (await firstEmpty()).slot.id);
    const after = await views();
    expect(after.unplaced).toBe(before.unplaced - 1);
    expect(after.placed).toBe(before.placed + 1);
    expect(after.inventory).toBe(before.inventory);
  });

  it('keeps Inventory slot usage and the map on the same calculation', async () => {
    const data = (await inv().getCellarMap(SIG))!;
    const map = await mapOf();
    expect(summarizeOccupancy(data)).toEqual({ occupied: map.occupied, capacity: 65 });
  });
});

describe('manual registration (Add Bottle)', () => {
  const details = { name: 'Etna Rosso', producer: 'Benanti', vintage: 2021, style: 'Red' as const, region: 'Sicily', country: 'Italy', grapes: ['Nerello Mascalese', ' '] };

  it('adds a new wine and bottle at the chosen position, visible everywhere', async () => {
    const slot = (await firstEmpty()).slot;
    const before = await views();
    const bottle = await inv().createBottle({ cellarId: SIG, slotId: slot.id, wine: details });
    const after = await views();
    expect(after.inventory).toBe(before.inventory + 1);
    expect(after.home).toBe(before.home + 1);
    expect(allCells(await mapOf()).find((c) => c.slot.id === slot.id)?.bottle?.id).toBe(bottle.id);
    const wine = await inv().getWineDetails(bottle.wineId);
    expect(wine?.wine).toMatchObject({ name: 'Etna Rosso', grapes: ['Nerello Mascalese'] });
  });

  it('reuses the catalog wine for the same name, winery and vintage, and allows no position', async () => {
    const a = await inv().createBottle({ cellarId: SIG, slotId: null, wine: details });
    const b = await inv().createBottle({ cellarId: SIG, slotId: null, wine: { ...details, name: 'etna rosso' } });
    expect(b.wineId).toBe(a.wineId);
    expect((await inv().getWineDetails(a.wineId))?.inCellar).toHaveLength(2);
  });

  it('rejects missing fields, impossible vintages and taken positions', async () => {
    await expect(inv().createBottle({ cellarId: SIG, slotId: null, wine: { ...details, name: ' ' } })).rejects.toThrow('every field');
    await expect(inv().createBottle({ cellarId: SIG, slotId: null, wine: { ...details, vintage: 2099 } })).rejects.toThrow('Vintage');
    const taken = (await firstFull()).slot.id;
    await expect(inv().createBottle({ cellarId: SIG, slotId: taken, wine: details })).rejects.toThrow('already taken');
  });
});

describe('manual modification (Edit Bottle)', () => {
  it('updates the wine details and moves the bottle, visible everywhere', async () => {
    const cell = await firstFull();
    const to = (await firstEmpty()).slot;
    const details = (await inv().getWineDetails(cell.bottle!.wineId))!.wine;
    const before = await views();
    await inv().updateBottle(cell.bottle!.id, { cellarId: SIG, slotId: to.id, wine: { ...details, region: 'Edited region' } });
    expect(await views()).toEqual(before);
    const after = await inv().getWineDetails(cell.bottle!.wineId);
    expect(after?.wine.region).toBe('Edited region');
    expect(after?.inCellar.find((x) => x.bottle.id === cell.bottle!.id)?.slot?.id).toBe(to.id);
  });

  it('keeps its own position when only the details change, and rejects a taken one', async () => {
    const [a, b] = allCells(await mapOf()).filter((c) => c.bottle && !c.uncertain);
    const w = (await inv().getWineDetails(a.bottle!.wineId))!.wine;
    await inv().updateBottle(a.bottle!.id, { cellarId: SIG, slotId: a.slot.id, wine: w });
    await expect(inv().updateBottle(a.bottle!.id, { cellarId: SIG, slotId: b.slot.id, wine: w })).rejects.toThrow('already taken');
  });
});

describe('review and correct (camera detections)', () => {
  it('lists detections with a free position in the right zone', async () => {
    const list = await inv().listDetections();
    expect(list).toHaveLength(2);
    const occupied = new Set(allCells(await mapOf()).filter((c) => c.bottle).map((c) => c.slot.id));
    expect(list.every((d) => d.slotId && !occupied.has(d.slotId))).toBe(true);
    expect(new Set(list.map((d) => d.slotId)).size).toBe(2);
  });

  it('registers a corrected detection and removes it from the queue', async () => {
    const [d] = await inv().listDetections();
    const before = await views();
    const bottle = await inv().confirmDetection(d.id, { cellarId: d.cellarId, slotId: d.slotId, wine: { ...d.wine, vintage: 2018 } });
    expect((await views()).inventory).toBe(before.inventory + 1);
    expect((await inv().getWineDetails(bottle.wineId))?.wine.vintage).toBe(2018);
    expect((await inv().listDetections()).map((x) => x.id)).not.toContain(d.id);
    await expect(inv().confirmDetection(d.id, { cellarId: d.cellarId, slotId: null, wine: d.wine })).rejects.toThrow('already handled');
  });

  it('dismisses a detection without adding anything', async () => {
    const [, d] = await inv().listDetections();
    const before = await views();
    await inv().dismissDetection(d.id);
    expect(await views()).toEqual(before);
    expect(await inv().listDetections()).toHaveLength(1);
  });
});

describe('changes are validated', () => {
  it('rejects a taken position, a position in another cellar, and a bottle that has left', async () => {
    const taken = (await firstFull()).slot.id;
    const reserveSlot = (await firstEmpty('cellar-reserve')).slot.id;
    await expect(inv().addBottle({ cellarId: SIG, wineId: 'wine-chablis-2021', slotId: taken })).rejects.toThrow('already taken');
    const bottle = (await firstFull()).bottle!;
    await expect(inv().moveBottle(bottle.id, reserveSlot)).rejects.toThrow("isn't part of this cellar");
    await inv().openBottle(bottle.id);
    await expect(inv().openBottle(bottle.id)).rejects.toThrow('no longer in the cellar');
  });

  it('fails changes in the load-failure scenario without touching data', async () => {
    const before = getBottles();
    await expect(inv('loadFailure').addBottle({ cellarId: SIG, wineId: 'wine-chablis-2021', slotId: (await firstEmpty()).slot.id })).rejects.toThrow();
    expect(getBottles()).toBe(before);
  });
});

describe('uncertain sensor positions', () => {
  it('marks low-confidence sensor placements, and confirming or moving clears them', async () => {
    const map = await mapOf();
    const uncertain = allCells(map).filter((c) => c.uncertain);
    expect(uncertain.length).toBe(map.uncertainCount);
    expect(uncertain.length).toBeGreaterThan(0);
    expect(uncertain.every((c) => c.bottle!.placement?.source === 'sensor')).toBe(true);

    await inv().confirmPosition(uncertain[0].bottle!.id);
    if (uncertain[1]) await inv().moveBottle(uncertain[1].bottle!.id, (await firstEmpty()).slot.id);
    const after = await mapOf();
    expect(after.uncertainCount).toBe(map.uncertainCount - Math.min(2, uncertain.length));
  });

  it('treats confident sensor placements and manual entries as certain', () => {
    const b = { id: 'x', cellarId: SIG, wineId: 'w', status: 'in_cellar' as const, slotId: 's', addedAt: now };
    expect(isUncertain({ ...b, placement: { source: 'sensor', confidence: 0.95 } })).toBe(false);
    expect(isUncertain({ ...b, placement: { source: 'manual' } })).toBe(false);
    expect(isUncertain({ ...b })).toBe(false);
    expect(isUncertain({ ...b, placement: { source: 'sensor', confidence: 0.4 } })).toBe(true);
  });
});

describe('map search', () => {
  it('finds matching placed bottles top to bottom and reports unplaced matches', async () => {
    const map = await mapOf();
    const barolo = searchMap(map, 'barolo');
    expect(barolo.cells.length).toBe(4);
    expect(barolo.cells.every((c) => c.wine?.id === 'wine-barolo-2019')).toBe(true);
    const order = barolo.cells.map((c) => c.slot.shelf * 10 + c.slot.position);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(searchMap(map, 'brut').unplaced).toHaveLength(1);
    expect(searchMap(map, 'zzz').cells).toHaveLength(0);
    expect(searchMap(map, '  ').cells).toHaveLength(0);
  });
});

describe('zone readings vs targets', () => {
  const zone = LG_SIGNATURE_65.zones[1]; // white, 5–11 °C
  const env = (o: Partial<EnvironmentReading> = {}): EnvironmentReading => ({
    temperatureC: 12,
    humidityPct: 65,
    connection: 'online',
    sensor: 'ok',
    recordedAt: new Date(now.getTime() - 60_000),
    zoneTemperaturesC: { white: 9.8 },
    ...o,
  });

  it('keeps the actual reading separate from the configured target', () => {
    expect(zoneReading(zone, env(), now)).toMatchObject({ kind: 'live', temperatureC: 9.8, inRange: true });
    expect(zoneReading(zone, env({ zoneTemperaturesC: { white: 11.8 } }), now)).toMatchObject({ inRange: false });
  });

  it('marks stale and offline readings, and missing ones', () => {
    expect(zoneReading(zone, env({ recordedAt: new Date(now.getTime() - 3_600_000) }), now).kind).toBe('stale');
    expect(zoneReading(zone, env({ connection: 'offline' }), now).kind).toBe('stale');
    expect(zoneReading(zone, env({ zoneTemperaturesC: {} }), now).kind).toBe('none');
    expect(zoneReading(zone, null, now).kind).toBe('none');
  });

  it('comes from the cellar map data, following the sensor-offline scenario', async () => {
    const live = (await inv().getCellarMap('cellar-reserve'))!;
    expect(live.environment?.zoneTemperaturesC?.white).toBe(11.8);
    const offline = (await inv('sensorDisconnected').getCellarMap(SIG))!;
    expect(offline.environment?.connection).toBe('offline');
  });
});
