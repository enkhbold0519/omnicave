import { layoutById, zoneForStyle } from './cellarLayout';
import { addWine, getBottles, getCellars, getDetections, getSlots, getWines, removeDetection, updateBottles, updateWine } from './cellarStore';
import { getDevScenario, type DevScenario } from './devScenario';
import { readEnvironment } from './mockEnvironment';
import type { Bottle, CellarMapData, DetectedBottle, NewBottleInput, Wine, CellarScope, InventoryData, InventoryRepository, WineDetails } from './types';

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
    const slot = getSlots().find((s) => s.id === slotId);
    if (!slot || slot.cellarId !== cellarId) throw new Error("That position isn't part of this cellar.");
    const taken = getBottles().some((b) => b.status === 'in_cellar' && b.slotId === slotId && b.id !== except);
    if (taken) throw new Error('That position is already taken.');
  };

  /** Validation shared by Add and Edit Bottle; returns the cleaned-up text fields. */
  const checkBottleInput = (cellarId: string, input: NewBottleInput['wine']) => {
    const name = input.name.trim();
    const producer = input.producer.trim();
    const grapes = input.grapes.map((g) => g.trim()).filter(Boolean);
    if (!name || !producer || !input.region.trim() || !input.country.trim() || grapes.length === 0) throw new Error('Fill in every field.');
    const year = now().getFullYear();
    if (!Number.isInteger(input.vintage) || input.vintage < 1900 || input.vintage > year) throw new Error(`Vintage must be between 1900 and ${year}.`);
    if (!getCellars().some((c) => c.id === cellarId)) throw new Error('Unknown cellar.');
    return { name, producer, grapes };
  };

  const patch = (bottleId: string, change: Partial<Bottle>) =>
    updateBottles((all) => all.map((b) => (b.id === bottleId ? { ...b, ...change } : b)));

async function createBottle({ cellarId, slotId, wine: input }: NewBottleInput): Promise<Bottle> {
    await prepareChange();
    const { name, producer, grapes } = checkBottleInput(cellarId, input);
    if (slotId) assertFreeSlot(cellarId, slotId);

    const same = (w: Wine) => w.name.toLowerCase() === name.toLowerCase() && w.producer.toLowerCase() === producer.toLowerCase() && w.vintage === input.vintage;
    let wine = getWines().find(same);
    if (!wine) {
      // No drinking-window data for a manual entry yet; a simple estimate until label/AI data provides one.
      wine = {
        id: `wine-new-${Date.now().toString(36)}-${++newId}`,
        name,
        producer,
        vintage: input.vintage,
        style: input.style,
        region: input.region.trim(),
        country: input.country.trim(),
        grapes,
        drinkFrom: input.vintage + 2,
        drinkUntil: input.vintage + 12,
        note: 'Added manually.',
      };
      addWine(wine);
    }
    const bottle: Bottle = {
      id: `btl-new-${Date.now().toString(36)}-${++newId}`,
      cellarId,
      wineId: wine.id,
      status: 'in_cellar',
      slotId,
      placement: { source: 'manual' },
      addedAt: now(),
    };
    updateBottles((all) => [...all, bottle]);
    return bottle;
  }

  /** Mock "where the camera saw it": the first free position in the zone for the wine's style. */
  const detectedSlot = (d: DetectedBottle, claimed: Set<string>) => {
    const used = new Set(getBottles().filter((b) => b.status === 'in_cellar').flatMap((b) => (b.slotId ? [b.slotId] : [])));
    return getSlots().find((x) => x.cellarId === d.cellarId && x.zoneId === zoneForStyle(d.wine.style) && !used.has(x.id) && !claimed.has(x.id))?.id ?? null;
  };

  return {
    async listInventory(scope): Promise<InventoryData> {
      const bottles = await prepare();
      return {
        bottles: bottles.filter((b) => b.status === 'in_cellar' && inScope(scope)(b.cellarId)),
        wines: getWines(),
        cellars: getCellars(),
      };
    },

    async listHistory(scope): Promise<InventoryData> {
      const bottles = await prepare();
      return {
        bottles: bottles.filter((b) => b.status === 'opened' && inScope(scope)(b.cellarId)),
        wines: getWines(),
        cellars: getCellars(),
      };
    },

    async getWineDetails(wineId): Promise<WineDetails | null> {
      const bottles = await prepare();
      const wine = getWines().find((w) => w.id === wineId);
      if (!wine) return null;
      const withCellar = (status: 'in_cellar' | 'opened') =>
        bottles
          .filter((b) => b.wineId === wineId && b.status === status)
          .flatMap((bottle) => {
            const cellar = getCellars().find((c) => c.id === bottle.cellarId);
            const slot = getSlots().find((s) => s.id === bottle.slotId) ?? null;
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
      const cellar = getCellars().find((c) => c.id === cellarId);
      if (!cellar) return null;
      return {
        cellar,
        layout: layoutById(cellar.layoutId),
        slots: getSlots().filter((s) => s.cellarId === cellarId),
        bottles: bottles.filter((b) => b.status === 'in_cellar' && b.cellarId === cellarId),
        wines: getWines(),
        environment: readEnvironment(cellarId, scenario(), now()),
      };
    },

    createBottle,

    async listDetections(): Promise<DetectedBottle[]> {
      await prepare();
      const claimed = new Set<string>();
      return getDetections().map((d) => {
        const slotId = d.slotId ?? detectedSlot(d, claimed);
        if (slotId) claimed.add(slotId);
        return { ...d, slotId };
      });
    },

    async confirmDetection(detectionId, input): Promise<Bottle> {
      if (!getDetections().some((d) => d.id === detectionId)) throw new Error('That detection was already handled.');
      const bottle = await createBottle(input);
      removeDetection(detectionId);
      return bottle;
    },

    async dismissDetection(detectionId): Promise<void> {
      await prepareChange();
      removeDetection(detectionId);
    },

    async updateBottle(bottleId, { cellarId, slotId, wine: input }: NewBottleInput): Promise<void> {
      await prepareChange();
      const bottle = findInCellar(bottleId);
      const { name, producer, grapes } = checkBottleInput(cellarId, input);
      if (slotId) assertFreeSlot(cellarId, slotId, bottleId);
      updateWine(bottle.wineId, { name, producer, grapes, vintage: input.vintage, style: input.style, region: input.region.trim(), country: input.country.trim() });
      const moved = cellarId !== bottle.cellarId || slotId !== bottle.slotId;
      patch(bottleId, moved ? { cellarId, slotId, placement: { source: 'manual' } } : {});
    },

    async addBottle({ cellarId, wineId, slotId }): Promise<Bottle> {
      await prepareChange();
      if (!getWines().some((w) => w.id === wineId)) throw new Error('Unknown wine.');
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
