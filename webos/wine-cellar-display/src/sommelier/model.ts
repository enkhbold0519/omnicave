import { useCallback, useEffect, useRef, useState } from 'react'
import { OfflineError, safeGet, safeSet, stream } from '../api'
import type { Bottle, Persona, StreamEvent } from '../types'

/** Same model as the Android Sommelier: a table of 2–5 sommeliers discusses a wine or a question. */
export const TABLE_MIN = 2
export const TABLE_MAX = 5

export type Intent = 'tonight' | 'pairing' | 'open'
export type Topic =
  | { kind: 'wine'; bottle_id: number; title: string }
  | { kind: 'question'; intent: Intent; text: string; title: string }

export interface Message {
  id: string
  speaker: 'user' | string
  text: string
  streaming?: boolean
  pick?: Bottle
}

export interface Tasting {
  id: string
  topic: Topic
  personaIds: string[]
  /** name and colour at the time, so old conversations still render if a sommelier is deleted */
  people: Record<string, { name: string; title: string; color: string }>
  messages: Message[]
  ended: boolean
  createdAt: number
}

/* ---------- conversations are kept on this display (like the phone keeps its own) ---------- */
const KEY = 'wc.tastings'
export function loadTastings(): Tasting[] {
  try { return JSON.parse(safeGet(KEY) ?? '[]') as Tasting[] } catch { return [] }
}
export function saveTasting(t: Tasting) {
  const rest = loadTastings().filter(x => x.id !== t.id)
  safeSet(KEY, JSON.stringify([{ ...t, messages: t.messages.map(m => ({ ...m, streaming: false })) }, ...rest].slice(0, 12)))
}
export function deleteTastings() { safeSet(KEY, null) }

export function newTasting(topic: Topic, personas: Persona[]): Tasting {
  return {
    id: Date.now().toString(36), topic, personaIds: personas.map(p => p.id), messages: [], ended: false, createdAt: Date.now(),
    people: Object.fromEntries(personas.map(p => [p.id, { name: p.name, title: p.title, color: p.color }])),
  }
}

/* ---------- reading a sommelier's message ---------- */
export interface Parsed { body: string; score?: { label: string; normalized: number }; peak?: number }

/** Wine turns end with "Score: 94. Peak: 2028." — pulled out of the text and shown as a badge. */
export function parseMessage(text: string): Parsed {
  const m = text.match(/\n?\s*Score:\s*([^\n]+?)\.?\s*Peak:\s*(\d{4})\.?\s*$/i)
  const body = (m ? text.slice(0, m.index) : text).replace(/#\d+\s*[—:-]?\s*/g, '').trim()
  if (!m) return { body }
  const label = m[1].trim()
  return { body, score: { label, normalized: normalize(label) }, peak: Number(m[2]) }
}

function normalize(label: string): number {
  const stars = (label.match(/★/g) ?? []).length
  if (stars) return stars * 20
  const twenty = label.match(/([\d.]+)\s*\/\s*20/)
  if (twenty) return Number(twenty[1]) * 5
  const n = label.match(/\d+(\.\d+)?/)
  return n ? Number(n[0]) : 0
}

/* colour-coded tasting-note tags (paper: "colour-coded tasting note tags") */
export type TagKind = 'fruit' | 'earth' | 'structure' | 'oak' | 'freshness' | 'sweetness'
const TAG_WORDS: [TagKind, RegExp][] = [
  ['fruit', /\b(dark cherry|cherry|cassis|blackberry|plum|wild strawberry|strawberry|raspberry|citrus|lemon|green apple|apple|peach|pear|apricot|ripe fruit)\b/gi],
  ['earth', /\b(earthy spice|earthy|earth|chalky mineral|mineral|chalk|saline|truffle|leather|tobacco|herbal lift|spice)\b/gi],
  ['structure', /\b(firm tannin|tannin|tannins|structure|concentrated|full-bodied)\b/gi],
  ['oak', /\b(toasted oak|oak|cedar|vanilla|toast)\b/gi],
  ['freshness', /\b(bright acidity|crisp acidity|fresh acidity|acidity|freshness|crisp|fine mousse|lively)\b/gi],
  ['sweetness', /\b(honey|brioche|caramel|sweet)\b/gi],
]
export function tagsOf(text: string): { label: string; kind: TagKind }[] {
  const seen = new Set<string>(), out: { label: string; kind: TagKind }[] = []
  for (const [kind, re] of TAG_WORDS) {
    for (const m of text.matchAll(re)) {
      const l = m[0].toLowerCase()
      if (![...seen].some(s => s.includes(l) || l.includes(s))) { seen.add(l); out.push({ label: l, kind }) }
    }
  }
  return out.slice(0, 4)
}

/* ---------- the verdict (computed here from the conversation, like Android) ---------- */
export type Verdict =
  | { kind: 'wine'; scores: { personaId: string; label: string; normalized: number; peak: number }[]; agreement: 'consensus' | 'split' }
  | { kind: 'question'; picks: { personaId: string; bottle: Bottle }[] }

export function verdictOf(t: Tasting): Verdict {
  if (t.topic.kind === 'question') {
    const last = new Map<string, Bottle>()
    for (const m of t.messages) if (m.pick && m.speaker !== 'user') last.set(m.speaker, m.pick)
    return { kind: 'question', picks: t.personaIds.filter(id => last.has(id)).map(id => ({ personaId: id, bottle: last.get(id)! })) }
  }
  const scores: { personaId: string; label: string; normalized: number; peak: number }[] = []
  for (const id of t.personaIds) {
    const latest = [...t.messages].reverse().map(m => (m.speaker === id ? parseMessage(m.text) : null)).find(p => p?.score && p.peak)
    if (latest?.score && latest.peak) scores.push({ personaId: id, ...latest.score, peak: latest.peak })
  }
  const ns = scores.map(s => s.normalized)
  return { kind: 'wine', scores, agreement: ns.length > 1 && Math.max(...ns) - Math.min(...ns) > 6 ? 'split' : 'consensus' }
}

/* ---------- one round at the table ---------- */
export function useTable(tasting: Tasting | null, onChange: (t: Tasting) => void) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  const latest = useRef(tasting)
  latest.current = tasting

  const round = useCallback(async (opts: { userText?: string; mention?: string } = {}) => {
    const t0 = latest.current
    if (!t0) return
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setError(null); setRunning(true)
    let t: Tasting = opts.userText
      ? { ...t0, messages: [...t0.messages, { id: 'u' + Date.now(), speaker: 'user', text: opts.userText }] }
      : t0
    const history = t.messages.map(m => ({ speaker: m.speaker, text: m.text }))
    const update = (fn: (t: Tasting) => Tasting) => { t = fn(t); onChange(t) }
    update(x => x)
    const topic = t.topic.kind === 'wine'
      ? { kind: 'wine', bottle_id: t.topic.bottle_id }
      : { kind: 'question', intent: t.topic.intent, text: t.topic.text }
    const onEvent = (e: StreamEvent) => {
      if (c.signal.aborted) return
      switch (e.type) {
        case 'turn':
          update(x => ({ ...x, messages: [...x.messages, { id: e.persona + Date.now(), speaker: e.persona, text: '', streaming: true }] }))
          break
        case 'delta':
          update(x => ({ ...x, messages: x.messages.map((m, i) => i === x.messages.length - 1 ? { ...m, text: m.text + e.text } : m) }))
          break
        case 'pick':
          update(x => ({ ...x, messages: x.messages.map((m, i) => i === x.messages.length - 1 ? { ...m, pick: e.bottle } : m) }))
          break
        case 'turn_end':
          update(x => ({ ...x, messages: x.messages.map(m => m.streaming ? { ...m, streaming: false } : m) }))
          break
        case 'error': setError(e.message); break
      }
    }
    try {
      await stream('/api/ai/table', { topic, persona_ids: t.personaIds, history, mention: opts.mention }, onEvent, c.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof OfflineError ? 'The sommeliers need a connection.' : (e as Error).message)
    } finally {
      update(x => ({ ...x, messages: x.messages.map(m => m.streaming ? { ...m, streaming: false } : m) }))
      saveTasting(t)
      if (ctrl.current === c) setRunning(false)
    }
  }, [onChange])

  const stop = useCallback(() => { ctrl.current?.abort(); setRunning(false) }, [])
  useEffect(() => () => ctrl.current?.abort(), [])
  return { round, stop, running, error }
}
