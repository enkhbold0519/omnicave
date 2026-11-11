/**
 * Mock "LLM": writes each persona's lines from the wine's real data and the persona's traits.
 * Deterministic (seeded by IDs and round) so tests are stable. With a backend this whole file is replaced by
 * one LLM prompted with the same persona fields, memory and inventory context.
 */
import { drinkingState } from '../derive';
import type { Wine, WineStyle } from '../types';
import type { DebateTopic, Love, Persona, Score, ScoringScale, TastingTag, Verdict } from './types';

export interface Candidate {
  wine: Wine;
  /** e.g. "The Signature Cellar · Shelf 9, position 2" */
  location: string;
}

/** Stable pseudo-random number in [0, 1) for a key. */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}
const pick = <T,>(items: T[], key: string): T => items[Math.floor(seeded(key) * items.length)];

const OLD_WORLD = ['France', 'Italy', 'Spain', 'Germany', 'Austria', 'Hungary', 'Portugal'];
const PRESTIGE = ['Bordeaux', 'Burgundy', 'Champagne', 'Saint-Julien', 'Piedmont'];
const VALUE_REGIONS = ['Rioja', 'Mendoza', 'Kamptal', 'Mosel', 'Rías Baixas', 'Loire', 'Veneto', 'Provence'];
const has = (text: string, words: string[]) => words.some((w) => text.toLowerCase().includes(w.toLowerCase()));
const isOldWorld = (w: Wine) => OLD_WORLD.includes(w.country);

// ── Scoring ──────────────────────────────────────────────────────────────────────────────────────

const loveBonus: Record<Love, (w: Wine) => number> = {
  power: (w) => (w.style === 'Red' && has(w.grapes.join(' '), ['Cabernet', 'Syrah', 'Nebbiolo', 'Malbec', 'Mourvèdre', 'Corvina']) ? 2.5 : w.style === 'Red' ? 1 : -1),
  elegance: (w) => (has(w.grapes.join(' '), ['Pinot Noir', 'Chardonnay', 'Nebbiolo', 'Riesling']) || w.style === 'Sparkling' ? 2 : has(w.grapes.join(' '), ['Malbec', 'Corvina']) ? -1.5 : 0),
  acidity: (w) => (w.style === 'White' || w.style === 'Sparkling' || has(w.grapes.join(' '), ['Riesling', 'Nebbiolo', 'Sangiovese', 'Furmint']) ? 2 : w.style === 'Red' ? -0.5 : 0),
  oak: (w) => (has(w.grapes.join(' '), ['Cabernet', 'Tempranillo']) || has(w.name, ['Meursault']) ? 2 : has(w.grapes.join(' '), ['Albariño', 'Riesling', 'Sauvignon Blanc']) ? -1 : 0),
  fruit: (w) => (!isOldWorld(w) || w.style === 'Rosé' || has(w.grapes.join(' '), ['Malbec', 'Grenache']) ? 2 : 0),
  age: (w) => (w.drinkUntil - w.vintage >= 20 ? 2.5 : w.drinkUntil - w.vintage <= 6 ? -1.5 : 0.5),
  value: (w) => (has(w.region, VALUE_REGIONS) ? 2.5 : has(w.region, PRESTIGE) ? -1.5 : 0.5),
  terroir: (w) => (isOldWorld(w) && has(w.region, ['Burgundy', 'Piedmont', 'Mosel', 'Northern Rhône', 'Saint-Julien', 'Chablis']) ? 2 : isOldWorld(w) ? 0.5 : -1),
};

export function formatScore(normalized: number, scale: ScoringScale): string {
  if (scale === 'hundred') return String(Math.round(normalized));
  if (scale === 'twenty') {
    const twenty = Math.round((12 + ((normalized - 80) / 19) * 7.5) * 2) / 2;
    return `${twenty.toFixed(1).replace('.0', '')}/20`;
  }
  const stars = Math.min(5, Math.max(3, Math.round((3 + ((normalized - 82) / 17) * 2) * 2) / 2));
  return '★'.repeat(Math.floor(stars)) + (stars % 1 ? '½' : '');
}

export function scoreWine(persona: Persona, wine: Wine): Score {
  const { loves, focus, strictness, scoring } = persona.traits;
  let n = 88 + seeded(`${wine.id}`) * 6;
  for (const love of loves) n += loveBonus[love](wine);
  if (focus === 'old-world') n += isOldWorld(wine) ? 1 : -2;
  if (focus === 'new-world') n += isOldWorld(wine) ? -1.5 : 1.5;
  n -= (strictness - 3) * 1.3;
  n += (seeded(`${persona.id}|${wine.id}`) - 0.5) * 2;
  const normalized = Math.round(Math.min(99, Math.max(80, n)));
  return { normalized, label: formatScore(normalized, scoring) };
}

// ── Tasting notes ────────────────────────────────────────────────────────────────────────────────

const grapeTags: [string, TastingTag[]][] = [
  ['Nebbiolo', [{ label: 'rose petal', kind: 'fruit' }, { label: 'tar', kind: 'earth' }, { label: 'firm tannin', kind: 'structure' }]],
  ['Cabernet', [{ label: 'blackcurrant', kind: 'fruit' }, { label: 'cedar', kind: 'oak' }, { label: 'fine tannin', kind: 'structure' }]],
  ['Tempranillo', [{ label: 'dried cherry', kind: 'fruit' }, { label: 'vanilla', kind: 'oak' }, { label: 'leather', kind: 'earth' }]],
  ['Sangiovese', [{ label: 'sour cherry', kind: 'fruit' }, { label: 'leather', kind: 'earth' }, { label: 'bright acidity', kind: 'freshness' }]],
  ['Pinot Noir', [{ label: 'raspberry', kind: 'fruit' }, { label: 'forest floor', kind: 'earth' }, { label: 'silky', kind: 'structure' }]],
  ['Syrah', [{ label: 'blackberry', kind: 'fruit' }, { label: 'smoke', kind: 'earth' }, { label: 'black pepper', kind: 'earth' }]],
  ['Malbec', [{ label: 'plum', kind: 'fruit' }, { label: 'violet', kind: 'fruit' }, { label: 'plush', kind: 'structure' }]],
  ['Mourvèdre', [{ label: 'garrigue', kind: 'earth' }, { label: 'dark fruit', kind: 'fruit' }, { label: 'grip', kind: 'structure' }]],
  ['Corvina', [{ label: 'raisin', kind: 'fruit' }, { label: 'mocha', kind: 'oak' }, { label: 'full body', kind: 'structure' }]],
  ['Chardonnay', [{ label: 'citrus', kind: 'fruit' }, { label: 'hazelnut', kind: 'oak' }, { label: 'mineral', kind: 'freshness' }]],
  ['Riesling', [{ label: 'lime', kind: 'fruit' }, { label: 'slate', kind: 'earth' }, { label: 'racy acidity', kind: 'freshness' }]],
  ['Sauvignon Blanc', [{ label: 'gooseberry', kind: 'fruit' }, { label: 'flint', kind: 'earth' }, { label: 'zesty', kind: 'freshness' }]],
  ['Grüner', [{ label: 'green apple', kind: 'fruit' }, { label: 'white pepper', kind: 'earth' }, { label: 'crisp', kind: 'freshness' }]],
  ['Albariño', [{ label: 'peach', kind: 'fruit' }, { label: 'sea spray', kind: 'freshness' }, { label: 'saline', kind: 'earth' }]],
  ['Sémillon', [{ label: 'apricot', kind: 'fruit' }, { label: 'honey', kind: 'sweetness' }, { label: 'saffron', kind: 'earth' }]],
  ['Furmint', [{ label: 'apricot', kind: 'fruit' }, { label: 'honey', kind: 'sweetness' }, { label: 'bright acidity', kind: 'freshness' }]],
];

const styleTags: Record<WineStyle, TastingTag[]> = {
  Red: [{ label: 'dark fruit', kind: 'fruit' }, { label: 'tannin', kind: 'structure' }],
  White: [{ label: 'citrus', kind: 'fruit' }, { label: 'fresh', kind: 'freshness' }],
  Rosé: [{ label: 'strawberry', kind: 'fruit' }, { label: 'herbs', kind: 'earth' }, { label: 'crisp', kind: 'freshness' }],
  Sparkling: [{ label: 'brioche', kind: 'oak' }, { label: 'green apple', kind: 'fruit' }, { label: 'fine bubbles', kind: 'freshness' }],
  Dessert: [{ label: 'apricot', kind: 'fruit' }, { label: 'honey', kind: 'sweetness' }, { label: 'marmalade', kind: 'sweetness' }],
};

const loveKinds: Partial<Record<Love, TastingTag['kind']>> = { power: 'structure', oak: 'oak', acidity: 'freshness', fruit: 'fruit', terroir: 'earth', elegance: 'freshness' };

/** 2–3 notes for the wine, ordered by what this persona cares about. */
export function tastingTags(persona: Persona, wine: Wine): TastingTag[] {
  const fromGrapes = grapeTags.filter(([g]) => wine.grapes.some((x) => x.includes(g))).flatMap(([, t]) => t);
  const pool = [...fromGrapes, ...styleTags[wine.style]].filter((t, i, all) => all.findIndex((x) => x.label === t.label) === i);
  const favored = persona.traits.loves.map((l) => loveKinds[l]).filter(Boolean);
  // What they value most comes first; notes they don't care about go last.
  const rank = (kind: TastingTag['kind']) => {
    const i = favored.indexOf(kind);
    return i < 0 ? favored.length : i;
  };
  const ranked = [...pool].sort((a, b) => rank(a.kind) - rank(b.kind));
  return ranked.slice(0, 3);
}

// ── Lines ────────────────────────────────────────────────────────────────────────────────────────

const openers: Record<Persona['traits']['tone'], ((w: Wine) => string)[]> = {
  formal: [(w) => `Let me be precise about the ${w.vintage} ${w.name}.`, (w) => `The ${w.name} deserves a serious hearing.`],
  warm: [(w) => `Ah, the ${w.name}. I've been looking forward to this one.`, (w) => `What a lovely bottle to talk about.`],
  playful: [(w) => `Okay, ${w.name} ${w.vintage}! Let's have some fun.`, () => `Right, my turn, and I'm not wearing a tie.`],
  blunt: [(w) => `${w.name}, ${w.vintage}. Here's my take.`, () => `I'll keep it short.`],
};

const observations: Record<Love, (w: Wine) => string> = {
  power: (w) => `There's real concentration here: ${w.grapes.join(' and ')} with depth and a structure built to last.`,
  elegance: (w) => `What I admire is the poise. ${w.grapes[0]} that doesn't shout; it lingers.`,
  acidity: () => `The acidity is the spine. It keeps everything bright and makes you want another sip.`,
  oak: (w) => (has(w.grapes.join(' '), ['Riesling', 'Albariño', 'Sauvignon Blanc']) ? `There's barely any oak, and I miss the extra dimension it brings.` : `The oak is well judged, framing the fruit instead of burying it.`),
  fruit: () => `The fruit is generous and immediate. This is pleasure first, analysis second.`,
  age: (w) => (w.drinkUntil - w.vintage >= 20 ? `This is built for decades; the best is still ahead of it.` : `It won't reward long cellaring, so don't treat it as a trophy.`),
  value: (w) => (has(w.region, PRESTIGE) ? `It's lovely, but part of what you pay for is the name on the label.` : `For what it usually costs, this over-delivers. That's my kind of bottle.`),
  terroir: (w) => (isOldWorld(w) ? `You can taste ${w.region} in it. A clear sense of place.` : `It's well made, but it could come from anywhere warm.`),
};

function drinkingAdvice(w: Wine, now: Date): string {
  const state = drinkingState(w, now);
  if (state === 'hold') return `Hold it until ${w.drinkFrom}; opening it now would waste it.`;
  if (state === 'past') return `Open it soon. It's past its best window.`;
  return `It's in its window now, through ${w.drinkUntil}. ${w.note}`;
}

function reaction(prev: { persona: Persona; score: Score } | null, mine: Score): string {
  if (!prev) return '';
  const diff = mine.normalized - prev.score.normalized;
  const first = prev.persona.name.split(' ')[0];
  if (Math.abs(diff) <= 1) return `I'm with ${first} on this. `;
  if (diff <= -3) return `I can't follow ${first} all the way to ${prev.score.label}. `;
  if (diff >= 3) return `${first} is underselling it. `;
  return `${first} is half right. `;
}

export interface WineTurn {
  text: string;
  tags: TastingTag[];
  score: Score;
}

/** A persona's turn on a wine. Round 1 is the verdict; later rounds pick a new angle. */
export function composeWineTurn(input: {
  persona: Persona;
  wine: Wine;
  round: number;
  previous: { persona: Persona; score: Score } | null;
  now: Date;
}): WineTurn {
  const { persona, wine, round, previous, now } = input;
  const key = `${persona.id}|${wine.id}|${round}`;
  const score = scoreWine(persona, wine);
  const tags = tastingTags(persona, wine);
  const loves = persona.traits.loves;

  if (round === 1) {
    const memory = persona.memory[0] ? `You mentioned that ${persona.memory[0].replace(/^You /, 'you ')}, so keep that in mind. ` : '';
    const text = [
      reaction(previous, score) + pick(openers[persona.traits.tone], key)(wine),
      observations[loves[0] ?? 'fruit'](wine),
      loves[1] ? observations[loves[1]](wine) : '',
      memory + drinkingAdvice(wine, now),
      `My score: ${score.label}.`,
    ]
      .filter(Boolean)
      .join(' ');
    return { text, tags, score };
  }

  const peak = peakYear(persona, wine);
  const angles = [
    () => `On serving: ${wine.style === 'Red' ? 'around 16 °C, and give it time in a decanter' : wine.style === 'Sparkling' ? 'well chilled, 6 to 8 °C, in a tulip glass' : 'cool but not icy, around 10 °C'}. That matters more than people think.`,
    () => `If you want my real prediction: it peaks around ${peak}. ${peak > now.getFullYear() + 3 ? 'Patience will pay.' : 'Not long to wait.'}`,
    () => `At the table, I'd pair it with ${pairingFor(wine)}.`,
    () => (previous ? `${reaction(previous, score)}We value different things, and that's the point of this table.` : `I'll stand by my ${score.label}.`),
    () => observations[loves[round % loves.length] ?? 'fruit'](wine),
  ];
  const a = angles[(round + Math.floor(seeded(key) * angles.length)) % angles.length]();
  return { text: a, tags: [], score };
}

export function peakYear(persona: Persona, wine: Wine): number {
  const loves = persona.traits.loves;
  const f = loves.includes('age') ? 0.7 : loves.includes('power') ? 0.6 : loves.includes('fruit') ? 0.3 : 0.45;
  return Math.round(wine.drinkFrom + (wine.drinkUntil - wine.drinkFrom) * f);
}

export function pairingFor(w: Wine): string {
  const g = w.grapes.join(' ');
  if (w.style === 'Sparkling') return 'oysters, tempura or a wedge of aged Comté';
  if (w.style === 'Dessert') return 'blue cheese or a tarte tatin';
  if (w.style === 'Rosé') return 'grilled fish with herbs or a Niçoise salad';
  if (has(g, ['Riesling'])) return 'Thai green curry or anything with a little heat';
  if (w.style === 'White') return has(g, ['Chardonnay']) ? 'roast chicken or lobster with butter' : 'goat cheese, shellfish or a light pasta';
  if (has(g, ['Nebbiolo'])) return 'mushroom risotto or truffle pasta';
  if (has(g, ['Pinot Noir'])) return 'duck breast or roast mushrooms';
  if (has(g, ['Malbec', 'Cabernet'])) return 'a grilled ribeye';
  if (has(g, ['Sangiovese'])) return 'roast lamb or a tomato-based ragù';
  return 'braised beef or a hearty stew';
}

// ── Question topics (what to open, meal pairing) ─────────────────────────────────────────────────

const mealPreferences: [string[], (w: Wine) => boolean, string][] = [
  [['lamb', 'beef', 'steak', 'ribeye', 'burger', 'bbq', 'barbecue'], (w) => w.style === 'Red', 'red meat wants tannin and depth'],
  [['duck', 'mushroom', 'truffle', 'risotto'], (w) => w.style === 'Red' && has(w.grapes.join(' '), ['Pinot', 'Nebbiolo', 'Sangiovese']), 'earthy flavours love an earthy red'],
  [['fish', 'oyster', 'shellfish', 'seafood', 'sushi', 'salmon', 'lobster'], (w) => w.style === 'White' || w.style === 'Sparkling', 'seafood needs freshness and salinity'],
  [['chicken', 'pork', 'turkey'], (w) => w.style === 'White' || (w.style === 'Red' && has(w.grapes.join(' '), ['Pinot'])), 'white meat suits a rounder white or a light red'],
  [['spicy', 'curry', 'thai', 'chili', 'szechuan'], (w) => has(w.grapes.join(' '), ['Riesling', 'Grüner']) || w.style === 'Rosé', 'heat calls for a touch of sweetness or a cool, crisp wine'],
  [['cheese', 'dessert', 'cake', 'tart', 'chocolate'], (w) => w.style === 'Dessert' || w.style === 'Sparkling', 'sweet things need a wine at least as sweet'],
  [['pasta', 'pizza', 'tomato'], (w) => w.style === 'Red' && has(w.grapes.join(' '), ['Sangiovese', 'Nebbiolo', 'Tempranillo', 'Grenache']), 'tomato needs a red with bright acidity'],
];

export function mealMatch(text: string): { test: (w: Wine) => boolean; reason: string } | null {
  const hit = mealPreferences.find(([words]) => has(text, words));
  return hit ? { test: hit[1], reason: hit[2] } : null;
}

export interface QuestionTurn {
  text: string;
  wineIds: string[];
  score: Score | null;
}

/** A persona picks a bottle from the user's cellar for the question, avoiding bottles already picked. */
export function composeQuestionTurn(input: {
  persona: Persona;
  topic: Extract<DebateTopic, { kind: 'question' }>;
  round: number;
  candidates: Candidate[];
  taken: Set<string>;
  previous: { persona: Persona; score: Score } | null;
  now: Date;
}): QuestionTurn {
  const { persona, topic, round, candidates, taken, previous, now } = input;
  const key = `${persona.id}|${topic.text}|${round}`;
  const opener = pick(
    { formal: ['Allow me.', 'My recommendation is clear.'], warm: ['Here is what I would do.', 'Let me suggest something.'], playful: ['Ooh, good one.', 'Easy!'], blunt: ['Simple.', 'One bottle.'] }[persona.traits.tone],
    key,
  );
  if (candidates.length === 0) {
    return { text: `${opener} Your cellar is empty right now, so I can't pick a bottle. Add a few and ask me again.`, wineIds: [], score: null };
  }

  const meal = topic.intent === 'pairing' ? mealMatch(topic.text) : null;
  const ready = candidates.filter((c) => drinkingState(c.wine, now) === 'ready');
  let pool = (ready.length ? ready : candidates).filter((c) => !meal || meal.test(c.wine));
  if (pool.length === 0) pool = ready.length ? ready : candidates;
  const fresh = pool.filter((c) => !taken.has(c.wine.id));
  const ranked = (fresh.length ? fresh : pool)
    .map((c) => ({ c, s: scoreWine(persona, c.wine) }))
    .sort((a, b) => b.s.normalized - a.s.normalized);
  const choice = ranked[Math.min(round - 1, ranked.length - 1)];
  const { wine, location } = choice.c;

  const why =
    topic.intent === 'pairing'
      ? meal
        ? `${meal.reason[0].toUpperCase()}${meal.reason.slice(1)}, and this fits.`
        : `It's versatile enough for most dishes.`
      : drinkingState(wine, now) === 'ready'
        ? `It's right in its drinking window.`
        : `It's the closest to ready of what you have.`;
  const reacted = previous ? `${previous.persona.name.split(' ')[0]} made a fair choice, but ` : '';
  const text = [
    `${opener} ${reacted}${reacted ? 'from' : 'From'} your cellar I'd open the ${wine.name} ${wine.vintage}.`,
    why,
    observations[persona.traits.loves[0] ?? 'fruit'](wine),
    `You'll find it in ${location}.`,
  ].join(' ');
  return { text, wineIds: [wine.id], score: choice.s };
}

// ── Replies to the user ──────────────────────────────────────────────────────────────────────────

/** A one-line memory if the user states a preference, e.g. "You love Riesling". */
export function extractPreference(text: string): string | null {
  const m = text.match(/\bI\s+(really\s+)?(love|like|prefer|enjoy|hate|dislike|don'?t like|can'?t stand)\s+([^.!?]{2,60})/i);
  if (!m) return null;
  const verb = m[2].toLowerCase().replace("dont", "don't").replace("cant", "can't");
  return `You ${verb} ${m[3].trim()}`;
}

/** Persona IDs @mentioned by first name or full name. */
export function mentionedPersonas(text: string, personas: Persona[]): string[] {
  return personas
    .filter((p) => {
      const first = p.name.split(' ')[0];
      return new RegExp(`@(${escapeRe(p.name)}|${escapeRe(first)})\\b`, 'i').test(text);
    })
    .map((p) => p.id);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function composeReply(input: { persona: Persona; userText: string; wine: Wine | null; now: Date }): string {
  const { persona, userText, wine, now } = input;
  const key = `${persona.id}|${userText}`;
  const ack = pick({ formal: ['A fair point.', 'Allow me to answer.'], warm: ['I love that you asked.', 'Good question.'], playful: ['Ha, okay!', 'Ooh.'], blunt: ['Sure.', 'Fine.'] }[persona.traits.tone], key);
  const pref = extractPreference(userText);
  const meal = mealMatch(userText);

  if (pref) return `${ack} Noted: ${pref.replace(/^You /, 'you ')}. I'll remember that when I recommend bottles.`;
  if (!wine) {
    if (meal) return `${ack} For that, ${meal.reason}. I'd stay with my pick, or ask me about a specific bottle.`;
    return `${ack} Tell me what you're eating or which bottle you're curious about, and I'll be specific.`;
  }
  if (meal) return `${ack} With that, ${meal.test(wine) ? `the ${wine.name} works, because ${meal.reason}.` : `honestly, the ${wine.name} isn't ideal: ${meal.reason}. I'd keep it for ${pairingFor(wine)}.`}`;
  if (has(userText, ['why', 'explain', 'simple', 'mean'])) {
    const s = scoreWine(persona, wine);
    return `${ack} In plain terms: I care most about ${persona.traits.loves.map((l) => l.replace('acidity', 'freshness')).join(' and ')}, and this wine ${s.normalized >= 92 ? 'delivers on that' : 'only partly delivers'}. That's why it gets ${s.label} from me.`;
  }
  if (has(userText, ['price', 'cost', 'worth', 'value', 'expensive', 'cheap'])) return `${ack} ${observations.value(wine)}`;
  if (has(userText, ['when', 'open', 'drink', 'age', 'ready', 'keep'])) return `${ack} ${drinkingAdvice(wine, now)} My guess for its peak: ${peakYear(persona, wine)}.`;
  if (has(userText, ['food', 'eat', 'pair', 'dinner', 'dish'])) return `${ack} I'd pair it with ${pairingFor(wine)}.`;
  return `${ack} ${observations[persona.traits.loves[0] ?? 'fruit'](wine)} I stand by ${scoreWine(persona, wine).label}.`;
}

// ── Titles and verdicts ──────────────────────────────────────────────────────────────────────────

export function debateTitle(topic: DebateTopic, wines: Wine[]): string {
  if (topic.kind === 'wine') {
    const w = wines.find((x) => x.id === topic.wineId);
    return w ? `${w.name} ${w.vintage}` : 'A wine';
  }
  if (topic.intent === 'tonight') return 'What to open tonight';
  if (topic.intent === 'pairing') return `Pairing: ${topic.text}`;
  return topic.text;
}

export function computeVerdict(input: {
  topic: DebateTopic;
  participants: Persona[];
  wines: Wine[];
  picks: { personaId: string; wineId: string }[];
}): Verdict | null {
  const { topic, participants, wines, picks } = input;
  if (topic.kind === 'question') return { kind: 'question', picks };
  const wine = wines.find((w) => w.id === topic.wineId);
  if (!wine) return null;
  const scores = participants.map((p) => ({ personaId: p.id, score: scoreWine(p, wine), peakYear: peakYear(p, wine) }));
  const values = scores.map((s) => s.score.normalized);
  return { kind: 'wine', wineId: wine.id, scores, agreement: Math.max(...values) - Math.min(...values) <= 4 ? 'consensus' : 'split' };
}
