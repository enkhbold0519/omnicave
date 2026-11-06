import { afterEach, describe, expect, it } from '@jest/globals';

import { createMockAuthRepository, demoAccount } from '../auth';
import { buildCellarMap } from '../cellarMap';
import { getCellars, resetCellarStore } from '../cellarStore';
import { createMockHomeRepository } from '../mockHomeRepository';
import { createMockInventoryRepository } from '../mockInventoryRepository';
import { alertsSummary, getSettings, resetSettings, tasteSummary, updateAlerts, updateTaste } from '../settings';

afterEach(() => {
  resetSettings();
  resetCellarStore();
});

describe('alert settings', () => {
  it('starts from the ideal storage ranges', () => {
    expect(alertsSummary(getSettings().alerts)).toBe('10–15 °C · 55–75 %');
  });

  it('keeps every range valid: lowest stays below highest, within limits', () => {
    updateAlerts({ tempMin: 18 });
    updateAlerts({ tempMax: 12 });
    const a = getSettings().alerts;
    expect(a.tempMin).toBeLessThan(a.tempMax);
    updateAlerts({ humidityMin: 10, humidityMax: 200 });
    expect(getSettings().alerts.humidityMin).toBe(40);
    expect(getSettings().alerts.humidityMax).toBe(90);
  });

  it('stores timing choices, including turning things off', () => {
    updateAlerts({ outOfRangeMinutes: 120, sensorTimeoutMinutes: 5, drinkingNoticeMonths: 0, briefingTime: null });
    expect(getSettings().alerts).toMatchObject({ outOfRangeMinutes: 120, sensorTimeoutMinutes: 5, drinkingNoticeMonths: 0, briefingTime: null });
  });
});

describe('taste preferences', () => {
  it('summarises briefly for the Profile row', () => {
    expect(tasteSummary(getSettings().taste)).toBe('Not set');
    updateTaste({ styles: ['Red'], regions: ['Burgundy', 'Piedmont'] });
    expect(tasteSummary(getSettings().taste)).toBe('Red, Burgundy +1');
  });
});

describe('my cellars', () => {
  const home = () => createMockHomeRepository({ latencyMs: 0, scenario: () => 'normal' });
  const inv = () => createMockInventoryRepository({ latencyMs: 0, scenario: () => 'normal' });

  it('adds an empty LG SIGNATURE cellar with its 65 positions, visible everywhere', async () => {
    const cellar = await home().addCellar({ name: '  Lake House ', location: 'Kitchen' });
    expect(cellar.name).toBe('Lake House');
    expect((await home().listCellars()).map((c) => c.id)).toContain(cellar.id);
    const data = (await inv().getCellarMap(cellar.id))!;
    const map = buildCellarMap({ ...data, layout: data.layout! });
    expect(map.capacity).toBe(65);
    expect(map.occupied).toBe(0);
    const snapshot = await home().getHomeSnapshot(cellar.id);
    expect(snapshot.bottleCount).toBe(0);
    expect(snapshot.environment.connection).toBe('offline');
  });

  it('renames a cellar, and validates names', async () => {
    await home().renameCellar('cellar-reserve', { name: 'Studio Reserve', location: 'Studio' });
    expect(getCellars().find((c) => c.id === 'cellar-reserve')?.name).toBe('Studio Reserve');
    await expect(home().renameCellar('cellar-reserve', { name: ' ', location: '' })).rejects.toThrow('name');
    await expect(home().addCellar({ name: 'x'.repeat(41), location: '' })).rejects.toThrow('40');
  });
});

describe('delete account', () => {
  it('requires the password, then removes the account', async () => {
    const r = createMockAuthRepository({ latencyMs: 0 });
    const { token } = await r.logIn(demoAccount.email, demoAccount.password);
    await expect(r.deleteAccount(token, 'wrong')).rejects.toThrow('not correct');
    await r.deleteAccount(token, demoAccount.password);
    await expect(r.logIn(demoAccount.email, demoAccount.password)).rejects.toThrow('Invalid email or password');
  });
});
