/**
 * Single source of truth for all mock CellarOS data.
 * Bottle counts are never stored here; they are derived from `inventory`.
 */
import type { AppNotification, Briefing, Cellar, ConnectionStatus, InventoryRecord, SensorStatus, Wine } from './types';

export const cellars: Cellar[] = [
  { id: 'cellar-signature', name: 'The Signature Cellar', location: 'Home · lower level' },
  { id: 'cellar-reserve', name: 'Private Reserve', location: 'Studio · wine fridge' },
];

export interface MockEnvironment {
  temperatureC: number;
  humidityPct: number;
  connection: ConnectionStatus;
  sensor: SensorStatus;
  sensorMessage?: string;
  /** Age of the latest reading, resolved against "now" at fetch time. */
  minutesAgo: number;
}

export const environments: Record<string, MockEnvironment> = {
  'cellar-signature': {
    temperatureC: 12.8,
    humidityPct: 65,
    connection: 'online',
    sensor: 'ok',
    minutesAgo: 1,
  },
  'cellar-reserve': {
    temperatureC: 15.9,
    humidityPct: 48,
    connection: 'online',
    sensor: 'warning',
    sensorMessage: 'Humidity below the ideal range',
    minutesAgo: 190,
  },
};

export const wines: Wine[] = [
  { id: 'wine-barolo-2019', name: 'Barolo Albe', producer: 'G.D. Vajra', vintage: 2019, style: 'Red', region: 'Piedmont', note: 'Open an hour ahead; pairs with mushroom risotto.' },
  { id: 'wine-bandol-2023', name: 'Bandol Rosé', producer: 'Domaine Tempier', vintage: 2023, style: 'Rosé', region: 'Provence', note: 'Serve well chilled with grilled fish.' },
  { id: 'wine-chablis-2021', name: 'Chablis 1er Cru', producer: 'William Fèvre', vintage: 2021, style: 'White', region: 'Burgundy', note: 'Bright and saline; lovely with oysters.' },
  { id: 'wine-rioja-2016', name: 'Rioja Reserva', producer: 'La Rioja Alta', vintage: 2016, style: 'Red', region: 'Rioja', note: 'Drinking beautifully now; decant briefly.' },
  { id: 'wine-brut-2018', name: 'Brut Réserve', producer: 'Charles Heidsieck', vintage: 2018, style: 'Sparkling', region: 'Champagne', note: 'A celebratory pour with aged comté.' },
  { id: 'wine-leoville-2015', name: 'Château Léoville Barton', producer: 'Léoville Barton', vintage: 2015, style: 'Red', region: 'Saint-Julien', note: 'Still structured; give it a long decant.' },
  { id: 'wine-sauternes-2017', name: 'Sauternes', producer: 'Château Suduiraut', vintage: 2017, style: 'Dessert', region: 'Bordeaux', note: 'Small pours with blue cheese or tarte tatin.' },
  { id: 'wine-riesling-2020', name: 'Riesling Kabinett', producer: 'Dr. Loosen', vintage: 2020, style: 'White', region: 'Mosel', note: 'Off-dry and lifted; great with spicy dishes.' },
];

export const inventory: InventoryRecord[] = [
  // The Signature Cellar — 10 bottles in cellar (one consumed lot is excluded).
  { id: 'inv-1', cellarId: 'cellar-signature', wineId: 'wine-barolo-2019', quantity: 3, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-2', cellarId: 'cellar-signature', wineId: 'wine-bandol-2023', quantity: 2, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-3', cellarId: 'cellar-signature', wineId: 'wine-chablis-2021', quantity: 1, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-4', cellarId: 'cellar-signature', wineId: 'wine-rioja-2016', quantity: 2, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-5', cellarId: 'cellar-signature', wineId: 'wine-leoville-2015', quantity: 2, status: 'in_cellar', readyToDrink: false },
  { id: 'inv-6', cellarId: 'cellar-signature', wineId: 'wine-brut-2018', quantity: 1, status: 'consumed', readyToDrink: true },

  // Private Reserve — 6 bottles.
  { id: 'inv-7', cellarId: 'cellar-reserve', wineId: 'wine-brut-2018', quantity: 2, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-8', cellarId: 'cellar-reserve', wineId: 'wine-sauternes-2017', quantity: 1, status: 'in_cellar', readyToDrink: true },
  { id: 'inv-9', cellarId: 'cellar-reserve', wineId: 'wine-riesling-2020', quantity: 3, status: 'in_cellar', readyToDrink: true },
];

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
