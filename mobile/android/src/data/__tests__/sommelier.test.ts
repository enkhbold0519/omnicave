import { afterEach, describe, expect, it } from '@jest/globals';

import { resetCellarStore } from '../cellarStore';
import { wines } from '../mockDb';
import {
  composeWineTurn,
  extractPreference,
  formatScore,
  mealMatch,
  mentionedPersonas,
  scoreWine,
  tastingTags,
} from '../sommelier/mockEngine';
import { createMockSommelierRepository, waitForRound } from '../sommelier/mockSommelierRepository';
import { builtInPersonas, personaColors } from '../sommelier/personas';
import { getSommelierState, resetSommelierStore } from '../sommelier/sommelierStore';
import type { PersonaInput } from '../sommelier/types';

const now = new Date('2026-11-05T20:00:00Z');
const repo = (scenario: 'normal' | 'loadFailure' | 'emptyInventory' = 'normal') =>
  createMockSommelierRepository({ typingMs: 0, wordMs: 0, scenario: () => scenario, now: () => now });
const [victor, lucia, sam] = builtInPersonas;
const wine = (id: string) => wines.find((w) => w.id === id)!;
const debateOf = (id: string) => getSommelierState().debates.find((d) => d.id === id)!;

const newPersona = (o: Partial<PersonaInput> = {}): PersonaInput => ({
  name: 'Ines Duarte',
  title: 'The Explorer',
  colorIndex: 4,
  traits: { scoring: 'hundred', focus: 'new-world', loves: ['fruit', 'terroir'], strictness: 3, tone: 'warm', description: 'Loves discovering small producers.' },
  ...o,
});

afterEach(() => {
  resetSommelierStore();
  resetCellarStore();
});

describe('personas', () => {
  it('starts with three fictional built-in sommeliers', async () => {
    const list = await repo().listPersonas();
    expect(list.map((p) => p.name)).toEqual(['Victor Hale', 'Lucia Moretti', 'Sam Okafor']);
    expect(list.every((p) => p.builtIn)).toBe(true);
  });

  it('adds, edits and deletes sommeliers, and restores the defaults', async () => {
    const r = repo();
    const ines = await r.createPersona(newPersona());
    expect((await r.listPersonas()).some((p) => p.id === ines.id && !p.builtIn)).toBe(true);

    const edited = await r.updatePersona(ines.id, newPersona({ name: '  Inês  ', traits: { ...newPersona().traits, tone: 'blunt' } }));
    expect(edited.name).toBe('Inês');
    expect(edited.traits.tone).toBe('blunt');

    await r.deletePersona(victor.id);
    await r.deletePersona(ines.id);
    expect((await r.listPersonas()).map((p) => p.id)).toEqual([lucia.id, sam.id]);
    await r.restoreDefaultPersonas();
    expect((await r.listPersonas()).map((p) => p.id)).toEqual([victor.id, lucia.id, sam.id]);
  });

  it('validates the personality editor input', async () => {
    const r = repo();
    await expect(r.createPersona(newPersona({ name: '  ' }))).rejects.toThrow('name');
    await expect(r.createPersona(newPersona({ traits: { ...newPersona().traits, loves: [] } }))).rejects.toThrow('one to three');
    await expect(
      r.createPersona(newPersona({ traits: { ...newPersona().traits, loves: ['fruit', 'oak', 'age', 'value'] } })),
    ).rejects.toThrow('one to three');
    await expect(r.createPersona(newPersona({ colorIndex: personaColors.length }))).rejects.toThrow('color');
  });
});

describe('debate flow', () => {
  it('seats 2 to 5 sommeliers', async () => {
    const r = repo();
    const topic = { kind: 'wine' as const, wineId: 'wine-barolo-2019' };
    await expect(r.startDebate({ topic, personaIds: [victor.id] })).rejects.toThrow('2 to 5');
    const extra = await Promise.all([1, 2, 3].map((i) => r.createPersona(newPersona({ name: `Guest ${i}` }))));
    const six = [victor.id, lucia.id, sam.id, ...extra.map((p) => p.id)];
    await expect(r.startDebate({ topic, personaIds: six })).rejects.toThrow('2 to 5');
  });

  it('each sommelier speaks once, then the table waits for the user', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'wine', wineId: 'wine-barolo-2019' }, personaIds: [victor.id, lucia.id, sam.id] });
    await waitForRound(d.id);
    const after = debateOf(d.id);
    expect(after.status).toBe('awaitingUser');
    expect(after.messages.map((m) => (m.author.kind === 'persona' ? m.author.personaId : 'user'))).toEqual([victor.id, lucia.id, sam.id]);
    expect(after.messages.every((m) => m.score && m.tags?.length && !m.streaming)).toBe(true);

    await r.continueDebate(d.id);
    expect(debateOf(d.id).messages).toHaveLength(6);
    expect(debateOf(d.id).round).toBe(2);
  });

  it('lets the user join in; an @mention gets only that sommelier', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'wine', wineId: 'wine-barolo-2019' }, personaIds: [victor.id, lucia.id] });
    await waitForRound(d.id);
    await r.sendMessage(d.id, '@Lucia why so strict?');
    const msgs = debateOf(d.id).messages;
    expect(msgs[2].author.kind).toBe('user');
    expect(msgs.slice(3).map((m) => (m.author.kind === 'persona' ? m.author.personaId : 'user'))).toEqual([lucia.id]);

    await r.sendMessage(d.id, 'What should I eat with it?');
    expect(debateOf(d.id).messages.slice(-2).every((m) => m.author.kind === 'persona')).toBe(true);
  });

  it("remembers the user's stated preferences for everyone at the table", async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'wine', wineId: 'wine-chablis-2021' }, personaIds: [victor.id, sam.id] });
    await waitForRound(d.id);
    await r.sendMessage(d.id, 'I really love Riesling from the Mosel.');
    const personas = getSommelierState().personas;
    expect(personas.find((p) => p.id === victor.id)?.memory[0]).toBe('You love Riesling from the Mosel');
    expect(personas.find((p) => p.id === lucia.id)?.memory).toEqual([]);
    await r.clearPersonaMemory(victor.id);
    expect(getSommelierState().personas.find((p) => p.id === victor.id)?.memory).toEqual([]);
  });

  it('ends with a verdict: scores and peak years for a wine', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'wine', wineId: 'wine-leoville-2015' }, personaIds: [victor.id, lucia.id, sam.id] });
    await waitForRound(d.id);
    await r.endDebate(d.id);
    const v = debateOf(d.id).verdict;
    expect(v?.kind).toBe('wine');
    if (v?.kind === 'wine') {
      expect(v.scores).toHaveLength(3);
      expect(v.scores.every((s) => s.peakYear >= 2027 && s.peakYear <= 2045)).toBe(true);
    }
    await expect(r.continueDebate(d.id)).rejects.toThrow('ended');
  });

  it('answers "what to open tonight" with different ready bottles from the cellar', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'question', intent: 'tonight', text: '' }, personaIds: [victor.id, lucia.id, sam.id] });
    await waitForRound(d.id);
    const picks = debateOf(d.id).messages.map((m) => m.wineIds?.[0]);
    expect(picks.every(Boolean)).toBe(true);
    expect(new Set(picks).size).toBe(3);
    await r.endDebate(d.id);
    expect(debateOf(d.id).verdict).toMatchObject({ kind: 'question' });
  });

  it('pairs a meal with suitable bottles', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'question', intent: 'pairing', text: 'oysters and grilled fish' }, personaIds: [lucia.id, sam.id] });
    await waitForRound(d.id);
    const styles = debateOf(d.id).messages.map((m) => wine(m.wineIds![0]).style);
    expect(styles.every((s) => s === 'White' || s === 'Sparkling')).toBe(true);
  });

  it('copes with an empty cellar and fails cleanly when offline', async () => {
    const d = await repo('emptyInventory').startDebate({ topic: { kind: 'question', intent: 'tonight', text: '' }, personaIds: [victor.id, sam.id] });
    await waitForRound(d.id);
    expect(debateOf(d.id).messages[0].text).toContain('empty');
    await expect(repo('loadFailure').startDebate({ topic: { kind: 'wine', wineId: 'wine-barolo-2019' }, personaIds: [victor.id, sam.id] })).rejects.toThrow();
  });

  it('keeps a snapshot of participants when a sommelier is deleted later', async () => {
    const r = repo();
    const d = await r.startDebate({ topic: { kind: 'wine', wineId: 'wine-barolo-2019' }, personaIds: [victor.id, sam.id] });
    await waitForRound(d.id);
    await r.deletePersona(victor.id);
    expect(debateOf(d.id).participants.map((p) => p.name)).toEqual(['Victor Hale', 'Sam Okafor']);
  });
});

describe('mock engine', () => {
  it('scores by personality: the purist prefers Chablis, the classicist prefers Léoville', () => {
    const chablis = wine('wine-chablis-2021');
    const leoville = wine('wine-leoville-2015');
    expect(scoreWine(lucia, chablis).normalized).toBeGreaterThan(scoreWine(lucia, leoville).normalized);
    expect(scoreWine(victor, leoville).normalized).toBeGreaterThan(scoreWine(victor, chablis).normalized);
  });

  it('formats scores in each scale', () => {
    expect(formatScore(94, 'hundred')).toBe('94');
    expect(formatScore(99, 'twenty')).toBe('19.5/20');
    expect(formatScore(99, 'stars')).toBe('★★★★★');
    expect(formatScore(84, 'stars')).toBe('★★★');
  });

  it('writes tasting notes that follow what the persona values', () => {
    expect(tastingTags(lucia, wine('wine-riesling-2020'))[0].kind).toBe('freshness');
    expect(tastingTags(victor, wine('wine-leoville-2015')).some((t) => t.kind === 'oak' || t.kind === 'structure')).toBe(true);
  });

  it('reacts to the previous speaker', () => {
    const w = wine('wine-leoville-2015');
    const first = composeWineTurn({ persona: victor, wine: w, round: 1, previous: null, now });
    const second = composeWineTurn({ persona: sam, wine: w, round: 1, previous: { persona: victor, score: first.score }, now });
    expect(second.text).toMatch(/Victor/);
    expect(first.text).toContain(`My score: ${first.score.label}.`);
  });

  it('understands mentions, preferences and meals', () => {
    expect(mentionedPersonas('@victor and @Sam Okafor?', builtInPersonas)).toEqual([victor.id, sam.id]);
    expect(mentionedPersonas('no mentions', builtInPersonas)).toEqual([]);
    expect(extractPreference("I don't like heavy oak.")).toBe("You don't like heavy oak");
    expect(extractPreference('What about tonight?')).toBeNull();
    expect(mealMatch('a spicy Thai curry')?.test(wine('wine-riesling-2020'))).toBe(true);
    expect(mealMatch('a lovely day')).toBeNull();
  });
});
