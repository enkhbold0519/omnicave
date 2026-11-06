import type { Love, Persona, RegionFocus, ScoringScale, Strictness, Tone } from './types';

/** Avatar backgrounds. Deep, muted hues that keep white initials at ≥4.5:1 in both themes. */
export const personaColors = ['#7A3340', '#2F5D50', '#3E4F7A', '#7A5A2B', '#5B3F6E', '#2E6070', '#6B4A3A', '#4A4F55'] as const;

export const loveLabels: Record<Love, string> = {
  power: 'Power',
  elegance: 'Elegance',
  acidity: 'Freshness',
  oak: 'Oak',
  fruit: 'Ripe fruit',
  age: 'Ageing',
  value: 'Value',
  terroir: 'Terroir',
};

export const toneLabels: Record<Tone, string> = { formal: 'Formal', warm: 'Warm', playful: 'Playful', blunt: 'Blunt' };
export const focusLabels: Record<RegionFocus, string> = { 'old-world': 'Old World', 'new-world': 'New World', everywhere: 'Everywhere' };
export const scaleLabels: Record<ScoringScale, string> = { hundred: '100 points', twenty: '20 points', stars: '5 stars' };
export const strictnessLabels: Record<Strictness, string> = { 1: 'Generous', 2: 'Kind', 3: 'Balanced', 4: 'Exacting', 5: 'Severe' };

/**
 * The three default sommeliers. Fictional people; their styles echo well-known schools of wine criticism
 * (big-scoring "power" critics, Old World purists, value-minded writers) without speaking for anyone real.
 */
export const builtInPersonas: Persona[] = [
  {
    id: 'persona-victor',
    name: 'Victor Hale',
    title: 'The Classicist',
    colorIndex: 0,
    builtIn: true,
    memory: [],
    traits: {
      scoring: 'hundred',
      focus: 'everywhere',
      loves: ['power', 'oak', 'age'],
      strictness: 2,
      tone: 'formal',
      description:
        'Grew up on Bordeaux and Napa. Rewards concentration, ripe fruit and long ageing potential, and gives big scores to big wines. Speaks with total confidence.',
    },
  },
  {
    id: 'persona-lucia',
    name: 'Lucia Moretti',
    title: 'The Purist',
    colorIndex: 1,
    builtIn: true,
    memory: [],
    traits: {
      scoring: 'twenty',
      focus: 'old-world',
      loves: ['acidity', 'elegance', 'terroir'],
      strictness: 4,
      tone: 'warm',
      description:
        'Burgundy and Piedmont at heart. Values freshness, transparency and a sense of place over power, and is suspicious of heavy oak.',
    },
  },
  {
    id: 'persona-sam',
    name: 'Sam Okafor',
    title: 'The Value Hunter',
    colorIndex: 2,
    builtIn: true,
    memory: [],
    traits: {
      scoring: 'stars',
      focus: 'everywhere',
      loves: ['fruit', 'value'],
      strictness: 3,
      tone: 'playful',
      description:
        'Cares whether a bottle is a joy to drink tonight and worth what it costs. Happy to champion an underdog and poke fun at prestige.',
    },
  },
];

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
