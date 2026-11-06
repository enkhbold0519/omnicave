import { describe, expect, it } from '@jest/globals';

import type { DevScenario } from '../devScenario';
import { createMockHomeRepository } from '../mockHomeRepository';

const now = new Date('2026-11-05T12:00:00Z');
const repoWith = (scenario: DevScenario) => createMockHomeRepository({ latencyMs: 0, scenario: () => scenario });

describe('mock home repository', () => {
  it('lists two demonstration cellars', async () => {
    const cellars = await repoWith('normal').listCellars();
    expect(cellars.map((c) => c.id)).toEqual(['cellar-signature', 'cellar-reserve']);
  });

  it('returns distinct inventory and environment per cellar', async () => {
    const repo = repoWith('normal');
    const a = await repo.getHomeSnapshot('cellar-signature', now);
    const b = await repo.getHomeSnapshot('cellar-reserve', now);

    expect(a.bottleCount).toBe(48);
    expect(b.bottleCount).toBe(21);
    expect(a.environment.sensor).toBe('ok');
    expect(b.environment.sensor).toBe('warning');
    expect(a.featuredWine?.wine.id).not.toBe(b.featuredWine?.wine.id);
    expect(a.briefing?.cellarId).toBe('cellar-signature');
    expect(b.briefing?.cellarId).toBe('cellar-reserve');
  });

  it('simulates load failure', async () => {
    await expect(repoWith('loadFailure').getHomeSnapshot('cellar-signature', now)).rejects.toThrow();
  });

  it('simulates sensor disconnection', async () => {
    const s = await repoWith('sensorDisconnected').getHomeSnapshot('cellar-signature', now);
    expect(s.environment.connection).toBe('offline');
    expect(s.environment.sensor).toBe('unavailable');
  });

  it('simulates empty inventory with no featured wine', async () => {
    const s = await repoWith('emptyInventory').getHomeSnapshot('cellar-signature', now);
    expect(s.bottleCount).toBe(0);
    expect(s.featuredWine).toBeNull();
  });

  it('rejects unknown cellars', async () => {
    await expect(repoWith('normal').getHomeSnapshot('nope', now)).rejects.toThrow('Unknown cellar');
  });
});
