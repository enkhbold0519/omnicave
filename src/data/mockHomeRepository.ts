import { getBottles } from './cellarStore';
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

export function createMockHomeRepository({
  latencyMs = 600,
  scenario = getDevScenario,
}: MockOptions = {}): HomeRepository {
  return {
    async listCellars(): Promise<Cellar[]> {
      if (latencyMs) await delay(latencyMs / 3);
      return db.cellars.map((c) => ({ ...c }));
    },

    async getHomeSnapshot(cellarId: string, now: Date = new Date()): Promise<HomeSnapshot> {
      if (latencyMs) await delay(latencyMs);
      const active = scenario();

      if (active === 'loadFailure') {
        throw new Error('Could not reach your cellar. Check your connection and try again.');
      }

      const cellar = db.cellars.find((c) => c.id === cellarId);
      const environment = readEnvironment(cellarId, active, now);
      if (!cellar || !environment) {
        throw new Error(`Unknown cellar: ${cellarId}`);
      }

      const bottles = active === 'emptyInventory' ? [] : getBottles();

      return {
        cellar: { ...cellar },
        environment,
        bottleCount: countBottles(bottles, cellarId),
        featuredWine: pickFeaturedWine(bottles, db.wines, cellarId, now),
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
