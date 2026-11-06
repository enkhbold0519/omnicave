export type WineStyle = 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Dessert';

export interface Wine {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  style: WineStyle;
  region: string;
  country: string;
  grapes: string[];
  /** Estimated drinking window, inclusive years. Ready to drink = current year inside it. */
  drinkFrom: number;
  drinkUntil: number;
  /** Short tasting/serving note. */
  note: string;
}

export type ZoneId = 'sparkling' | 'white' | 'red';

/** One temperature zone of a cellar layout; shelves are numbered from the top. */
export interface ZoneConfig {
  id: ZoneId;
  /** Inclusive shelf range. */
  shelves: [number, number];
  /** Manufacturer's target range for the zone, °C. */
  targetC: [number, number];
}

/** The physical arrangement of one cellar model. Configuration only, so the map never hardcodes positions. */
export interface CellarLayout {
  id: string;
  model: string;
  shelves: number;
  positionsPerShelf: number;
  zones: ZoneConfig[];
}

/**
 * One physical storage position with a stable ID (future `slots` table).
 * A bottle points at it through `Bottle.slotId`.
 */
export interface StorageSlot {
  id: string;
  cellarId: string;
  zoneId: ZoneId;
  shelf: number;
  position: number;
}

/** `removed`: taken out without being opened (gifted, sold); it leaves the inventory but not into History. */
export type BottleStatus = 'in_cellar' | 'opened' | 'removed';

/**
 * How a bottle's slot was recorded. `sensor` positions come with the detector's confidence (0–1);
 * below UNCERTAIN_BELOW the app treats the position as uncertain until someone confirms or moves it.
 */
export interface Placement {
  source: 'manual' | 'sensor';
  confidence?: number;
}

/**
 * One physical bottle with its own ID (spec: unique bottle identification).
 * Bottle counts are always derived from these records, never stored.
 */
export interface Bottle {
  id: string;
  cellarId: string;
  wineId: string;
  status: BottleStatus;
  /** The StorageSlot it sits in. Null once opened, or while it hasn't been placed yet. */
  slotId: string | null;
  /** Missing means entered by hand. */
  placement?: Placement;
  addedAt: Date;
  openedAt?: Date;
  /** 1–5, given after opening. */
  rating?: number;
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
  /** Per-zone temperatures, for multi-zone units such as the LG SIGNATURE. */
  zoneTemperaturesC?: Partial<Record<ZoneId, number>>;
}

export interface Cellar {
  id: string;
  name: string;
  location: string;
  /** Which CellarLayout this unit uses (see cellarLayout.ts). */
  layoutId: string;
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
  /** Register another cellar unit (an LG SIGNATURE layout for now). */
  addCellar(input: { name: string; location: string }): Promise<Cellar>;
  renameCellar(id: string, input: { name: string; location: string }): Promise<void>;
  getHomeSnapshot(cellarId: string, now?: Date): Promise<HomeSnapshot>;
}

/** A cellar id, or every cellar on the account (spec: cross-cellar search). */
export type CellarScope = string | 'all';

/** Raw records an inventory or history view needs; grouping and filtering happen in inventory.ts. */
export interface InventoryData {
  bottles: Bottle[];
  wines: Wine[];
  cellars: Cellar[];
}

export interface WineDetails {
  wine: Wine;
  /** Bottles of this wine still in any cellar, with where they are (slot is null when not placed). */
  inCellar: { bottle: Bottle; cellar: Cellar; slot: StorageSlot | null }[];
  /** Bottles of this wine already opened, newest first. */
  opened: { bottle: Bottle; cellar: Cellar }[];
}

/** Everything the Cellar Map needs for one cellar: its layout, its slots and the bottles stored in it. */
export interface CellarMapData {
  cellar: Cellar;
  /** Null when the cellar's layout isn't known to the app. */
  layout: CellarLayout | null;
  slots: StorageSlot[];
  /** Bottles currently in this cellar (placed or not). */
  bottles: Bottle[];
  wines: Wine[];
  /** Latest sensor reading for the cellar; null when there has never been one. */
  environment: EnvironmentReading | null;
}

export interface NewBottleInput {
  cellarId: string;
  slotId: string | null;
  wine: Pick<Wine, 'name' | 'producer' | 'vintage' | 'style' | 'region' | 'country' | 'grapes'>;
}

/**
 * A bottle the cellar camera found but nobody has confirmed yet. `wine` is what label recognition read;
 * the user reviews and corrects it before it becomes a Bottle.
 */
export interface DetectedBottle {
  id: string;
  cellarId: string;
  /** Where the camera saw it; null if that position isn't free or known. */
  slotId: string | null;
  wine: NewBottleInput['wine'];
  /** Label-reading confidence, 0–1. */
  confidence: number;
}

export interface InventoryRepository {
  /** Bottles currently in the cellar(s). */
  listInventory(scope: CellarScope): Promise<InventoryData>;
  /** Bottles already opened, newest first. */
  listHistory(scope: CellarScope): Promise<InventoryData>;
  getWineDetails(wineId: string): Promise<WineDetails | null>;
  /** Null when the cellar doesn't exist. */
  getCellarMap(cellarId: string): Promise<CellarMapData | null>;

  // Changes. Each rejects with a readable message when the change isn't possible (e.g. the slot is taken).
  /**
   * Manual registration: the wine's details plus where it goes. Reuses the catalog wine when name, winery and
   * vintage match; `slotId` null adds it without a position.
   */
  createBottle(input: NewBottleInput): Promise<Bottle>;
  /**
   * Manual modification: the wine's details (shared by every bottle of that wine) and this bottle's location.
   */
  updateBottle(bottleId: string, input: NewBottleInput): Promise<void>;
  /** Bottles detected by the camera, waiting for review. */
  listDetections(): Promise<DetectedBottle[]>;
  /** Register a reviewed (possibly corrected) detection as a bottle. */
  confirmDetection(detectionId: string, input: NewBottleInput): Promise<Bottle>;
  /** "Not a bottle": drop a detection. */
  dismissDetection(detectionId: string): Promise<void>;
  /** Store a new bottle of a catalog wine in an empty slot. */
  addBottle(input: { cellarId: string; wineId: string; slotId: string }): Promise<Bottle>;
  /** Move a bottle (placed or not yet placed) into an empty slot of its own cellar; the position becomes confirmed. */
  moveBottle(bottleId: string, slotId: string): Promise<void>;
  /** The bottle was opened: it leaves the cellar and appears in History. */
  openBottle(bottleId: string): Promise<void>;
  /** The bottle left without being opened. */
  removeBottle(bottleId: string): Promise<void>;
  /** Accept an uncertain sensor-detected position as correct. */
  confirmPosition(bottleId: string): Promise<void>;
}
