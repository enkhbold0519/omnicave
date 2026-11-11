/**
 * Sommelier debate model. A persona is data (traits + memory); with a backend, one LLM speaks for every
 * persona by building its prompt from these fields. The mock engine reads the same fields.
 */

export type ScoringScale = 'hundred' | 'twenty' | 'stars';
export type RegionFocus = 'old-world' | 'new-world' | 'everywhere';
export type Tone = 'formal' | 'warm' | 'playful' | 'blunt';
/** What a persona values in a wine; 1–3 per persona. */
export type Love = 'power' | 'elegance' | 'acidity' | 'oak' | 'fruit' | 'age' | 'value' | 'terroir';
/** 1 = generous, 5 = strict. */
export type Strictness = 1 | 2 | 3 | 4 | 5;

export interface PersonaTraits {
  scoring: ScoringScale;
  focus: RegionFocus;
  loves: Love[];
  strictness: Strictness;
  tone: Tone;
  /** Free text: becomes part of the persona's prompt with a real LLM. */
  description: string;
}

export interface Persona {
  id: string;
  name: string;
  /** Short role shown under the name, e.g. "The Classicist". */
  title: string;
  /** Index into the avatar color list (personaColors). */
  colorIndex: number;
  traits: PersonaTraits;
  /** What this persona has learned about the user, newest first. */
  memory: string[];
  builtIn: boolean;
}

export type PersonaInput = Pick<Persona, 'name' | 'title' | 'colorIndex' | 'traits'>;

export const TABLE_MIN = 2;
export const TABLE_MAX = 5;

export type DebateTopic =
  | { kind: 'wine'; wineId: string }
  /** `tonight`: what to open now · `pairing`: a meal · `open`: anything else. */
  | { kind: 'question'; intent: 'tonight' | 'pairing' | 'open'; text: string };

export type TagKind = 'fruit' | 'earth' | 'structure' | 'oak' | 'freshness' | 'sweetness';

export interface TastingTag {
  label: string;
  kind: TagKind;
}

export interface Score {
  /** 0–100, for comparing across scales. */
  normalized: number;
  /** As the persona would write it: "94", "17.5/20", "★★★★". */
  label: string;
}

export type MessageAuthor = { kind: 'persona'; personaId: string } | { kind: 'user' };

export interface DebateMessage {
  id: string;
  author: MessageAuthor;
  /** Grows while streaming. */
  text: string;
  streaming: boolean;
  tags?: TastingTag[];
  score?: Score;
  /** Bottles this message recommends (question topics). */
  wineIds?: string[];
}

export type Verdict =
  | {
      kind: 'wine';
      wineId: string;
      scores: { personaId: string; score: Score; peakYear: number }[];
      agreement: 'consensus' | 'split';
    }
  | { kind: 'question'; picks: { personaId: string; wineId: string }[] };

export type DebateStatus = 'speaking' | 'awaitingUser' | 'ended';

export interface Debate {
  id: string;
  topic: DebateTopic;
  title: string;
  /** Snapshots, so a debate still reads correctly if a persona is later edited or deleted. */
  participants: Persona[];
  messages: DebateMessage[];
  status: DebateStatus;
  /** Who is "typing" between messages while status is `speaking`. */
  speakingPersonaId: string | null;
  verdict: Verdict | null;
  /** General rounds started so far (replies to the user don't count). */
  round: number;
  createdAt: Date;
}

/**
 * The client contract. With a backend: REST for personas and debate creation, a WebSocket/SSE stream for
 * messages. Streaming updates land in the shared sommelier store, which screens subscribe to.
 */
export interface SommelierRepository {
  listPersonas(): Promise<Persona[]>;
  createPersona(input: PersonaInput): Promise<Persona>;
  updatePersona(id: string, input: PersonaInput): Promise<Persona>;
  deletePersona(id: string): Promise<void>;
  restoreDefaultPersonas(): Promise<void>;
  clearPersonaMemory(id: string): Promise<void>;

  /** Creates the debate and starts the first round (each participant speaks once). */
  startDebate(input: { topic: DebateTopic; personaIds: string[] }): Promise<Debate>;
  /** Another round: each participant speaks once more. */
  continueDebate(debateId: string): Promise<void>;
  /** The user joins in; @mentioned personas answer, otherwise everyone does. */
  sendMessage(debateId: string, text: string): Promise<void>;
  endDebate(debateId: string): Promise<void>;
  deleteDebate(debateId: string): Promise<void>;
}
