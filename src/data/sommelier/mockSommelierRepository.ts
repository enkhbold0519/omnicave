import { formatSlot } from '../cellarLayout';
import { getBottles, getCellars, getSlots, getWines } from '../cellarStore';
import { getDevScenario, type DevScenario } from '../devScenario';
import {
  composeQuestionTurn,
  composeReply,
  composeWineTurn,
  computeVerdict,
  debateTitle,
  extractPreference,
  mentionedPersonas,
  type Candidate,
} from './mockEngine';
import { builtInPersonas, personaColors } from './personas';
import { getSommelierState, setSommelierState, updateDebate } from './sommelierStore';
import {
  TABLE_MAX,
  TABLE_MIN,
  type Debate,
  type DebateMessage,
  type Persona,
  type PersonaInput,
  type Score,
  type SommelierRepository,
} from './types';

interface MockOptions {
  /** "Typing…" pause before each persona speaks. */
  typingMs?: number;
  /** Delay between streamed words. 0 = whole message at once (tests). */
  wordMs?: number;
  scenario?: () => DevScenario;
  now?: () => Date;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** Rounds in flight, so tests (and a future "stop" button) can wait for or interrupt them. */
const rounds = new Map<string, Promise<void>>();
export const waitForRound = (debateId: string) => rounds.get(debateId) ?? Promise.resolve();

function validate(input: PersonaInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Give your sommelier a name.');
  if (name.length > 40) throw new Error('Keep the name under 40 characters.');
  if (input.traits.loves.length < 1 || input.traits.loves.length > 3) throw new Error('Choose one to three things they value.');
  if (input.colorIndex < 0 || input.colorIndex >= personaColors.length) throw new Error('Choose an avatar color.');
  if (input.traits.description.length > 400) throw new Error('Keep the description under 400 characters.');
}

const clean = (input: PersonaInput): PersonaInput => ({
  ...input,
  name: input.name.trim(),
  title: input.title.trim(),
  traits: { ...input.traits, description: input.traits.description.trim() },
});

export function createMockSommelierRepository({
  typingMs = 700,
  wordMs = 35,
  scenario = getDevScenario,
  now = () => new Date(),
}: MockOptions = {}): SommelierRepository {
  const fail = () => {
    if (scenario() === 'loadFailure') throw new Error("Couldn't reach the sommeliers. Check your connection and try again.");
  };

  /** One bottle per wine still in a cellar, with a readable location. */
  const candidates = (): Candidate[] => {
    if (scenario() === 'emptyInventory') return [];
    const seen = new Set<string>();
    const result: Candidate[] = [];
    for (const b of getBottles()) {
      if (b.status !== 'in_cellar' || seen.has(b.wineId)) continue;
      const wine = getWines().find((w) => w.id === b.wineId);
      if (!wine) continue;
      seen.add(b.wineId);
      const cellar = getCellars().find((c) => c.id === b.cellarId)?.name ?? 'your cellar';
      const slot = getSlots().find((s) => s.id === b.slotId);
      result.push({ wine, location: slot ? `${cellar}, ${formatSlot(slot).toLowerCase().replace('zone ·', 'zone,')}` : `${cellar} (not yet placed)` });
    }
    return result;
  };

  /** True when the debate ended or was deleted, so a running round should stop. */
  const stopped = (id: string) => {
    const d = getSommelierState().debates.find((x) => x.id === id);
    return !d || d.status === 'ended';
  };

  const debate = (id: string): Debate => {
    const d = getSommelierState().debates.find((x) => x.id === id);
    if (!d) throw new Error('That conversation no longer exists.');
    return d;
  };

  /** Adds a message and reveals it word by word. Stops early (showing everything) if the debate ends. */
  const stream = async (debateId: string, message: DebateMessage, fullText: string) => {
    updateDebate(debateId, (d) => ({ ...d, speakingPersonaId: null, messages: [...d.messages, { ...message, text: wordMs ? '' : fullText, streaming: !!wordMs }] }));
    if (wordMs) {
      const words = fullText.split(' ');
      for (let i = 1; i <= words.length; i++) {
        if (stopped(debateId)) break;
        await sleep(wordMs);
        const text = words.slice(0, i).join(' ');
        updateDebate(debateId, (d) => ({ ...d, messages: d.messages.map((m) => (m.id === message.id ? { ...m, text } : m)) }));
      }
      updateDebate(debateId, (d) => ({ ...d, messages: d.messages.map((m) => (m.id === message.id ? { ...m, text: fullText, streaming: false } : m)) }));
    }
  };

  /** Each speaker takes one turn, then the table waits for the user. */
  const runRound = (debateId: string, speakers: Persona[], userText: string | null) => {
    const task = (async () => {
      const d0 = debate(debateId);
      const roundNo = userText ? Math.max(1, d0.round) : d0.round + 1;
      const wine = d0.topic.kind === 'wine' ? (getWines().find((w) => w.id === (d0.topic as { wineId: string }).wineId) ?? null) : null;
      const pool = candidates();
      const taken = new Set(d0.messages.flatMap((m) => m.wineIds ?? []));
      let previous: { persona: Persona; score: Score } | null = null;

      updateDebate(debateId, (d) => ({ ...d, status: 'speaking', round: roundNo }));
      for (const persona of speakers) {
        if (stopped(debateId)) break;
        updateDebate(debateId, (d) => ({ ...d, speakingPersonaId: persona.id }));
        if (typingMs) await sleep(typingMs);
        if (stopped(debateId)) break;

        const t = now();
        let message: DebateMessage = { id: nextId('msg'), author: { kind: 'persona', personaId: persona.id }, text: '', streaming: false };
        let text: string;
        if (userText) {
          text = composeReply({ persona, userText, wine, now: t });
        } else if (wine) {
          const turn = composeWineTurn({ persona, wine, round: roundNo, previous, now: t });
          text = turn.text;
          message = { ...message, tags: turn.tags.length ? turn.tags : undefined, score: roundNo === 1 ? turn.score : undefined };
          previous = { persona, score: turn.score };
        } else {
          const topic = d0.topic.kind === 'question' ? d0.topic : { kind: 'question' as const, intent: 'open' as const, text: '' };
          const turn = composeQuestionTurn({ persona, topic, round: roundNo, candidates: pool, taken, previous, now: t });
          text = turn.text;
          turn.wineIds.forEach((id) => taken.add(id));
          message = { ...message, wineIds: turn.wineIds, score: turn.score ?? undefined };
          if (turn.score) previous = { persona, score: turn.score };
        }
        await stream(debateId, message, text);
      }
      updateDebate(debateId, (d) => (d.status === 'ended' ? d : { ...d, status: 'awaitingUser', speakingPersonaId: null }));
    })();
    rounds.set(debateId, task);
    return task;
  };

  const assertCanSpeak = (d: Debate) => {
    if (d.status === 'ended') throw new Error('This conversation has ended. Start a new one.');
    if (d.status === 'speaking') throw new Error('Let them finish first.');
  };

  return {
    async listPersonas() {
      return getSommelierState().personas;
    },

    async createPersona(input) {
      validate(input);
      const c = clean(input);
      const persona: Persona = { ...c, title: c.title || 'Your sommelier', id: nextId('persona'), memory: [], builtIn: false };
      setSommelierState((s) => ({ ...s, personas: [...s.personas, persona] }));
      return persona;
    },

    async updatePersona(id, input) {
      validate(input);
      const existing = getSommelierState().personas.find((p) => p.id === id);
      if (!existing) throw new Error('That sommelier no longer exists.');
      const c = clean(input);
      const updated: Persona = { ...existing, ...c, title: c.title || existing.title };
      setSommelierState((s) => ({ ...s, personas: s.personas.map((p) => (p.id === id ? updated : p)) }));
      return updated;
    },

    async deletePersona(id) {
      setSommelierState((s) => ({ ...s, personas: s.personas.filter((p) => p.id !== id) }));
    },

    async restoreDefaultPersonas() {
      setSommelierState((s) => {
        const custom = s.personas.filter((p) => !p.builtIn);
        const defaults = builtInPersonas.map((b) => s.personas.find((p) => p.id === b.id) ?? { ...b, memory: [] });
        return { ...s, personas: [...defaults, ...custom] };
      });
    },

    async clearPersonaMemory(id) {
      setSommelierState((s) => ({ ...s, personas: s.personas.map((p) => (p.id === id ? { ...p, memory: [] } : p)) }));
    },

    async startDebate({ topic, personaIds }) {
      fail();
      const unique = [...new Set(personaIds)];
      if (unique.length < TABLE_MIN || unique.length > TABLE_MAX) throw new Error(`Seat ${TABLE_MIN} to ${TABLE_MAX} sommeliers at the table.`);
      const participants = unique.map((id) => getSommelierState().personas.find((p) => p.id === id));
      if (participants.some((p) => !p)) throw new Error('One of those sommeliers no longer exists.');
      if (topic.kind === 'wine' && !getWines().some((w) => w.id === topic.wineId)) throw new Error('Unknown wine.');
      if (topic.kind === 'question' && !topic.text.trim() && topic.intent !== 'tonight') throw new Error('Ask a question first.');

      const d: Debate = {
        id: nextId('debate'),
        topic,
        title: debateTitle(topic, getWines()),
        participants: participants.map((p) => ({ ...p!, memory: [...p!.memory] })),
        messages: [],
        status: 'speaking',
        speakingPersonaId: null,
        verdict: null,
        round: 0,
        createdAt: now(),
      };
      setSommelierState((s) => ({ ...s, debates: [d, ...s.debates] }));
      void runRound(d.id, d.participants, null);
      return d;
    },

    async continueDebate(debateId) {
      fail();
      const d = debate(debateId);
      assertCanSpeak(d);
      await runRound(debateId, d.participants, null);
    },

    async sendMessage(debateId, text) {
      fail();
      const body = text.trim();
      if (!body) throw new Error('Write something first.');
      const d = debate(debateId);
      assertCanSpeak(d);
      updateDebate(debateId, (x) => ({
        ...x,
        messages: [...x.messages, { id: nextId('msg'), author: { kind: 'user' }, text: body, streaming: false }],
      }));
      // Remember stated preferences for every sommelier at the table (newest first, at most 10).
      const pref = extractPreference(body);
      if (pref) {
        const ids = new Set(d.participants.map((p) => p.id));
        setSommelierState((s) => ({
          ...s,
          personas: s.personas.map((p) => (ids.has(p.id) ? { ...p, memory: [pref, ...p.memory.filter((m) => m !== pref)].slice(0, 10) } : p)),
        }));
      }
      const mentioned = mentionedPersonas(body, d.participants);
      const speakers = mentioned.length ? d.participants.filter((p) => mentioned.includes(p.id)) : d.participants;
      await runRound(debateId, speakers, body);
    },

    async endDebate(debateId) {
      const d = debate(debateId);
      const picks = d.participants.flatMap((p) => {
        const last = [...d.messages].reverse().find((m) => m.author.kind === 'persona' && m.author.personaId === p.id && m.wineIds?.length);
        return last?.wineIds ? [{ personaId: p.id, wineId: last.wineIds[0] }] : [];
      });
      const verdict = computeVerdict({ topic: d.topic, participants: d.participants, wines: getWines(), picks });
      updateDebate(debateId, (x) => ({ ...x, status: 'ended', speakingPersonaId: null, verdict }));
    },

    async deleteDebate(debateId) {
      updateDebate(debateId, (x) => ({ ...x, status: 'ended' }));
      setSommelierState((s) => ({ ...s, debates: s.debates.filter((x) => x.id !== debateId) }));
    },
  };
}

export const sommelierRepository: SommelierRepository = createMockSommelierRepository();
