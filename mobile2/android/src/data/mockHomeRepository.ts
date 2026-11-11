import { buildSlots, LG_SIGNATURE_65 } from './cellarLayout';
import { addCellar, getBottles, getCellars, getWines, updateCellar } from './cellarStore';
import { countBottles, pickDaily, pickFeaturedWine } from './derive';
import { getDevScenario, type DevScenario } from './devScenario';
import * as db from './mockDb';
import { readEnvironment } from './mockEnvironment';
import type { Cellar, HomeRepository, HomeSnapshot } from './types';

interface MockOptions {
  /** Simulated network latency in ms. */
  latencyMs?: number;
  /** Override the scenario source (used by tests). */
  scenario?: () => DevScenario;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Name required (≤ 40 chars); location optional (≤ 60). */
function checkCellar(name: string, location: string) {
  const n = name.trim();
  const l = location.trim();
  if (!n) throw new Error('Give the cellar a name.');
  if (n.length > 40) throw new Error('Keep the name under 40 characters.');
  if (l.length > 60) throw new Error('Keep the location under 60 characters.');
  return { name: n, location: l };
}

export function createMockHomeRepository({
  latencyMs = 600,
  scenario = getDevScenario,
}: MockOptions = {}): HomeRepository {
  return {
    async listCellars(): Promise<Cellar[]> {
      if (latencyMs) await delay(latencyMs / 3);
      return getCellars().map((c) => ({ ...c }));
    },

    async addCellar({ name, location }) {
      if (latencyMs) await delay(latencyMs / 3);
      const clean = checkCellar(name, location);
      const id = `cellar-${Date.now().toString(36)}`;
      const cellar: Cellar = { id, ...clean, layoutId: LG_SIGNATURE_65.id };
      addCellar(cellar, buildSlots(id, LG_SIGNATURE_65));
      return { ...cellar };
    },

    async renameCellar(id, { name, location }) {
      if (latencyMs) await delay(latencyMs / 3);
      if (!getCellars().some((c) => c.id === id)) throw new Error('That cellar no longer exists.');
      updateCellar(id, checkCellar(name, location));
    },

    async getHomeSnapshot(cellarId: string, now: Date = new Date()): Promise<HomeSnapshot> {
      if (latencyMs) await delay(latencyMs);
      const active = scenario();

      if (active === 'loadFailure') {
        throw new Error('Could not reach your cellar. Check your connection and try again.');
      }

      const cellar = getCellars().find((c) => c.id === cellarId);
      const environment = readEnvironment(cellarId, active, now);
      if (!cellar || !environment) {
        throw new Error(`Unknown cellar: ${cellarId}`);
      }

      const bottles = active === 'emptyInventory' ? [] : getBottles();

      return {
        cellar: { ...cellar },
        environment,
        bottleCount: countBottles(bottles, cellarId),
        featuredWine: pickFeaturedWine(bottles, getWines(), cellarId, now),
        briefing: pickDaily(
          db.briefings.filter((b) => b.cellarId === cellarId),
          now,
        ),
        unreadNotifications: db.notifications.filter((n) => !n.read).length,
      };
    },
  };
}

export const homeRepository: HomeRepository = createMockHomeRepository();
