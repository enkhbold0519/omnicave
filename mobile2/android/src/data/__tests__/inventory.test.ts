import { describe, expect, it } from '@jest/globals';

import { LG_SIGNATURE_65, capacityOf, formatSlot, zoneForStyle } from '../cellarLayout';
import { filterInventory, groupHistory, groupInventory, matchesQuery, normalize, sortInventory } from '../inventory';
import { bottles, cellars, slots, wines } from '../mockDb';
import { createMockInventoryRepository } from '../mockInventoryRepository';

const now = new Date(2026, 10, 5, 20, 0);
const wine = (id: string) => wines.find((w) => w.id === id)!;

describe('cellar layout (LG SIGNATURE, 65 bottles)', () => {
  it('has 65 slots split into three zones', () => {
    expect(capacityOf(LG_SIGNATURE_65)).toBe(65);
    expect(LG_SIGNATURE_65.zones.map((z) => z.id)).toEqual(['sparkling', 'white', 'red']);
    expect(formatSlot({ zoneId: 'red', shelf: 9, position: 2 })).toBe('Red zone · Shelf 9, position 2');
  });
});

describe('mock bottles', () => {
  it('gives every bottle a unique ID', () => {
    expect(new Set(bottles.map((b) => b.id)).size).toBe(bottles.length);
  });

  it.each(cellars.map((c) => [c.name, c.id]))('%s: no two bottles share a slot, and it fits 65', (_n, cellarId) => {
    const inCellar = bottles.filter((b) => b.cellarId === cellarId && b.status === 'in_cellar');
    const used = inCellar.flatMap((b) => (b.slotId ? [b.slotId] : []));
    expect(new Set(used).size).toBe(used.length);
    expect(inCellar.length).toBeLessThanOrEqual(65);
  });

  it("stores each placed bottle in its own cellar's slot, in the zone for its style; opened bottles have no slot", () => {
    for (const b of bottles) {
      if (b.status === 'opened') {
        expect(b.slotId).toBeNull();
        continue;
      }
      if (!b.slotId) continue; // not placed yet
      const slot = slots.find((s) => s.id === b.slotId)!;
      expect(slot.cellarId).toBe(b.cellarId);
      expect(slot.zoneId).toBe(zoneForStyle(wine(b.wineId).style));
    }
  });
});

describe('search', () => {
  it('matches name, winery, region, vintage and grape, ignoring accents and case', () => {
    expect(matchesQuery(wine('wine-leoville-2015'), 'leoville')).toBe(true);
    expect(matchesQuery(wine('wine-bandol-2023'), 'rose')).toBe(true);
    expect(matchesQuery(wine('wine-barolo-2019'), 'vajra')).toBe(true);
    expect(matchesQuery(wine('wine-barolo-2019'), 'piedmont 2019')).toBe(true);
    expect(matchesQuery(wine('wine-barolo-2019'), 'nebbiolo')).toBe(true);
    expect(matchesQuery(wine('wine-barolo-2019'), 'burgundy')).toBe(false);
    expect(normalize('  Grüner  ')).toBe('gruner');
  });
});

describe('inventory grouping, filters and sorting', () => {
  const signature = bottles.filter((b) => b.cellarId === 'cellar-signature');
  const items = groupInventory(signature, wines, now);

  it('groups bottles by wine and ignores opened bottles', () => {
    expect(items.reduce((n, i) => n + i.quantity, 0)).toBe(48);
    expect(items.find((i) => i.wine.id === 'wine-leoville-2015')?.quantity).toBe(6);
  });

  it('filters by style and readiness', () => {
    const sparkling = filterInventory(items, { query: '', style: 'Sparkling', readyOnly: false });
    expect(sparkling.every((i) => i.wine.style === 'Sparkling')).toBe(true);
    const ready = filterInventory(items, { query: '', style: 'all', readyOnly: true });
    expect(ready.some((i) => i.wine.id === 'wine-leoville-2015')).toBe(false); // on hold until 2027
  });

  it('sorts by name, vintage and recently added', () => {
    const byName = sortInventory(items, 'name').map((i) => i.wine.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    const byVintage = sortInventory(items, 'vintage').map((i) => i.wine.vintage);
    expect(byVintage).toEqual([...byVintage].sort((a, b) => a - b));
    expect(sortInventory(items, 'recent')[0].wine.id).toBe('wine-brut-2018'); // added 3 days ago
  });
});

describe('history', () => {
  it('lists opened bottles newest first, grouped by month', () => {
    const sections = groupHistory(bottles, wines, cellars);
    const entries = sections.flatMap((s) => s.entries);
    expect(entries.length).toBe(bottles.filter((b) => b.status === 'opened').length);
    const times = entries.map((e) => e.bottle.openedAt!.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe('mock inventory repository', () => {
  const repo = (scenario: 'normal' | 'loadFailure' | 'emptyInventory') =>
    createMockInventoryRepository({ latencyMs: 0, scenario: () => scenario });

  it('scopes to one cellar or all cellars', async () => {
    const one = await repo('normal').listInventory('cellar-reserve');
    const all = await repo('normal').listInventory('all');
    expect(one.bottles.length).toBe(21);
    expect(all.bottles.length).toBe(69);
    expect(all.bottles.every((b) => b.status === 'in_cellar')).toBe(true);
  });

  it('returns wine details with locations and history', async () => {
    const d = await repo('normal').getWineDetails('wine-barolo-2019');
    expect(d?.inCellar.length).toBe(5); // 4 in Signature + 1 in Reserve
    expect(d?.inCellar.every((x) => x.slot !== null && x.slot.id === x.bottle.slotId)).toBe(true);
    expect(d?.opened.length).toBe(1);
    expect(await repo('normal').getWineDetails('nope')).toBeNull();
  });

  it('honours load failure and empty inventory scenarios', async () => {
    await expect(repo('loadFailure').listInventory('all')).rejects.toThrow();
    expect((await repo('emptyInventory').listInventory('all')).bottles).toEqual([]);
  });
});
