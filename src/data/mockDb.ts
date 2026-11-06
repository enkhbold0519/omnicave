/**
 * Single source of truth for all mock CellarOS data.
 * Bottles are generated from a wine catalog plus per-cellar allocations, so every bottle has its own ID
 * and points at a StorageSlot by `slotId`. Bottle counts are never stored; they are derived from `bottles`.
 * Drinking windows and notes are illustrative, not professional assessments.
 */
import { LG_SIGNATURE_65, buildSlots, capacityOf, layoutById, zoneForStyle } from './cellarLayout';
import type { AppNotification, Bottle, Briefing, Cellar, ConnectionStatus, SensorStatus, StorageSlot, Wine, ZoneId } from './types';

/** Both demo cellars are LG SIGNATURE units; each still names its own layout. */
export const cellars: Cellar[] = [
  { id: 'cellar-signature', name: 'The Signature Cellar', location: 'Home · lower level', layoutId: LG_SIGNATURE_65.id },
  { id: 'cellar-reserve', name: 'Private Reserve', location: 'Studio · wine fridge', layoutId: LG_SIGNATURE_65.id },
];

/** Every storage position of every cellar, generated from its layout. */
export const slots: StorageSlot[] = cellars.flatMap((c) => {
  const layout = layoutById(c.layoutId);
  return layout ? buildSlots(c.id, layout) : [];
});

export interface MockEnvironment {
  temperatureC: number;
  humidityPct: number;
  connection: ConnectionStatus;
  sensor: SensorStatus;
  sensorMessage?: string;
  /** Age of the latest reading, resolved against "now" at fetch time. */
  minutesAgo: number;
  /** Latest reading per zone, °C. */
  zoneTemperaturesC: Record<ZoneId, number>;
}

export const environments: Record<string, MockEnvironment> = {
  'cellar-signature': {
    temperatureC: 12.8,
    humidityPct: 65,
    connection: 'online',
    sensor: 'ok',
    minutesAgo: 1,
    zoneTemperaturesC: { sparkling: 6.4, white: 9.8, red: 13.1 },
  },
  'cellar-reserve': {
    temperatureC: 15.9,
    humidityPct: 48,
    connection: 'online',
    sensor: 'warning',
    sensorMessage: 'Humidity below the ideal range',
    minutesAgo: 190,
    // The white zone is running above its 5–11 °C target.
    zoneTemperaturesC: { sparkling: 7.6, white: 11.8, red: 15.9 },
  },
};

type W = Omit<Wine, 'id'>;
const wine = (id: string, w: W): Wine => ({ id, ...w });

export const wines: Wine[] = [
  // Red
  wine('wine-barolo-2019', { name: 'Barolo Albe', producer: 'G.D. Vajra', vintage: 2019, style: 'Red', region: 'Piedmont', country: 'Italy', grapes: ['Nebbiolo'], drinkFrom: 2024, drinkUntil: 2035, note: 'Open an hour ahead; pairs with mushroom risotto.' }),
  wine('wine-rioja-2016', { name: 'Rioja Reserva', producer: 'La Rioja Alta', vintage: 2016, style: 'Red', region: 'Rioja', country: 'Spain', grapes: ['Tempranillo', 'Garnacha'], drinkFrom: 2022, drinkUntil: 2032, note: 'Drinking beautifully now; decant briefly.' }),
  wine('wine-leoville-2015', { name: 'Château Léoville Barton', producer: 'Léoville Barton', vintage: 2015, style: 'Red', region: 'Saint-Julien, Bordeaux', country: 'France', grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'], drinkFrom: 2027, drinkUntil: 2045, note: 'Still structured; give it time, then a long decant.' }),
  wine('wine-brunello-2017', { name: 'Brunello di Montalcino', producer: 'Il Poggione', vintage: 2017, style: 'Red', region: 'Tuscany', country: 'Italy', grapes: ['Sangiovese'], drinkFrom: 2024, drinkUntil: 2037, note: 'Cherry and leather; superb with roast lamb.' }),
  wine('wine-beaucastel-2018', { name: 'Châteauneuf-du-Pape', producer: 'Château de Beaucastel', vintage: 2018, style: 'Red', region: 'Southern Rhône', country: 'France', grapes: ['Mourvèdre', 'Grenache', 'Syrah'], drinkFrom: 2025, drinkUntil: 2040, note: 'Earthy and generous; serve slightly cool.' }),
  wine('wine-montebello-2016', { name: 'Monte Bello', producer: 'Ridge Vineyards', vintage: 2016, style: 'Red', region: 'Santa Cruz Mountains', country: 'United States', grapes: ['Cabernet Sauvignon', 'Merlot'], drinkFrom: 2028, drinkUntil: 2045, note: 'Built for the long haul; patience rewarded.' }),
  wine('wine-gevrey-2019', { name: 'Gevrey-Chambertin', producer: 'Domaine Faiveley', vintage: 2019, style: 'Red', region: 'Burgundy', country: 'France', grapes: ['Pinot Noir'], drinkFrom: 2024, drinkUntil: 2034, note: 'Red fruit and spice; lovely with duck.' }),
  wine('wine-catena-2019', { name: 'Catena Alta Malbec', producer: 'Catena Zapata', vintage: 2019, style: 'Red', region: 'Mendoza', country: 'Argentina', grapes: ['Malbec'], drinkFrom: 2023, drinkUntil: 2032, note: 'Plush and violet-scented; made for grilled steak.' }),
  wine('wine-guigal-2018', { name: 'Côte-Rôtie Brune et Blonde', producer: 'E. Guigal', vintage: 2018, style: 'Red', region: 'Northern Rhône', country: 'France', grapes: ['Syrah', 'Viognier'], drinkFrom: 2024, drinkUntil: 2036, note: 'Smoky, floral Syrah; decant for an hour.' }),
  wine('wine-amarone-2016', { name: 'Amarone della Valpolicella', producer: 'Allegrini', vintage: 2016, style: 'Red', region: 'Veneto', country: 'Italy', grapes: ['Corvina', 'Rondinella'], drinkFrom: 2023, drinkUntil: 2035, note: 'Rich and raisined; a fireside wine with aged cheese.' }),
  // White
  wine('wine-chablis-2021', { name: 'Chablis 1er Cru', producer: 'William Fèvre', vintage: 2021, style: 'White', region: 'Burgundy', country: 'France', grapes: ['Chardonnay'], drinkFrom: 2023, drinkUntil: 2030, note: 'Bright and saline; lovely with oysters.' }),
  wine('wine-riesling-2020', { name: 'Riesling Kabinett', producer: 'Dr. Loosen', vintage: 2020, style: 'White', region: 'Mosel', country: 'Germany', grapes: ['Riesling'], drinkFrom: 2022, drinkUntil: 2032, note: 'Off-dry and lifted; great with spicy dishes.' }),
  wine('wine-sancerre-2022', { name: 'Sancerre', producer: 'Henri Bourgeois', vintage: 2022, style: 'White', region: 'Loire Valley', country: 'France', grapes: ['Sauvignon Blanc'], drinkFrom: 2023, drinkUntil: 2027, note: 'Citrus and flint; with goat cheese.' }),
  wine('wine-meursault-2020', { name: 'Meursault', producer: 'Bouchard Père & Fils', vintage: 2020, style: 'White', region: 'Burgundy', country: 'France', grapes: ['Chardonnay'], drinkFrom: 2023, drinkUntil: 2030, note: 'Hazelnut and butter; with roast chicken.' }),
  wine('wine-gruner-2021', { name: 'Grüner Veltliner Kamptal', producer: 'Bründlmayer', vintage: 2021, style: 'White', region: 'Kamptal', country: 'Austria', grapes: ['Grüner Veltliner'], drinkFrom: 2023, drinkUntil: 2030, note: 'White pepper and green apple.' }),
  wine('wine-albarino-2022', { name: 'Albariño', producer: 'Pazo de Señoráns', vintage: 2022, style: 'White', region: 'Rías Baixas', country: 'Spain', grapes: ['Albariño'], drinkFrom: 2023, drinkUntil: 2025, note: 'Saline and peachy; best young.' }),
  // Rosé
  wine('wine-bandol-2023', { name: 'Bandol Rosé', producer: 'Domaine Tempier', vintage: 2023, style: 'Rosé', region: 'Provence', country: 'France', grapes: ['Mourvèdre', 'Grenache', 'Cinsault'], drinkFrom: 2024, drinkUntil: 2028, note: 'Serve well chilled with grilled fish.' }),
  // Sparkling
  wine('wine-brut-2018', { name: 'Brut Réserve', producer: 'Charles Heidsieck', vintage: 2018, style: 'Sparkling', region: 'Champagne', country: 'France', grapes: ['Chardonnay', 'Pinot Noir', 'Pinot Meunier'], drinkFrom: 2022, drinkUntil: 2030, note: 'A celebratory pour with aged comté.' }),
  wine('wine-bollinger-2015', { name: 'La Grande Année', producer: 'Bollinger', vintage: 2015, style: 'Sparkling', region: 'Champagne', country: 'France', grapes: ['Pinot Noir', 'Chardonnay'], drinkFrom: 2023, drinkUntil: 2035, note: 'Toasty and powerful; worth an occasion.' }),
  wine('wine-ruinart-2019', { name: 'Blanc de Blancs', producer: 'Ruinart', vintage: 2019, style: 'Sparkling', region: 'Champagne', country: 'France', grapes: ['Chardonnay'], drinkFrom: 2022, drinkUntil: 2029, note: 'Fine and citrusy; an aperitif classic.' }),
  // Dessert
  wine('wine-sauternes-2017', { name: 'Sauternes', producer: 'Château Suduiraut', vintage: 2017, style: 'Dessert', region: 'Bordeaux', country: 'France', grapes: ['Sémillon', 'Sauvignon Blanc'], drinkFrom: 2022, drinkUntil: 2045, note: 'Small pours with blue cheese or tarte tatin.' }),
  wine('wine-tokaji-2017', { name: 'Tokaji Aszú 5 Puttonyos', producer: 'Royal Tokaji', vintage: 2017, style: 'Dessert', region: 'Tokaj', country: 'Hungary', grapes: ['Furmint', 'Hárslevelű'], drinkFrom: 2022, drinkUntil: 2040, note: 'Apricot and honey with bright acidity.' }),
];

/**
 * How many bottles of each wine sit in each cellar, and roughly when they arrived (days ago).
 * `unplaced` bottles are in the cellar but haven't been given a slot yet (e.g. just delivered).
 * `uncertain` bottles were placed by the cellar's sensors with low confidence (given per bottle).
 */
const allocations: Record<
  string,
  { wineId: string; count: number; addedDaysAgo: number; unplaced?: number; uncertain?: number[] }[]
> = {
  'cellar-signature': [
    { wineId: 'wine-barolo-2019', count: 4, addedDaysAgo: 210, uncertain: [0.62] },
    { wineId: 'wine-rioja-2016', count: 3, addedDaysAgo: 400 },
    { wineId: 'wine-leoville-2015', count: 6, addedDaysAgo: 720 },
    { wineId: 'wine-brunello-2017', count: 3, addedDaysAgo: 160 },
    { wineId: 'wine-beaucastel-2018', count: 3, addedDaysAgo: 95 },
    { wineId: 'wine-montebello-2016', count: 2, addedDaysAgo: 540 },
    { wineId: 'wine-gevrey-2019', count: 3, addedDaysAgo: 40 },
    { wineId: 'wine-catena-2019', count: 2, addedDaysAgo: 25 },
    { wineId: 'wine-guigal-2018', count: 2, addedDaysAgo: 12 },
    { wineId: 'wine-chablis-2021', count: 3, addedDaysAgo: 60, uncertain: [0.55] },
    { wineId: 'wine-meursault-2020', count: 3, addedDaysAgo: 130 },
    { wineId: 'wine-sancerre-2022', count: 2, addedDaysAgo: 30 },
    { wineId: 'wine-bandol-2023', count: 3, addedDaysAgo: 8 },
    { wineId: 'wine-gruner-2021', count: 2, addedDaysAgo: 75 },
    { wineId: 'wine-sauternes-2017', count: 2, addedDaysAgo: 300 },
    { wineId: 'wine-bollinger-2015', count: 3, addedDaysAgo: 180 },
    { wineId: 'wine-brut-2018', count: 2, addedDaysAgo: 3, unplaced: 1 },
  ],
  'cellar-reserve': [
    { wineId: 'wine-amarone-2016', count: 3, addedDaysAgo: 260 },
    { wineId: 'wine-catena-2019', count: 2, addedDaysAgo: 50 },
    { wineId: 'wine-barolo-2019', count: 1, addedDaysAgo: 20 },
    { wineId: 'wine-riesling-2020', count: 4, addedDaysAgo: 110, uncertain: [0.7] },
    { wineId: 'wine-albarino-2022', count: 3, addedDaysAgo: 400 },
    { wineId: 'wine-tokaji-2017', count: 2, addedDaysAgo: 350 },
    { wineId: 'wine-sauternes-2017', count: 1, addedDaysAgo: 90 },
    { wineId: 'wine-brut-2018', count: 3, addedDaysAgo: 15 },
    { wineId: 'wine-ruinart-2019', count: 2, addedDaysAgo: 6 },
  ],
};

/** Bottles already opened; they have left the cellar and appear in History. */
const openedHistory: { cellarId: string; wineId: string; openedDaysAgo: number; rating?: number }[] = [
  { cellarId: 'cellar-signature', wineId: 'wine-rioja-2016', openedDaysAgo: 3 },
  { cellarId: 'cellar-signature', wineId: 'wine-brut-2018', openedDaysAgo: 9, rating: 5 },
  { cellarId: 'cellar-signature', wineId: 'wine-barolo-2019', openedDaysAgo: 21, rating: 4 },
  { cellarId: 'cellar-signature', wineId: 'wine-bandol-2023', openedDaysAgo: 44, rating: 4 },
  { cellarId: 'cellar-reserve', wineId: 'wine-riesling-2020', openedDaysAgo: 12, rating: 4 },
  { cellarId: 'cellar-reserve', wineId: 'wine-amarone-2016', openedDaysAgo: 63, rating: 5 },
];

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const short = (cellarId: string) => cellarId.replace('cellar-', '').slice(0, 3);

/** Places each allocation in its style's zone, filling shelves top to bottom; throws if a zone overflows. */
function buildBottles(): Bottle[] {
  const result: Bottle[] = [];
  for (const cellar of cellars) {
    const layout = layoutById(cellar.layoutId);
    if (!layout) throw new Error(`${cellar.id}: unknown layout ${cellar.layoutId}`);
    const free = slots.filter((s) => s.cellarId === cellar.id);
    const takeSlot = (zoneId: StorageSlot['zoneId']) => {
      const i = free.findIndex((s) => s.zoneId === zoneId);
      if (i < 0) throw new Error(`${cellar.id}: ${zoneId} zone is full`);
      return free.splice(i, 1)[0];
    };
    let n = 0;
    for (const a of allocations[cellar.id] ?? []) {
      const w = wines.find((x) => x.id === a.wineId);
      if (!w) throw new Error(`Unknown wine ${a.wineId}`);
      for (let i = 0; i < a.count; i++) {
        const placed = i < a.count - (a.unplaced ?? 0);
        const confidence = a.uncertain?.[i];
        result.push({
          id: `btl-${short(cellar.id)}-${String(++n).padStart(3, '0')}`,
          cellarId: cellar.id,
          wineId: w.id,
          status: 'in_cellar',
          slotId: placed ? takeSlot(zoneForStyle(w.style)).id : null,
          placement: placed && confidence !== undefined ? { source: 'sensor', confidence } : { source: 'manual' },
          addedAt: daysAgo(a.addedDaysAgo - i * 0.01),
        });
      }
    }
    if (result.filter((b) => b.cellarId === cellar.id).length > capacityOf(layout)) {
      throw new Error(`${cellar.id} exceeds capacity`);
    }
    openedHistory
      .filter((o) => o.cellarId === cellar.id)
      .forEach((o) => {
        result.push({
          id: `btl-${short(cellar.id)}-${String(++n).padStart(3, '0')}`,
          cellarId: cellar.id,
          wineId: o.wineId,
          status: 'opened',
          slotId: null,
          addedAt: daysAgo(o.openedDaysAgo + 200),
          openedAt: daysAgo(o.openedDaysAgo),
          rating: o.rating,
        });
      });
  }
  return result;
}

/** The seed data. At runtime, read and change bottles through `cellarStore`, never this array. */
export const bottles: Bottle[] = buildBottles();

export const briefings: Briefing[] = [
  { id: 'brief-sig-1', cellarId: 'cellar-signature', title: 'Barolo entering its window', summary: 'Your 2019 Barolo Albe is opening up. A good week to try a bottle.' },
  { id: 'brief-sig-2', cellarId: 'cellar-signature', title: 'Conditions steady all week', summary: 'Temperature held within half a degree for seven days.' },
  { id: 'brief-res-1', cellarId: 'cellar-reserve', title: 'Humidity trending low', summary: 'Consider a humidity tray; corks prefer 55–75% RH.' },
  { id: 'brief-res-2', cellarId: 'cellar-reserve', title: 'Riesling for the weekend', summary: 'The 2020 Kabinett suits lighter, spicier dishes.' },
];

export const notifications: AppNotification[] = [
  { id: 'note-1', title: 'Private Reserve humidity is low', read: false },
  { id: 'note-2', title: 'Barolo Albe is ready to drink', read: false },
  { id: 'note-3', title: 'Signature Cellar sensor reconnected', read: true },
];

export const profile = { firstName: 'Alex' };
