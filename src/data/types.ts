export type WineStyle = 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Dessert';

export interface Wine {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  style: WineStyle;
  region: string;
  /** Short tasting/serving note used on the featured card. */
  note: string;
}

export type InventoryStatus = 'in_cellar' | 'consumed';

/** One stored lot of a wine in a cellar. Bottle counts are derived from these. */
export interface InventoryRecord {
  id: string;
  cellarId: string;
  wineId: string;
  quantity: number;
  status: InventoryStatus;
  readyToDrink: boolean;
}

export type ConnectionStatus = 'online' | 'offline';
export type SensorStatus = 'ok' | 'warning' | 'unavailable';

export interface EnvironmentReading {
  temperatureC: number;
  humidityPct: number;
  connection: ConnectionStatus;
  sensor: SensorStatus;
  /** Human-readable reason when sensor !== 'ok'. */
  sensorMessage?: string;
  recordedAt: Date;
}

export interface Cellar {
  id: string;
  name: string;
  location: string;
}

export interface Briefing {
  id: string;
  cellarId: string;
  title: string;
  summary: string;
}

export interface AppNotification {
  id: string;
  title: string;
  read: boolean;
}

export type CellarCondition = 'balanced' | 'attention' | 'disconnected' | 'stale';

export interface FeaturedWine {
  wine: Wine;
  quantity: number;
}

/** Everything the Home screen needs for one cellar. */
export interface HomeSnapshot {
  cellar: Cellar;
  environment: EnvironmentReading;
  bottleCount: number;
  featuredWine: FeaturedWine | null;
  briefing: Briefing | null;
  unreadNotifications: number;
}

export interface HomeRepository {
  listCellars(): Promise<Cellar[]>;
  getHomeSnapshot(cellarId: string, now?: Date): Promise<HomeSnapshot>;
}
