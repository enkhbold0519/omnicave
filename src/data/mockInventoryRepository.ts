import { layoutById } from './cellarLayout';
import { getBottles, updateBottles } from './cellarStore';
import { getDevScenario, type DevScenario } from './devScenario';
import * as db from './mockDb';
import { readEnvironment } from './mockEnvironment';
import type { Bottle, CellarMapData, CellarScope, InventoryData, InventoryRepository, WineDetails } from './types';

interface MockOptions {
  latencyMs?: number;
  scenario?: () => DevScenario;
  now?: () => Date;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let newId = 0;

/**
 * Mock inventory backed by the shared cellar store; honours the same dev scenarios as Home
 * (load failure, empty inventory, sensor offline). Changes are validated the way a server would.
 */
export function createMockInventoryRepository({
  latencyMs = 400,
  scenario = getDevScenario,
  now = () => new Date(),
}: MockOptions = {}): InventoryRepository {
  const prepare = async () => {
    if (latencyMs) await delay(latencyMs);
    const active = scenario();
    if (active === 'loadFailure') throw new Error('Could not load your inventory. Check your connection and try again.');
    return active === 'emptyInventory' ? [] : getBottles();
  };

  /** Shorter wait, and the same failure as reads, so changes behave like real requests. */
  const prepareChange = async () => {
    if (latencyMs) await delay(latencyMs / 2);
    if (scenario() === 'loadFailure') throw new Error("Couldn't save the change. Check your connection and try again.");
  };

  const inScope = (scope: CellarScope) => (cellarId: string) => scope === 'all' || scope === cellarId;

  const findInCellar = (bottleId: string): Bottle => {
    const bottle = getBottles().find((b) => b.id === bottleId);
    if (!bottle || bottle.status !== 'in_cellar') throw new Error('That bottle is no longer in the cellar.');
    return bottle;
  };

  /** The slot must belong to the cellar and be free (ignoring `except`, the bottle being moved). */
  const assertFreeSlot = (cellarId: string, slotId: string, except?: string) => {
    const slot = db.slots.find((s) => s.id === slotId);
    if (!slot || slot.cellarId !== cellarId) throw new Error("That position isn't part of this cellar.");
    const taken = getBottles().some((b) => b.status === 'in_cellar' && b.slotId === slotId && b.id !== except);
    if (taken) throw new Error('That position is already taken.');
  };

  const patch = (bottleId: string, change: Partial<Bottle>) =>
    updateBottles((all) => all.map((b) => (b.id === bottleId ? { ...b, ...change } : b)));

  return {
    async listInventory(scope): Promise<InventoryData> {
      const bottles = await prepare();
      return {
        bottles: bottles.filter((b) => b.status === 'in_cellar' && inScope(scope)(b.cellarId)),
        wines: db.wines,
        cellars: db.cellars,
      };
    },

    async listHistory(scope): Promise<InventoryData> {
      const bottles = await prepare();
      return {
        bottles: bottles.filter((b) => b.status === 'opened' && inScope(scope)(b.cellarId)),
        wines: db.wines,
        cellars: db.cellars,
      };
    },

    async getWineDetails(wineId): Promise<WineDetails | null> {
      const bottles = await prepare();
      const wine = db.wines.find((w) => w.id === wineId);
      if (!wine) return null;
      const withCellar = (status: 'in_cellar' | 'opened') =>
        bottles
          .filter((b) => b.wineId === wineId && b.status === status)
          .flatMap((bottle) => {
            const cellar = db.cellars.find((c) => c.id === bottle.cellarId);
            const slot = db.slots.find((s) => s.id === bottle.slotId) ?? null;
            return cellar ? [{ bottle, cellar, slot }] : [];
          });
      return {
        wine,
        inCellar: withCellar('in_cellar').sort(
          (a, b) => a.cellar.name.localeCompare(b.cellar.name) || (a.slot?.id ?? '~').localeCompare(b.slot?.id ?? '~'),
        ),
        opened: withCellar('opened').sort((a, b) => (b.bottle.openedAt?.getTime() ?? 0) - (a.bottle.openedAt?.getTime() ?? 0)),
      };
    },

    async getCellarMap(cellarId): Promise<CellarMapData | null> {
      const bottles = await prepare();
      const cellar = db.cellars.find((c) => c.id === cellarId);
      if (!cellar) return null;
      return {
        cellar,
        layout: layoutById(cellar.layoutId),
        slots: db.slots.filter((s) => s.cellarId === cellarId),
        bottles: bottles.filter((b) => b.status === 'in_cellar' && b.cellarId === cellarId),
        wines: db.wines,
        environment: readEnvironment(cellarId, scenario(), now()),
      };
    },

    async addBottle({ cellarId, wineId, slotId }): Promise<Bottle> {
      await prepareChange();
      if (!db.wines.some((w) => w.id === wineId)) throw new Error('Unknown wine.');
      assertFreeSlot(cellarId, slotId);
      const bottle: Bottle = {
        id: `btl-new-${Date.now().toString(36)}-${++newId}`,
        cellarId,
        wineId,
        status: 'in_cellar',
        slotId,
        placement: { source: 'manual' },
        addedAt: now(),
      };
      updateBottles((all) => [...all, bottle]);
      return bottle;
    },

    async moveBottle(bottleId, slotId): Promise<void> {
      await prepareChange();
      const bottle = findInCellar(bottleId);
      assertFreeSlot(bottle.cellarId, slotId, bottleId);
      patch(bottleId, { slotId, placement: { source: 'manual' } });
    },

    async openBottle(bottleId): Promise<void> {
      await prepareChange();
      findInCellar(bottleId);
      patch(bottleId, { status: 'opened', slotId: null, openedAt: now() });
    },

    async removeBottle(bottleId): Promise<void> {
      await prepareChange();
      findInCellar(bottleId);
      patch(bottleId, { status: 'removed', slotId: null });
    },

    async confirmPosition(bottleId): Promise<void> {
      await prepareChange();
      const bottle = findInCellar(bottleId);
      if (!bottle.slotId) throw new Error("This bottle hasn't been placed yet.");
      patch(bottleId, { placement: { source: 'manual' } });
    },
  };
}

export const inventoryRepository: InventoryRepository = createMockInventoryRepository();
