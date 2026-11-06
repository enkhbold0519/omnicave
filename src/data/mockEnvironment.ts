import type { DevScenario } from './devScenario';
import * as db from './mockDb';
import type { EnvironmentReading } from './types';

/** The latest mock sensor reading for a cellar, shared by Home and the Cellar Map. Null for an unknown cellar. */
export function readEnvironment(cellarId: string, scenario: DevScenario, now: Date): EnvironmentReading | null {
  const raw = db.environments[cellarId];
  if (!raw) return null;
  const reading: EnvironmentReading = {
    temperatureC: raw.temperatureC,
    humidityPct: raw.humidityPct,
    connection: raw.connection,
    sensor: raw.sensor,
    sensorMessage: raw.sensorMessage,
    recordedAt: new Date(now.getTime() - raw.minutesAgo * 60_000),
    zoneTemperaturesC: { ...raw.zoneTemperaturesC },
  };
  if (scenario !== 'sensorDisconnected') return reading;
  return {
    ...reading,
    connection: 'offline',
    sensor: 'unavailable',
    sensorMessage: 'Sensor hub not responding',
    recordedAt: new Date(now.getTime() - Math.max(raw.minutesAgo, 95) * 60_000),
  };
}
