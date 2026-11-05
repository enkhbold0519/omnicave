import * as db from './mockDb';
import { countBottles, pickDaily, pickFeaturedWine } from './derive';
import { getDevScenario, type DevScenario } from './devScenario';
import type { Cellar, EnvironmentReading, HomeRepository, HomeSnapshot } from './types';

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
      const rawEnv = db.environments[cellarId];
      if (!cellar || !rawEnv) {
        throw new Error(`Unknown cellar: ${cellarId}`);
      }

      const records = active === 'emptyInventory' ? [] : db.inventory;

      let environment: EnvironmentReading = {
        temperatureC: rawEnv.temperatureC,
        humidityPct: rawEnv.humidityPct,
        connection: rawEnv.connection,
        sensor: rawEnv.sensor,
        sensorMessage: rawEnv.sensorMessage,
        recordedAt: new Date(now.getTime() - rawEnv.minutesAgo * 60_000),
      };
      if (active === 'sensorDisconnected') {
        environment = {
          ...environment,
          connection: 'offline',
          sensor: 'unavailable',
          sensorMessage: 'Sensor hub not responding',
          recordedAt: new Date(now.getTime() - Math.max(rawEnv.minutesAgo, 95) * 60_000),
        };
      }

      return {
        cellar: { ...cellar },
        environment,
        bottleCount: countBottles(records, cellarId),
        featuredWine: pickFeaturedWine(records, db.wines, cellarId, now),
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
