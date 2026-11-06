/**
 * User settings from Profile: alert thresholds and timing, and taste preferences.
 * In memory for now; with the backend these are saved to the user's account.
 */
import { useSyncExternalStore } from 'react';

import type { WineStyle } from './types';

export interface AlertSettings {
  /** Alert when the temperature leaves this range, °C (spec: user-defined thresholds). */
  tempMin: number;
  tempMax: number;
  /** Alert when humidity leaves this range, %. */
  humidityMin: number;
  humidityMax: number;
  /** …for at least this long (spec: "for a specified duration"). */
  outOfRangeMinutes: number;
  /** A sensor that hasn't reported for this long counts as offline (spec: configured timeout). */
  sensorTimeoutMinutes: number;
  /** Heads-up this many months before a wine's drinking window opens; 0 = off. */
  drinkingNoticeMonths: number;
  /** Daily briefing summary at this time (spec: user-defined time); null = off. */
  briefingTime: string | null;
}

export interface TastePreferences {
  styles: WineStyle[];
  regions: string[];
  grapes: string[];
}

export interface Settings {
  alerts: AlertSettings;
  taste: TastePreferences;
}

export const defaultSettings: Settings = {
  alerts: {
    tempMin: 10,
    tempMax: 15,
    humidityMin: 55,
    humidityMax: 75,
    outOfRangeMinutes: 30,
    sensorTimeoutMinutes: 15,
    drinkingNoticeMonths: 3,
    briefingTime: '08:00',
  },
  taste: { styles: [], regions: [], grapes: [] },
};

/** Sensible bounds for the steppers; min always stays below max. */
export const limits = {
  temp: { min: 4, max: 20, step: 0.5 },
  humidity: { min: 40, max: 90, step: 5 },
};

let state: Settings = defaultSettings;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return state;
}

export function updateAlerts(change: Partial<AlertSettings>): void {
  const next = { ...state.alerts, ...change };
  // Keep each range valid: at least one step between min and max, within limits.
  next.tempMin = clamp(next.tempMin, limits.temp.min, limits.temp.max - limits.temp.step);
  next.tempMax = clamp(next.tempMax, next.tempMin + limits.temp.step, limits.temp.max);
  next.humidityMin = clamp(next.humidityMin, limits.humidity.min, limits.humidity.max - limits.humidity.step);
  next.humidityMax = clamp(next.humidityMax, next.humidityMin + limits.humidity.step, limits.humidity.max);
  state = { ...state, alerts: next };
  listeners.forEach((l) => l());
}

export function updateTaste(change: Partial<TastePreferences>): void {
  state = { ...state, taste: { ...state.taste, ...change } };
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  state = defaultSettings;
  listeners.forEach((l) => l());
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

// ── Short summaries for the Profile rows ─────────────────────────────────────────────────────────

export const formatMinutes = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

export function alertsSummary(a: AlertSettings): string {
  return `${a.tempMin}–${a.tempMax} °C · ${a.humidityMin}–${a.humidityMax} %`;
}

export function tasteSummary(t: TastePreferences): string {
  const all = [...t.styles, ...t.regions, ...t.grapes];
  if (all.length === 0) return 'Not set';
  return all.length <= 2 ? all.join(', ') : `${all.slice(0, 2).join(', ')} +${all.length - 2}`;
}
